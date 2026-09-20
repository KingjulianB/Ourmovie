// Injecté dans le <webview> (l'onglet de navigation réel). Reprend la même logique
// que extension/src/content.ts : trouve la balise <video> la plus visible, la pilote,
// et relaie l'état/chat vers la fenêtre hôte (le panneau app) via ipcRenderer.sendToHost.
//
// Tourne en "isolated world" par rapport aux scripts propres de la page chargée dans
// le <webview> (même principe qu'un content script d'extension) : ce module a accès à
// require('electron')/require('socket.io-client'), mais les scripts de la page chargée
// n'y ont pas accès à moins qu'on les expose explicitement (ce qu'on ne fait pas).
import { ipcRenderer } from 'electron';
import { io, Socket } from 'socket.io-client';

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

let socket: Socket | null = null;
let video: HTMLVideoElement | null = null;
let suppressEvents = false;
let watchTimer: ReturnType<typeof setInterval> | null = null;

function pickBestVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll('video'));
  if (videos.length === 0) return null;
  return videos.reduce((best, candidate) => {
    const bestArea = best.clientWidth * best.clientHeight;
    const candidateArea = candidate.clientWidth * candidate.clientHeight;
    return candidateArea > bestArea ? candidate : best;
  });
}

function attach(v: HTMLVideoElement) {
  if (video === v) return;
  video = v;
  v.addEventListener('play', () => emit('play', v.currentTime));
  v.addEventListener('pause', () => emit('pause', v.currentTime));
  v.addEventListener('seeked', () => emit('seek', v.currentTime));
}

function emit(event: 'play' | 'pause' | 'seek', position: number) {
  if (suppressEvents || !socket) return;
  socket.emit(event, { position });
}

function trackVideo() {
  const best = pickBestVideo();
  if (best) attach(best);
}

function applyRemoteState(state: RoomState) {
  trackVideo();
  if (!video) return;
  suppressEvents = true;
  if (Math.abs(video.currentTime - state.position) > 1.5) {
    video.currentTime = state.position;
  }
  if (state.paused && !video.paused) video.pause();
  if (!state.paused && video.paused) video.play().catch(() => {});
  setTimeout(() => {
    suppressEvents = false;
  }, 50);
  ipcRenderer.sendToHost('sync-state', state);
}

function startSync(serverUrl: string, token: string, roomCode: string) {
  socket?.close();
  socket = io(serverUrl, { auth: { token } });
  socket.on('connect', () => socket!.emit('join', { roomCode }));
  socket.on('state', applyRemoteState);
  socket.on('chat', (msg: ChatMessage) => ipcRenderer.sendToHost('chat-received', msg));
  socket.on('error', (err: { message: string }) => ipcRenderer.sendToHost('sync-error', err.message));

  trackVideo();
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = setInterval(trackVideo, 1500);
}

function stopSync() {
  socket?.emit('leave');
  socket?.close();
  socket = null;
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = null;
}

ipcRenderer.on('join-room', (_event, payload: { serverUrl: string; token: string; roomCode: string }) => {
  startSync(payload.serverUrl, payload.token, payload.roomCode);
});
ipcRenderer.on('leave-room', () => stopSync());
ipcRenderer.on('send-chat', (_event, text: string) => socket?.emit('chat', { message: text }));
