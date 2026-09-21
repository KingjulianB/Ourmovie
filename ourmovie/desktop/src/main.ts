import { app, BrowserWindow, ipcMain, WebContents } from 'electron';
import path from 'node:path';
import { io, Socket } from 'socket.io-client';

// La connexion Socket.IO vit ici, dans le process principal, précisément parce que le
// <webview> se détruit et se recrée à chaque navigation (donc toute connexion tenue
// dans son preload serait perdue à chaque fois que quelqu'un navigue vers une nouvelle
// vidéo). Ici, elle survit à la navigation — c'est ce qui permet le "suivi automatique"
// demandé : quand quelqu'un partage une nouvelle source, tout le monde est redirigé.

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

let mainWindow: BrowserWindow;
let webviewContents: WebContents | null = null;
let socket: Socket | null = null;
let lastState: RoomState | null = null;
let knownVideoUrl: string | null = null;
// true si la prochaine navigation du <webview> est déclenchée par NOUS (suivi
// automatique d'une source partagée par quelqu'un d'autre), pas par l'utilisateur.
let pendingAutoFollow = false;

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
    webviewContents = contents;

    // Chaque fois que la page du <webview> finit de charger, son script "preload"
    // repart de zéro (pas de mémoire d'une page à l'autre). Deux cas :
    // - navigation de suivi automatique (on vient d'appeler loadURL nous-mêmes) :
    //   on dit au preload de s'attacher automatiquement à la meilleure vidéo trouvée ;
    // - navigation normale de l'utilisateur : on ne fait rien de spécial, le preload va
    //   juste scanner et remonter la liste des vidéos détectées (bouton "Partager").
    contents.on('did-finish-load', () => {
      if (pendingAutoFollow && lastState) {
        pendingAutoFollow = false;
        contents.send('enable-auto-follow', { paused: lastState.paused, position: lastState.position });
      }
    });
    contents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
      console.error('[ourmovie] webview did-fail-load', { errorCode, errorDescription, validatedURL });
    });
  });
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

  socket = io(payload.serverUrl, { auth: { token: payload.token } });

  socket.on('connect', () => socket!.emit('join', { roomCode: payload.roomCode }));
  socket.on('connect_error', (err) => console.error('[ourmovie] connect_error', err.message));

  socket.on('state', (state: RoomState) => {
    lastState = state;
    mainWindow.webContents.send('sync-state', state);

    if (state.videoUrl && state.videoUrl !== knownVideoUrl) {
      // Nouvelle source (la nôtre ou celle de quelqu'un d'autre) : on (re)navigue dessus
      // en mode "suivi automatique" — la personne qui reçoit n'a rien à cliquer.
      knownVideoUrl = state.videoUrl;
      pendingAutoFollow = true;
      webviewContents?.loadURL(state.videoUrl).catch((err) => {
        pendingAutoFollow = false;
        console.error('[ourmovie] loadURL a échoué', err);
      });
    } else {
      webviewContents?.send('apply-remote-playback', { paused: state.paused, position: state.position });
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
});

ipcMain.on('send-chat', (_event, text: string) => {
  socket?.emit('chat', { message: text });
});

// Reçu depuis le preload du <webview> : l'utilisateur local a interagi avec SA vidéo.
ipcMain.on('local-video-event', (_event, payload: { type: 'play' | 'pause' | 'seek'; position: number }) => {
  if (!socket) return;
  socket.emit(payload.type, { position: payload.position });
});

// Reçu depuis le preload : la vidéo choisie par l'utilisateur (bouton "Partager")
// devient la source du salon.
ipcMain.on('local-video-source', (_event, url: string) => {
  if (!socket || url === knownVideoUrl) return;
  knownVideoUrl = url;
  socket.emit('set-source', { url });
});

// Reçu depuis le preload : liste des vidéos détectées sur la page courante — relayé
// au panneau app pour afficher les boutons "Partager".
ipcMain.on('videos-detected', (_event, videos: DetectedVideo[]) => {
  mainWindow.webContents.send('videos-detected', videos);
});

// Reçu depuis le panneau app : l'utilisateur a cliqué "Partager" sur une vidéo précise.
ipcMain.on('share-video', (_event, videoId: number) => {
  webviewContents?.send('share-video', videoId);
});
