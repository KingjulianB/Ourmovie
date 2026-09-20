// Panneau app de la fenêtre principale : barre d'adresse (pilote le <webview>),
// login/inscription, création/rejoint de salon, chat. Aucun accès Node ici
// (nodeIntegration: false) — communique avec main.ts via le pont exposé par
// preload-app.ts (window.ourmovie). La connexion Socket.IO et la sync vidéo elles-mêmes
// vivent dans main.ts + preload-webview.ts (voir ces fichiers).

export {}; // force ce fichier en "module" TS, requis pour que `declare global` soit valide

interface ChatMessage {
  from: string;
  message: string;
  ts: number;
}

interface RoomState {
  roomCode: string;
  videoUrl: string | null;
  paused: boolean;
  position: number;
  participants: string[];
}

interface OurmovieBridge {
  joinRoom(payload: { serverUrl: string; token: string; roomCode: string }): void;
  leaveRoom(): void;
  sendChat(text: string): void;
  onSyncState(callback: (state: RoomState) => void): void;
  onChatReceived(callback: (message: ChatMessage) => void): void;
  onSyncError(callback: (message: string) => void): void;
}

declare global {
  interface Window {
    ourmovie: OurmovieBridge;
  }
}

const STORAGE_KEYS = {
  serverUrl: 'ourmovie_server_url',
  token: 'ourmovie_token',
  username: 'ourmovie_username',
} as const;

let serverUrl = localStorage.getItem(STORAGE_KEYS.serverUrl) ?? '';
let token = localStorage.getItem(STORAGE_KEYS.token) ?? undefined;
let username = localStorage.getItem(STORAGE_KEYS.username) ?? undefined;

const views = {
  setup: document.getElementById('setup-view') as HTMLElement,
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
  const res = await fetch(`${serverUrl}/${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`);
  return body;
}

// --- Barre d'adresse / navigateur intégré ---

const webview = document.getElementById('browser-view') as Electron.WebviewTag;
const addressBar = document.getElementById('address-bar') as HTMLInputElement;

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes('.') && !trimmed.includes(' ')) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

document.getElementById('nav-form')!.addEventListener('submit', (e) => {
  e.preventDefault();
  webview.src = normalizeUrl(addressBar.value);
});
document.getElementById('nav-back')!.addEventListener('click', () => webview.goBack());
document.getElementById('nav-forward')!.addEventListener('click', () => webview.goForward());
document.getElementById('nav-reload')!.addEventListener('click', () => webview.reload());
webview.addEventListener('did-navigate', () => {
  addressBar.value = webview.getURL();
});
webview.addEventListener('did-navigate-in-page', () => {
  addressBar.value = webview.getURL();
});

// --- Auth / lobby / salon ---

document.getElementById('setup-form')!.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target as HTMLFormElement);
  const url = String(data.get('serverUrl') ?? '').trim().replace(/\/$/, '');
  if (!url) return;
  serverUrl = url;
  localStorage.setItem(STORAGE_KEYS.serverUrl, url);
  showView('auth');
});

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
    showView('lobby');
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
    showView('lobby');
  } catch (err) {
    setError('auth-error', (err as Error).message);
  }
});

function saveSession(newToken: string, newUsername: string) {
  token = newToken;
  username = newUsername;
  localStorage.setItem(STORAGE_KEYS.token, newToken);
  localStorage.setItem(STORAGE_KEYS.username, newUsername);
}

document.getElementById('logout')!.addEventListener('click', () => {
  window.ourmovie.leaveRoom();
  token = undefined;
  username = undefined;
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.username);
  (document.getElementById('login-form') as HTMLFormElement).reset();
  (document.getElementById('register-form') as HTMLFormElement).reset();
  setError('auth-error', '');
  showView('auth');
});

document.getElementById('create-room-form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const result = await apiFetch('api/rooms', { method: 'POST', body: JSON.stringify({}) });
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

function enterRoom(code: string) {
  (document.getElementById('room-code') as HTMLElement).textContent = code;
  (document.getElementById('chat-messages') as HTMLElement).innerHTML = '';
  showView('room');
  window.ourmovie.joinRoom({ serverUrl, token: token as string, roomCode: code });
}

document.getElementById('leave-room')!.addEventListener('click', () => {
  window.ourmovie.leaveRoom();
  showView('lobby');
});

document.getElementById('chat-form')!.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input') as HTMLInputElement;
  const text = input.value.trim();
  if (!text) return;
  window.ourmovie.sendChat(text);
  input.value = '';
});

function appendChatMessage(msg: ChatMessage) {
  const container = document.getElementById('chat-messages') as HTMLElement;
  const line = document.createElement('div');
  line.className = 'chat-line';
  const author = document.createElement('strong');
  author.textContent = `${msg.from} :`;
  const text = document.createElement('span');
  text.textContent = msg.message;
  line.append(author, text);
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

window.ourmovie.onChatReceived(appendChatMessage);
window.ourmovie.onSyncState((state) => {
  (document.getElementById('room-participants') as HTMLElement).textContent =
    state.participants.join(', ');
});
window.ourmovie.onSyncError((message) => {
  setError('lobby-error', message || 'Erreur de synchronisation');
});

function init() {
  if (!serverUrl) {
    showView('setup');
    return;
  }
  (document.querySelector('#setup-form [name="serverUrl"]') as HTMLInputElement).value = serverUrl;
  showView(token && username ? 'lobby' : 'auth');
}

init();
