// Content script : tourne dans le contexte "isolated world" de chaque page.
// Trouve la balise <video> la plus visible, la synchronise avec le salon Ourmovie
// via Socket.IO, et relaie chat/état vers le popup.
import { io, type Socket } from 'socket.io-client';

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

type ContentMessage =
  | { type: 'join-room'; serverUrl: string; token: string; roomCode: string }
  | { type: 'leave-room' }
  | { type: 'send-chat'; text: string };

let socket: Socket | null = null;
let video: HTMLVideoElement | null = null;
let suppressEvents = false;
let watchTimer: number | null = null;

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
  window.setTimeout(() => {
    suppressEvents = false;
  }, 50);
  chrome.runtime.sendMessage({ type: 'sync-state', state }).catch(() => {});
}

function startSync(serverUrl: string, token: string, roomCode: string) {
  socket?.close();
  socket = io(serverUrl, { auth: { token } });
  socket.on('connect', () => socket!.emit('join', { roomCode }));
  socket.on('state', applyRemoteState);
  socket.on('chat', (msg: ChatMessage) => {
    chrome.runtime.sendMessage({ type: 'chat-received', chatMessage: msg }).catch(() => {});
  });
  socket.on('error', (err: { message: string }) => {
    chrome.runtime.sendMessage({ type: 'sync-error', errorMessage: err.message }).catch(() => {});
  });

  trackVideo();
  if (watchTimer) window.clearInterval(watchTimer);
  // Beaucoup de sites (SPA) chargent la vidéo après coup : on la retrouve périodiquement.
  watchTimer = window.setInterval(trackVideo, 1500);
}

function stopSync() {
  socket?.emit('leave');
  socket?.close();
  socket = null;
  if (watchTimer) window.clearInterval(watchTimer);
  watchTimer = null;
}

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
  if (message.type === 'join-room') {
    startSync(message.serverUrl, message.token, message.roomCode);
    sendResponse({ ok: true });
  } else if (message.type === 'leave-room') {
    stopSync();
    sendResponse({ ok: true });
  } else if (message.type === 'send-chat') {
    socket?.emit('chat', { message: message.text });
    sendResponse({ ok: true });
  }
  return true;
});
