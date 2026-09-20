// Frontend V1 : connexion, création/rejoint de salon, lecteur vidéo synchronisé + chat texte.
// `import type` est erasé à la compilation : pas d'appel runtime vers ../ws/protocol.js.
import type { RoomState, ChatMessage } from '../ws/protocol.js';

// Servi automatiquement par le serveur Socket.IO à <base>/socket.io/socket.io.js.
declare const io: (opts?: { auth?: Record<string, unknown>; path?: string }) => any;

// L'add-on est servi sous un préfixe variable (racine en local, mais
// /api/hassio_ingress/<token>/ derrière l'Ingress HA) : tous les appels
// réseau doivent être relatifs à ce préfixe, jamais en chemin absolu "/...".
function computeBasePath(): string {
  const path = window.location.pathname;
  return path.endsWith('/') ? path : path.slice(0, path.lastIndexOf('/') + 1);
}
const BASE_PATH = computeBasePath();

const STORAGE_TOKEN_KEY = 'ourmovie_token';
const STORAGE_USERNAME_KEY = 'ourmovie_username';

let token: string | null = localStorage.getItem(STORAGE_TOKEN_KEY);
let username: string | null = localStorage.getItem(STORAGE_USERNAME_KEY);
let socket: ReturnType<typeof io> | null = null;
let suppressPlayerEvents = false;

const views = {
  auth: document.getElementById('auth-view') as HTMLElement,
  lobby: document.getElementById('lobby-view') as HTMLElement,
  room: document.getElementById('room-view') as HTMLElement,
};

function showView(name: keyof typeof views) {
  (Object.keys(views) as (keyof typeof views)[]).forEach((key) => {
    views[key].hidden = key !== name;
  });
}

function setError(elementId: string, message: string) {
  const el = document.getElementById(elementId) as HTMLElement;
  el.textContent = message;
  el.hidden = !message;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // `path` est relatif (ex: "api/auth/login"), préfixé par BASE_PATH pour rester
  // correct sous l'Ingress HA (voir computeBasePath ci-dessus).
  const res = await fetch(`${BASE_PATH}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`);
  return body;
}

function saveSession(newToken: string, newUsername: string) {
  token = newToken;
  username = newUsername;
  localStorage.setItem(STORAGE_TOKEN_KEY, newToken);
  localStorage.setItem(STORAGE_USERNAME_KEY, newUsername);
}

function enterLobby() {
  (document.getElementById('lobby-username') as HTMLElement).textContent = username ?? '';
  showView('lobby');
}

document.getElementById('login-form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(e.target as HTMLFormElement);
  try {
    const result = await apiFetch('api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: data.get('username'), password: data.get('password') }),
    });
    saveSession(result.token, result.username);
    setError('auth-error', '');
    enterLobby();
  } catch (err) {
    setError('auth-error', (err as Error).message);
  }
});

document.getElementById('register-form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(e.target as HTMLFormElement);
  try {
    const result = await apiFetch('api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: data.get('username'), password: data.get('password') }),
    });
    saveSession(result.token, result.username);
    setError('auth-error', '');
    enterLobby();
  } catch (err) {
    setError('auth-error', (err as Error).message);
  }
});

document.getElementById('create-room-form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(e.target as HTMLFormElement);
  try {
    const result = await apiFetch('api/rooms', {
      method: 'POST',
      body: JSON.stringify({ videoUrl: data.get('videoUrl') || undefined }),
    });
    setError('lobby-error', '');
    enterRoom(result.code);
  } catch (err) {
    setError('lobby-error', (err as Error).message);
  }
});

document.getElementById('join-room-form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(e.target as HTMLFormElement);
  const code = String(data.get('code') ?? '').trim().toUpperCase();
  try {
    await apiFetch(`api/rooms/${code}`);
    setError('lobby-error', '');
    enterRoom(code);
  } catch (err) {
    setError('lobby-error', (err as Error).message);
  }
});

function ensureSocket() {
  if (socket) return socket;
  // `path` doit être un chemin absolu réel (l'option socket.io ne fait pas de
  // résolution relative comme un <script src>) — on reconstruit donc l'URL
  // complète à partir de BASE_PATH pour rester correct sous l'Ingress HA.
  socket = io({ auth: { token }, path: `${BASE_PATH}socket.io/` });
  socket.on('state', applyRemoteState);
  socket.on('chat', appendChatMessage);
  socket.on('error', (err: { message: string }) => alert(err.message));
  return socket;
}

function enterRoom(code: string) {
  (document.getElementById('room-code') as HTMLElement).textContent = code;
  showView('room');
  ensureSocket().emit('join', { roomCode: code });
}

const videoEl = document.getElementById('video') as HTMLVideoElement;

function applyRemoteState(state: RoomState) {
  suppressPlayerEvents = true;
  if (state.videoUrl && videoEl.currentSrc !== state.videoUrl) {
    videoEl.src = state.videoUrl;
  }
  if (Math.abs(videoEl.currentTime - state.position) > 1.5) {
    videoEl.currentTime = state.position;
  }
  if (state.paused && !videoEl.paused) videoEl.pause();
  if (!state.paused && videoEl.paused) videoEl.play().catch(() => {});
  (document.getElementById('room-participants') as HTMLElement).textContent = state.participants.join(', ');
  window.setTimeout(() => {
    suppressPlayerEvents = false;
  }, 50);
}

videoEl.addEventListener('play', () => {
  if (!suppressPlayerEvents) socket?.emit('play', { position: videoEl.currentTime });
});
videoEl.addEventListener('pause', () => {
  if (!suppressPlayerEvents) socket?.emit('pause', { position: videoEl.currentTime });
});
videoEl.addEventListener('seeked', () => {
  if (!suppressPlayerEvents) socket?.emit('seek', { position: videoEl.currentTime });
});

function appendChatMessage(msg: ChatMessage) {
  const container = document.getElementById('chat-messages') as HTMLElement;
  const line = document.createElement('div');
  line.className = 'chat-line';

  const author = document.createElement('strong');
  author.textContent = `${msg.from} :`;
  const text = document.createElement('span');
  text.textContent = msg.message; // textContent uniquement : pas d'injection HTML via le chat
  const time = document.createElement('time');
  time.textContent = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  line.append(author, text, time);
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

document.getElementById('chat-form')!.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input') as HTMLInputElement;
  const message = input.value.trim();
  if (!message || !socket) return;
  socket.emit('chat', { message });
  input.value = '';
});

document.getElementById('leave-room')!.addEventListener('click', () => {
  socket?.emit('leave');
  videoEl.pause();
  videoEl.removeAttribute('src');
  (document.getElementById('chat-messages') as HTMLElement).innerHTML = '';
  showView('lobby');
});

// V1 simple : si un token existe déjà en local, on va direct à la lobby
// (pas de vérification serveur au démarrage — un token expiré échouera à la première action,
// affiché comme une erreur classique, pas de redirection automatique vers l'écran de connexion).
if (token && username) {
  enterLobby();
} else {
  showView('auth');
}
