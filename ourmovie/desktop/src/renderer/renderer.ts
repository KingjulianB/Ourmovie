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
  queue: string[];
}

interface DetectedVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
}

interface OurmovieBridge {
  joinRoom(payload: { serverUrl: string; token: string; roomCode: string }): void;
  leaveRoom(): void;
  sendChat(text: string): void;
  onSyncState(callback: (state: RoomState) => void): void;
  onChatReceived(callback: (message: ChatMessage) => void): void;
  onSyncError(callback: (message: string) => void): void;
  playNow(videoId: number): void;
  queueVideo(videoId: number): void;
  onVideosDetected(callback: (videos: DetectedVideo[]) => void): void;
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

const browseView = document.getElementById('browse-view') as Electron.WebviewTag;
const addressBar = document.getElementById('address-bar') as HTMLInputElement;

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes('.') && !trimmed.includes(' ')) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

document.getElementById('nav-form')!.addEventListener('submit', (e) => {
  e.preventDefault();
  browseView.src = normalizeUrl(addressBar.value);
});
document.getElementById('nav-back')!.addEventListener('click', () => browseView.goBack());
document.getElementById('nav-forward')!.addEventListener('click', () => browseView.goForward());
document.getElementById('nav-reload')!.addEventListener('click', () => browseView.reload());
browseView.addEventListener('did-navigate', () => {
  addressBar.value = browseView.getURL();
});
browseView.addEventListener('did-navigate-in-page', () => {
  addressBar.value = browseView.getURL();
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

function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return ` · ${m}:${s}`;
}

function renderDetectedVideos(videos: DetectedVideo[]) {
  const container = document.getElementById('detected-videos') as HTMLElement;
  container.innerHTML = '';
  if (videos.length === 0) {
    container.textContent = 'Aucune vidéo détectée sur cette page.';
    return;
  }
  for (const v of videos) {
    const row = document.createElement('div');
    row.className = 'detected-video-row';
    const label = document.createElement('span');
    label.textContent = `${v.width}×${v.height}${formatDuration(v.duration)}`;

    const actions = document.createElement('div');
    actions.className = 'actions';

    const playNowBtn = document.createElement('button');
    playNowBtn.textContent = '▶ Maintenant';
    playNowBtn.title = 'Remplace tout de suite la vidéo en cours pour tout le salon';
    playNowBtn.addEventListener('click', () => window.ourmovie.playNow(v.id));

    const queueBtn = document.createElement('button');
    queueBtn.textContent = '+ File';
    queueBtn.title = "Ajoute à la file d'attente, sans interrompre la vidéo en cours";
    queueBtn.addEventListener('click', () => window.ourmovie.queueVideo(v.id));

    actions.append(playNowBtn, queueBtn);
    row.append(label, actions);
    container.appendChild(row);
  }
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch {
    return url;
  }
}

function renderQueue(queue: string[]) {
  const container = document.getElementById('queue-list') as HTMLElement;
  container.innerHTML = '';
  if (queue.length === 0) {
    container.textContent = 'Vide.';
    return;
  }
  queue.forEach((url, i) => {
    const row = document.createElement('div');
    row.className = 'queue-row';
    row.textContent = `${i + 1}. ${shortenUrl(url)}`;
    container.appendChild(row);
  });
}

const playerPane = document.getElementById('player-pane') as HTMLElement;

window.ourmovie.onChatReceived(appendChatMessage);
window.ourmovie.onVideosDetected(renderDetectedVideos);
window.ourmovie.onSyncState((state) => {
  (document.getElementById('room-participants') as HTMLElement).textContent =
    state.participants.join(', ');
  renderQueue(state.queue ?? []);
  // Le panneau lecteur n'apparaît (et ne prend de la place) que si une vidéo est
  // réellement active — sinon il resterait un grand rectangle noir en permanence,
  // écrasant la zone de navigation.
  playerPane.hidden = !state.videoUrl;
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
