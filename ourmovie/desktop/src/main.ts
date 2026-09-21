import { app, BrowserWindow, ipcMain, session, WebContents, WebFrameMain } from 'electron';
import path from 'node:path';
import { io, Socket } from 'socket.io-client';

// Une seule fenêtre : navigation en haut (jamais interrompue), lecteur en bas
// (synchronisé au salon), panneau app à droite. Les deux <webview> sont distingués par
// leur `partition` (voir renderer/index.html) — Electron ne donne pas d'autre moyen
// fiable de savoir laquelle s'attache dans 'did-attach-webview'.
// La connexion Socket.IO vit dans ce process principal (survit à toute navigation dans
// l'une ou l'autre <webview>) — voir les commits précédents pour ce choix.

interface RoomState {
  roomCode: string;
  videoUrl: string | null;
  paused: boolean;
  position: number;
  participants: string[];
  queue: string[];
}

interface ChatMessage {
  from: string;
  message: string;
  ts: number;
}

interface DetectedVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
}

interface FrameVideoInfo {
  id: number;
  width: number;
  height: number;
  duration: number;
  paused: boolean;
  currentTime: number;
}

const BROWSE_PARTITION = 'persist:ourmovie-browse';
const PLAYER_PARTITION = 'persist:ourmovie-player';

let mainWindow: BrowserWindow;
let browseWebview: WebContents | null = null;
let playerWebview: WebContents | null = null;
let socket: Socket | null = null;
let lastState: RoomState | null = null;
let knownVideoUrl: string | null = null;
// URL à charger dans le lecteur dès qu'il s'attachera, s'il ne l'est pas encore
// (course possible juste après le démarrage de la fenêtre — cf. OURMOVIE-FIX-LOG.md).
let pendingPlayerUrl: string | null = null;
let pendingPlayerAutoFollow = false;

// --- Détection/contrôle dans les iframes (au-delà de la frame principale d'une page,
// couverte par preload-webview.ts) : un script injecté dans une page ne peut pas voir le
// DOM d'une iframe cross-origin (barrière de sécurité navigateur), mais Electron, hôte
// du moteur Chromium, le peut via WebFrameMain.executeJavaScript, quelle que soit
// l'origine de la frame. ---
const IFRAME_ID_BASE = 1_000_000;

const IFRAME_SCAN_SCRIPT = `(function() {
  function collect(root, into) {
    Array.prototype.forEach.call(root.querySelectorAll('video'), function(v) {
      if (into.indexOf(v) === -1) into.push(v);
    });
    Array.prototype.forEach.call(root.querySelectorAll('*'), function(el) {
      if (el.shadowRoot) collect(el.shadowRoot, into);
    });
  }
  var found = [];
  collect(document, found);
  window.__ourmovieVideos = found;
  return found.map(function(v, i) {
    return {
      id: i,
      width: v.videoWidth || v.clientWidth,
      height: v.videoHeight || v.clientHeight,
      duration: isFinite(v.duration) ? v.duration : 0,
      paused: v.paused,
      currentTime: v.currentTime
    };
  });
})()`;

function iframePollScript(index: number): string {
  return `(function() {
    var v = window.__ourmovieVideos && window.__ourmovieVideos[${index}];
    if (!v) return null;
    return { paused: v.paused, currentTime: v.currentTime };
  })()`;
}

function iframeControlScript(index: number, paused: boolean, position: number): string {
  return `(function() {
    var v = window.__ourmovieVideos && window.__ourmovieVideos[${index}];
    if (!v) return;
    if (Math.abs(v.currentTime - ${JSON.stringify(position)}) > 1.5) v.currentTime = ${JSON.stringify(position)};
    if (${JSON.stringify(paused)} && !v.paused) v.pause();
    if (!${JSON.stringify(paused)} && v.paused) v.play().catch(function(){});
  })()`;
}

async function listFramesVideos(contents: WebContents): Promise<{ frames: WebFrameMain[]; videos: DetectedVideo[] }> {
  const frames = contents.mainFrame.framesInSubtree.filter((f) => f !== contents.mainFrame);
  const videos: DetectedVideo[] = [];
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    try {
      const info = (await frames[frameIndex].executeJavaScript(IFRAME_SCAN_SCRIPT)) as FrameVideoInfo[] | null;
      if (!info) continue;
      for (const v of info) {
        videos.push({ id: IFRAME_ID_BASE + frameIndex * 1000 + v.id, width: v.width, height: v.height, duration: v.duration });
      }
    } catch {
      // frame détachée/en cours de navigation entre deux scans — ignorée pour ce tour
    }
  }
  return { frames, videos };
}

function decodeIframeId(id: number): { frameIndex: number; localIndex: number } | null {
  if (id < IFRAME_ID_BASE) return null;
  const rest = id - IFRAME_ID_BASE;
  return { frameIndex: Math.floor(rest / 1000), localIndex: rest % 1000 };
}

// --- Fenêtre navigation : détection (bouton "Maintenant" / "+ File d'attente") ---

let browseIframeList: WebFrameMain[] = [];
let browseMainFrameVideos: DetectedVideo[] = [];
let browseIframeVideos: DetectedVideo[] = [];

function sendDetectedVideos() {
  mainWindow?.webContents.send('videos-detected', [...browseMainFrameVideos, ...browseIframeVideos]);
}

async function scanBrowseIframes(): Promise<void> {
  if (!browseWebview) return;
  const { frames, videos } = await listFramesVideos(browseWebview);
  browseIframeList = frames;
  browseIframeVideos = videos;
  sendDetectedVideos();
}

function setSource(url: string) {
  if (!socket || url === knownVideoUrl) return;
  knownVideoUrl = url;
  socket.emit('set-source', { url });
}

// --- Lecteur : suivi automatique + lecture synchronisée (y compris dans une iframe) ---

let playerIframeShare: { frame: WebFrameMain; index: number } | null = null;
let playerIframePollTimer: ReturnType<typeof setInterval> | null = null;
let playerLastIframeState: { paused: boolean; currentTime: number } | null = null;
let suppressPlayerIframePoll = false;

function stopPlayerIframeShare() {
  if (playerIframePollTimer) clearInterval(playerIframePollTimer);
  playerIframePollTimer = null;
  playerIframeShare = null;
  playerLastIframeState = null;
}

async function pollPlayerIframeVideo() {
  if (!playerIframeShare || !socket) return;
  try {
    const result = (await playerIframeShare.frame.executeJavaScript(
      iframePollScript(playerIframeShare.index)
    )) as { paused: boolean; currentTime: number } | null;
    if (!result) return;
    if (suppressPlayerIframePoll || !playerLastIframeState) {
      playerLastIframeState = result;
      return;
    }
    if (result.paused !== playerLastIframeState.paused) {
      socket.emit(result.paused ? 'pause' : 'play', { position: result.currentTime });
    } else if (Math.abs(result.currentTime - playerLastIframeState.currentTime) > 1.5) {
      socket.emit('seek', { position: result.currentTime });
    }
    playerLastIframeState = result;
  } catch {
    // frame disparue entre deux sondages
  }
}

function applyRemoteToPlayerIframe(paused: boolean, position: number) {
  if (!playerIframeShare) return;
  suppressPlayerIframePoll = true;
  playerIframeShare.frame.executeJavaScript(iframeControlScript(playerIframeShare.index, paused, position)).catch(() => {});
  setTimeout(() => {
    suppressPlayerIframePoll = false;
  }, 300);
}

// Après navigation du lecteur : si la vidéo attendue n'est pas dans la frame principale
// (le preload ne l'aura pas trouvée), on cherche dans les iframes et on bascule sur le
// suivi par sondage si on la trouve là.
async function ensurePlayerFollowsIframeIfNeeded() {
  if (!playerWebview) return;
  await new Promise((r) => setTimeout(r, 1200)); // laisse le preload essayer la frame principale d'abord
  if (playerIframeShare) return; // déjà pris en charge
  const { frames, videos } = await listFramesVideos(playerWebview);
  if (videos.length === 0) return;
  const best = videos.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
  const decoded = decodeIframeId(best.id);
  if (!decoded) return;
  const frame = frames[decoded.frameIndex];
  if (!frame) return;
  playerIframeShare = { frame, index: decoded.localIndex };
  playerLastIframeState = null;
  if (lastState) applyRemoteToPlayerIframe(lastState.paused, lastState.position);
  playerIframePollTimer = setInterval(pollPlayerIframeVideo, 1000);
}

function navigatePlayerTo(url: string) {
  pendingPlayerAutoFollow = true;
  if (playerWebview) {
    playerWebview.loadURL(url).catch((err) => {
      pendingPlayerAutoFollow = false;
      console.error('[ourmovie] loadURL (lecteur) a échoué', err);
    });
  } else {
    pendingPlayerUrl = url;
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload-app.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const browseSession = session.fromPartition(BROWSE_PARTITION);
  const playerSession = session.fromPartition(PLAYER_PARTITION);

  mainWindow.webContents.on('did-attach-webview', (_event, contents) => {
    if (contents.session === browseSession) {
      browseWebview = contents;
      contents.on('did-finish-load', () => {
        browseMainFrameVideos = [];
        browseIframeVideos = [];
        void scanBrowseIframes();
      });
    } else if (contents.session === playerSession) {
      playerWebview = contents;
      // Le bouton plein écran natif d'un site (YouTube, etc.) déclenche l'API Fullscreen
      // HTML5 *dans* la page — sans ceci, ça restait coincé dans les 42% de hauteur du
      // panneau lecteur (bug réel signalé par l'utilisateur, "écran mal géré"). On
      // relaie l'événement au panneau app, qui fait vraiment passer le lecteur en plein
      // écran (voir renderer.ts).
      contents.on('enter-html-full-screen', () => {
        mainWindow.setFullScreen(true);
        mainWindow.webContents.send('player-fullscreen', true);
      });
      contents.on('leave-html-full-screen', () => {
        mainWindow.setFullScreen(false);
        mainWindow.webContents.send('player-fullscreen', false);
      });
      if (pendingPlayerUrl) {
        const url = pendingPlayerUrl;
        pendingPlayerUrl = null;
        contents.loadURL(url).catch((err) => {
          pendingPlayerAutoFollow = false;
          console.error('[ourmovie] loadURL (lecteur, en attente) a échoué', err);
        });
      }
      contents.on('did-finish-load', () => {
        stopPlayerIframeShare();
        if (pendingPlayerAutoFollow && lastState) {
          pendingPlayerAutoFollow = false;
          contents.send('enable-auto-follow', { paused: lastState.paused, position: lastState.position });
          void ensurePlayerFollowsIframeIfNeeded();
        }
      });
    }
  });

  setInterval(() => void scanBrowseIframes(), 2000);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('join-room', (_event, payload: { serverUrl: string; token: string; roomCode: string }) => {
  socket?.close();
  knownVideoUrl = null;
  lastState = null;
  stopPlayerIframeShare();

  socket = io(payload.serverUrl, { auth: { token: payload.token } });

  socket.on('connect', () => socket!.emit('join', { roomCode: payload.roomCode }));
  socket.on('connect_error', (err) => console.error('[ourmovie] connect_error', err.message));

  socket.on('state', (state: RoomState) => {
    lastState = state;
    mainWindow.webContents.send('sync-state', state);

    if (state.videoUrl && state.videoUrl !== knownVideoUrl) {
      // Nouvelle source (la nôtre ou celle de quelqu'un d'autre) : c'est le lecteur qui
      // navigue dessus, jamais la fenêtre de navigation — pour que chercher la
      // prochaine vidéo n'interrompe jamais la lecture en cours.
      knownVideoUrl = state.videoUrl;
      navigatePlayerTo(state.videoUrl);
    } else if (playerIframeShare) {
      applyRemoteToPlayerIframe(state.paused, state.position);
    } else {
      playerWebview?.send('apply-remote-playback', { paused: state.paused, position: state.position });
    }
  });

  socket.on('chat', (msg: ChatMessage) => mainWindow.webContents.send('chat-received', msg));
  socket.on('error', (err: { message: string }) => {
    mainWindow.webContents.send('sync-error', err.message);
  });
});

ipcMain.on('leave-room', () => {
  socket?.emit('leave');
  socket?.close();
  socket = null;
  lastState = null;
  knownVideoUrl = null;
  stopPlayerIframeShare();
});

ipcMain.on('send-chat', (_event, text: string) => {
  socket?.emit('chat', { message: text });
});

// Interaction locale avec une vidéo synchronisée (frame principale du lecteur).
ipcMain.on('local-video-event', (_event, payload: { type: 'play' | 'pause' | 'seek'; position: number }) => {
  if (!socket) return;
  socket.emit(payload.type, { position: payload.position });
});

// Fin naturelle d'une vidéo synchronisée : le serveur enchaîne avec la playlist s'il y a
// quelque chose en attente.
ipcMain.on('local-video-ended', () => {
  socket?.emit('video-ended');
});

// Vidéo choisie (frame principale) devenue source du salon — depuis le preload du
// lecteur (suivi auto) ou juste après un "play-now" ci-dessous.
ipcMain.on('local-video-source', (_event, url: string) => setSource(url));

ipcMain.on('videos-detected', (event, videos: DetectedVideo[]) => {
  if (event.sender !== browseWebview) return;
  browseMainFrameVideos = videos;
  sendDetectedVideos();
});

// "▶ Maintenant" : remplace tout de suite la source du salon.
ipcMain.on('play-now', (_event, videoId: number) => {
  if (videoId >= IFRAME_ID_BASE) {
    if (browseWebview) setSource(browseWebview.getURL());
  } else {
    browseWebview?.send('share-video', videoId);
    // Le preload renverra lui-même 'local-video-source' une fois attaché.
  }
});

// "+ File d'attente" : ajoute la page courante à la playlist, sans rien interrompre.
ipcMain.on('queue-video', (_event, _videoId: number) => {
  if (!socket || !browseWebview) return;
  socket.emit('queue-video', { url: browseWebview.getURL() });
});

// Bouton plein écran de l'app (fiable, indépendant du bouton plein écran du site —
// voir aussi enter/leave-html-full-screen ci-dessus pour le déclenchement automatique).
ipcMain.on('toggle-fullscreen', () => {
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  mainWindow.webContents.send('player-fullscreen', next);
});
