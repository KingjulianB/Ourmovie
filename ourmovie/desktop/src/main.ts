import { app, BrowserWindow } from 'electron';
import path from 'node:path';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    webPreferences: {
      // Le panneau app (login/salon/chat) n'a besoin que de fetch/DOM/socket.io-client
      // (bundlé par esbuild) : pas d'accès Node nécessaire, pas de preload non plus —
      // <webview>.send()/addEventListener('ipc-message', ...) sont des API DOM du
      // custom element <webview>, pas des privilèges Node.
      contextIsolation: true,
      nodeIntegration: false,
      // Nécessaire pour la balise <webview> (le vrai navigateur intégré).
      webviewTag: true,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
