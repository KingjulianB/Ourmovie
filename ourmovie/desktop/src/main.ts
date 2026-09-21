import { app, BrowserWindow, ipcMain, WebContents, WebFrameMain } from 'electron';
import path from 'node:path';
import { io, Socket } from 'socket.io-client';

// Architecture : une fenêtre "navigation" (chercher la prochaine vidéo, jamais
// interrompue par la sync) + une fenêtre "théâtre" séparée et redimensionnable, qui
// affiche et synchronise la vidéo réellement partagée au salon. La connexion Socket.IO
// vit dans ce process principal (survit à toute navigation dans l'une ou l'autre
// fenêtre) — voir les commits précédents pour le détail de ce choix.

interface RoomState {
  roomCode: string;
  videoUrl: string | null;
  paused: boolean;
  position: number;
  participants: string[];
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

let mainWindow: BrowserWindow;
let theaterWindow: BrowserWindow | null = null;
let browseWebview: WebContents | null = null;
let theaterWebview: WebContents | null = null;
let socket: Socket | null = null;
let lastState: RoomState | null = null;
let knownVideoUrl: string | null = null;
// true si la prochaine navigation de la fenêtre théâtre est déclenchée par NOUS (suivi
// automatique d'une source partagée), pas par un clic utilisateur.
let pendingTheaterAutoFollow = false;

// --- Détection/contrôle dans les iframes ---
// Un script injecté dans une page ne peut pas voir le DOM d'une iframe cross-origin
// (barrière de sécurité navigateur) — mais Electron, hôte du moteur Chromium, le peut
// via WebFrameMain.executeJavaScript, quelle que soit l'origine de la frame. Utilisé à
// la fois pour lister les vidéos détectées (fenêtre navigation, bouton "Partager") et
// pour suivre automatiquement une vidéo d'iframe (fenêtre théâtre).
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

// --- Fenêtre navigation : détection + partage manuel (bouton "Partager") ---

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

function shareBrowseIframeVideo(videoId: number) {
  const decoded = decodeIframeId(videoId);
  if (!decoded) return;
  const frame = browseIframeList[decoded.frameIndex];
  if (!frame) return;
  if (browseWebview) setSource(browseWebview.getURL());
  // Le contrôle continu (play/pause/seek) de cette vidéo précise sera repris par la
  // fenêtre théâtre une fois qu'elle aura navigué dessus (voir suivi ci-dessous) — la
  // fenêtre navigation n'a pas besoin de sonder cette iframe en continu elle-même.
}

// --- Fenêtre théâtre : suivi automatique + lecture synchronisée ---

let theaterIframeShare: { frame: WebFrameMain; index: number } | null = null;
let theaterIframePollTimer: ReturnType<typeof setInterval> | null = null;
let theaterLastIframeState: { paused: boolean; currentTime: number } | null = null;
let suppressTheaterIframePoll = false;

function stopTheaterIframeShare() {
  if (theaterIframePollTimer) clearInterval(theaterIframePollTimer);
  theaterIframePollTimer = null;
  theaterIframeShare = null;
  theaterLastIframeState = null;
}

async function pollTheaterIframeVideo() {
  if (!theaterIframeShare || !socket) return;
  try {
    const result = (await theaterIframeShare.frame.executeJavaScript(
      iframePollScript(theaterIframeShare.index)
    )) as { paused: boolean; currentTime: number } | null;
    if (!result) return;
    if (suppressTheaterIframePoll || !theaterLastIframeState) {
      theaterLastIframeState = result;
      return;
    }
    if (result.paused !== theaterLastIframeState.paused) {
      socket.emit(result.paused ? 'pause' : 'play', { position: result.currentTime });
    } else if (Math.abs(result.currentTime - theaterLastIframeState.currentTime) > 1.5) {
      socket.emit('seek', { position: result.currentTime });
    }
    theaterLastIframeState = result;
  } catch {
    // frame disparue entre deux sondages
  }
}

function applyRemoteToTheaterIframe(paused: boolean, position: number) {
  if (!theaterIframeShare) return;
  suppressTheaterIframePoll = true;
  theaterIframeShare.frame.executeJavaScript(iframeControlScript(theaterIframeShare.index, paused, position)).catch(() => {});
  setTimeout(() => {
    suppressTheaterIframePoll = false;
  }, 300);
}

// Après navigation de la fenêtre théâtre : si la vidéo attendue n'est pas dans la frame
// principale (le preload ne l'aura pas trouvée), on cherche dans les iframes et on
// bascule sur le suivi par sondage si on la trouve là.
async function ensureTheaterFollowsIframeIfNeeded() {
  if (!theaterWebview) return;
  await new Promise((r) => setTimeout(r, 1200)); // laisse le preload de la frame principale essayer d'abord
  if (theaterIframeShare) return; // déjà pris en charge
  const { frames, videos } = await listFramesVideos(theaterWebview);
  if (videos.length === 0) return;
  const best = videos.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
  const decoded = decodeIframeId(best.id);
  if (!decoded) return;
  const frame = frames[decoded.frameIndex];
  if (!frame) return;
  theaterIframeShare = { frame, index: decoded.localIndex };
  theaterLastIframeState = null;
  if (lastState) applyRemoteToTheaterIframe(lastState.paused, lastState.position);
  theaterIframePollTimer = setInterval(pollTheaterIframeVideo, 1000);
}

function ensureTheaterWindow(): BrowserWindow {
  if (theaterWindow && !theaterWindow.isDestroyed()) return theaterWindow;
  theaterWindow = new BrowserWindow({
    width: 900,
    height: 620,
    title: 'Ourmovie — Lecture',
    webPreferences: { webviewTag: true, contextIsolation: true, nodeIntegration: false },
  });
  theaterWindow.loadFile(path.join(__dirname, 'theater', 'index.html'));

  theaterWindow.webContents.on('did-attach-webview', (_event, contents) => {
    theaterWebview = contents;
    contents.on('did-finish-load', () => {
      stopTheaterIframeShare();
      if (pendingTheaterAutoFollow && lastState) {
        pendingTheaterAutoFollow = false;
        contents.send('enable-auto-follow', { paused: lastState.paused, position: lastState.position });
        void ensureTheaterFollowsIframeIfNeeded();
      }
    });
  });

  theaterWindow.on('closed', () => {
    theaterWindow = null;
    theaterWebview = null;
    stopTheaterIframeShare();
  });

  return theaterWindow;
}

function navigateTheaterTo(url: string) {
  const win = ensureTheaterWindow();
  win.show();
  win.focus();
  pendingTheaterAutoFollow = true;
  if (theaterWebview) {
    theaterWebview.loadURL(url).catch((err) => {
      pendingTheaterAutoFollow = false;
      console.error('[ourmovie] loadURL (théâtre) a échoué', err);
    });
  }
  // Si le <webview> n'est pas encore attaché (première ouverture de la fenêtre), son
  // attribut src initial (voir theater/index.html) pointera déjà vers cette URL.
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload-app.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.on('did-attach-webview', (_event, contents) => {
    browseWebview = contents;
    contents.on('did-finish-load', () => {
      browseMainFrameVideos = [];
      browseIframeVideos = [];
      void scanBrowseIframes();
    });
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
  stopTheaterIframeShare();

  socket = io(payload.serverUrl, { auth: { token: payload.token } });

  socket.on('connect', () => socket!.emit('join', { roomCode: payload.roomCode }));
  socket.on('connect_error', (err) => console.error('[ourmovie] connect_error', err.message));

  socket.on('state', (state: RoomState) => {
    lastState = state;
    mainWindow.webContents.send('sync-state', state);

    if (state.videoUrl && state.videoUrl !== knownVideoUrl) {
      // Nouvelle source (la nôtre ou celle de quelqu'un d'autre) : c'est la fenêtre
      // théâtre qui navigue dessus, jamais la fenêtre navigation — pour que chercher la
      // prochaine vidéo n'interrompe jamais la lecture en cours.
      knownVideoUrl = state.videoUrl;
      navigateTheaterTo(state.videoUrl);
    } else if (theaterIframeShare) {
      applyRemoteToTheaterIframe(state.paused, state.position);
    } else {
      theaterWebview?.send('apply-remote-playback', { paused: state.paused, position: state.position });
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
  stopTheaterIframeShare();
  theaterWindow?.close();
});

ipcMain.on('send-chat', (_event, text: string) => {
  socket?.emit('chat', { message: text });
});

// Interaction locale avec une vidéo synchronisée — vient normalement de la fenêtre
// théâtre (frame principale), mais on accepte aussi la fenêtre navigation si
// l'utilisateur interagit encore avec sa propre copie juste après l'avoir partagée.
ipcMain.on('local-video-event', (_event, payload: { type: 'play' | 'pause' | 'seek'; position: number }) => {
  if (!socket) return;
  socket.emit(payload.type, { position: payload.position });
});

// Vidéo choisie (frame principale) devenue source du salon — depuis le preload de
// n'importe laquelle des deux fenêtres.
ipcMain.on('local-video-source', (_event, url: string) => setSource(url));

ipcMain.on('videos-detected', (event, videos: DetectedVideo[]) => {
  // Seule la fenêtre navigation affiche la liste "vidéos détectées" avec boutons —
  // ignorer si ça vient de la fenêtre théâtre (pas d'UI de partage là-bas).
  if (event.sender !== browseWebview) return;
  browseMainFrameVideos = videos;
  sendDetectedVideos();
});

ipcMain.on('share-video', (_event, videoId: number) => {
  if (videoId >= IFRAME_ID_BASE) {
    shareBrowseIframeVideo(videoId);
  } else {
    // Déclenche l'attache côté preload, qui renverra lui-même 'local-video-source'
    // (→ setSource) une fois la vidéo effectivement attachée — pas besoin de dupliquer
    // l'appel ici.
    browseWebview?.send('share-video', videoId);
  }
});
