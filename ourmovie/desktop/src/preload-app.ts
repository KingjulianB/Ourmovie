// Preload de la fenêtre principale (pas du <webview>). Expose un pont minimal et
// explicite vers le process principal pour le panneau app (login/salon/chat), qui lui
// tourne avec nodeIntegration: false — pas d'accès Node direct, uniquement ces méthodes.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ourmovie', {
  joinRoom: (payload: { serverUrl: string; token: string; roomCode: string }) =>
    ipcRenderer.send('join-room', payload),
  leaveRoom: () => ipcRenderer.send('leave-room'),
  sendChat: (text: string) => ipcRenderer.send('send-chat', text),
  onSyncState: (callback: (state: unknown) => void) => {
    ipcRenderer.on('sync-state', (_event, state) => callback(state));
  },
  onChatReceived: (callback: (message: unknown) => void) => {
    ipcRenderer.on('chat-received', (_event, message) => callback(message));
  },
  onSyncError: (callback: (message: string) => void) => {
    ipcRenderer.on('sync-error', (_event, message) => callback(message));
  },
});
