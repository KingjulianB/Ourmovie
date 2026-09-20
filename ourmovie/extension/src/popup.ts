// Popup de l'extension : login, création/rejoint de salon, chat.
// La lecture vidéo elle-même est pilotée par le content script de l'onglet actif
// (extension/src/content.ts) — le popup ne fait que le déclencher et afficher le chat.

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

const STORAGE_KEYS = {
  serverUrl: 'ourmovie_server_url',
  token: 'ourmovie_token',
  username: 'ourmovie_username',
} as const;

async function getStored<T = string>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

async function setStored(key: string, value: string) {
  await chrome.storage.local.set({ [key]: value });
}

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

let serverUrl = '';
let token: string | undefined;
let username: string | undefined;

async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${serverUrl}/${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`);
  return body;
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Impossible de trouver l'onglet actif");
  return tab.id;
}

document.getElementById('setup-form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(e.target as HTMLFormElement);
  const url = String(data.get('serverUrl') ?? '').trim().replace(/\/$/, '');
  if (!url) return;
  serverUrl = url;
  await setStored(STORAGE_KEYS.serverUrl, url);
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
    await saveSession(result.token, result.username);
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
    await saveSession(result.token, result.username);
    setError('auth-error', '');
    showView('lobby');
  } catch (err) {
    setError('auth-error', (err as Error).message);
  }
});

async function saveSession(newToken: string, newUsername: string) {
  token = newToken;
  username = newUsername;
  await setStored(STORAGE_KEYS.token, newToken);
  await setStored(STORAGE_KEYS.username, newUsername);
}

document.getElementById('create-room-form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(e.target as HTMLFormElement);
  try {
    const result = await apiFetch('api/rooms', {
      method: 'POST',
      body: JSON.stringify({ videoUrl: data.get('videoUrl') || undefined }),
    });
    setError('lobby-error', '');
    await enterRoom(result.code);
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
    await enterRoom(code);
  } catch (err) {
    setError('lobby-error', (err as Error).message);
  }
});

async function enterRoom(code: string) {
  (document.getElementById('room-code') as HTMLElement).textContent = code;
  (document.getElementById('chat-messages') as HTMLElement).innerHTML = '';
  showView('room');

  const tabId = await getActiveTabId();
  await chrome.tabs.sendMessage(tabId, {
    type: 'join-room',
    serverUrl,
    token,
    roomCode: code,
  });
}

document.getElementById('leave-room')!.addEventListener('click', async () => {
  const tabId = await getActiveTabId();
  await chrome.tabs.sendMessage(tabId, { type: 'leave-room' });
  showView('lobby');
});

document.getElementById('chat-form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input') as HTMLInputElement;
  const text = input.value.trim();
  if (!text) return;
  const tabId = await getActiveTabId();
  await chrome.tabs.sendMessage(tabId, { type: 'send-chat', text });
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

// Messages relayés depuis le content script de l'onglet actif (état de sync, chat, erreurs).
chrome.runtime.onMessage.addListener(
  (message: { type: string; state?: RoomState; chatMessage?: ChatMessage; errorMessage?: string }) => {
    if (message.type === 'chat-received' && message.chatMessage) {
      appendChatMessage(message.chatMessage);
    } else if (message.type === 'sync-state' && message.state) {
      (document.getElementById('room-participants') as HTMLElement).textContent =
        message.state.participants.join(', ');
    } else if (message.type === 'sync-error') {
      setError('lobby-error', message.errorMessage ?? 'Erreur de synchronisation');
    }
  }
);

async function init() {
  serverUrl = (await getStored(STORAGE_KEYS.serverUrl)) ?? '';
  token = await getStored(STORAGE_KEYS.token);
  username = await getStored(STORAGE_KEYS.username);

  if (!serverUrl) {
    showView('setup');
    return;
  }
  (document.querySelector('#setup-form [name="serverUrl"]') as HTMLInputElement).value = serverUrl;

  if (token && username) {
    showView('lobby');
  } else {
    showView('auth');
  }
}

init();
