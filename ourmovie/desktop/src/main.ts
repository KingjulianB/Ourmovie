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

let mainWindow: BrowserWindow;
let webviewContents: WebContents | null = null;
let socket: Socket | null = null;
let lastState: RoomState | null = null;
let knownVideoUrl: string | null = null;

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
    console.log('[ourmovie] webview attaché, webContents id =', contents.id);
    // Chaque fois que la page du <webview> finit de charger (navigation utilisateur OU
    // suivi automatique déclenché par nous), on lui redonne l'état de lecture courant —
    // son propre script "preload" repart de zéro à chaque page, il n'a pas de mémoire.
    contents.on('did-finish-load', () => {
      console.log('[ourmovie] webview did-finish-load, url =', contents.getURL());
      if (lastState) {
        contents.send('apply-remote-playback', { paused: lastState.paused, position: lastState.position });
      }
    });
    contents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
      console.error('[ourmovie] webview did-fail-load', { errorCode, errorDescription, validatedURL });
    });
    contents.on('console-message', (_e, _level, message) => {
      console.log('[webview console]', message);
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
  console.log('[ourmovie] join-room', payload.serverUrl, payload.roomCode);
  socket?.close();
  knownVideoUrl = null;
  lastState = null;

  socket = io(payload.serverUrl, { auth: { token: payload.token } });

  socket.on('connect', () => {
    console.log('[ourmovie] socket connecté, emit join');
    socket!.emit('join', { roomCode: payload.roomCode });
  });
  socket.on('connect_error', (err) => console.error('[ourmovie] connect_error', err.message));

  socket.on('state', (state: RoomState) => {
    console.log('[ourmovie] state reçu', state, 'knownVideoUrl =', knownVideoUrl, 'webviewContents =', Boolean(webviewContents));
    lastState = state;
    mainWindow.webContents.send('sync-state', state);

    if (state.videoUrl && state.videoUrl !== knownVideoUrl) {
      // Nouvelle source (la nôtre ou celle de quelqu'un d'autre) : on (re)navigue dessus.
      // Si c'est déjà la page affichée, loadURL est un no-op silencieux.
      knownVideoUrl = state.videoUrl;
      console.log('[ourmovie] navigation du webview vers', state.videoUrl);
      webviewContents?.loadURL(state.videoUrl).catch((err) => console.error('[ourmovie] loadURL a échoué', err));
    } else {
      webviewContents?.send('apply-remote-playback', { paused: state.paused, position: state.position });
    }
  });

  socket.on('chat', (msg: ChatMessage) => mainWindow.webContents.send('chat-received', msg));
  socket.on('error', (err: { message: string }) => {
    console.error('[ourmovie] erreur socket', err.message);
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

// Reçu depuis le preload du <webview> : une vidéo vient d'être détectée sur la page —
// on la propose comme nouvelle source du salon (seulement si vraiment nouvelle, pour
// éviter une boucle avec la redirection déclenchée par le "state" ci-dessus).
ipcMain.on('local-video-source', (_event, url: string) => {
  console.log('[ourmovie] local-video-source reçu du webview', url, 'socket connecté =', Boolean(socket));
  if (!socket || url === knownVideoUrl) return;
  knownVideoUrl = url;
  socket.emit('set-source', { url });
});
