"use strict";
(() => {
  // src/popup.ts
  var STORAGE_KEYS = {
    serverUrl: "ourmovie_server_url",
    token: "ourmovie_token",
    username: "ourmovie_username"
  };
  async function getStored(key) {
    const result = await chrome.storage.local.get(key);
    return result[key];
  }
  async function setStored(key, value) {
    await chrome.storage.local.set({ [key]: value });
  }
  var views = {
    setup: document.getElementById("setup-view"),
    auth: document.getElementById("auth-view"),
    lobby: document.getElementById("lobby-view"),
    room: document.getElementById("room-view")
  };
  function showView(name) {
    Object.keys(views).forEach((key) => {
      views[key].hidden = key !== name;
    });
  }
  function setError(elementId, message) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.hidden = !message;
  }
  var serverUrl = "";
  var token;
  var username;
  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${serverUrl}/${path}`, { ...options, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`);
    return body;
  }
  async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Impossible de trouver l'onglet actif");
    return tab.id;
  }
  document.getElementById("setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const url = String(data.get("serverUrl") ?? "").trim().replace(/\/$/, "");
    if (!url) return;
    serverUrl = url;
    await setStored(STORAGE_KEYS.serverUrl, url);
    showView("auth");
  });
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const result = await apiFetch("api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: data.get("username"), password: data.get("password") })
      });
      await saveSession(result.token, result.username);
      setError("auth-error", "");
      showView("lobby");
    } catch (err) {
      setError("auth-error", err.message);
    }
  });
  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const result = await apiFetch("api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username: data.get("username"), password: data.get("password") })
      });
      await saveSession(result.token, result.username);
      setError("auth-error", "");
      showView("lobby");
    } catch (err) {
      setError("auth-error", err.message);
    }
  });
  async function saveSession(newToken, newUsername) {
    token = newToken;
    username = newUsername;
    await setStored(STORAGE_KEYS.token, newToken);
    await setStored(STORAGE_KEYS.username, newUsername);
  }
  document.getElementById("create-room-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const result = await apiFetch("api/rooms", {
        method: "POST",
        body: JSON.stringify({ videoUrl: data.get("videoUrl") || void 0 })
      });
      setError("lobby-error", "");
      await enterRoom(result.code);
    } catch (err) {
      setError("lobby-error", err.message);
    }
  });
  document.getElementById("join-room-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const code = String(data.get("code") ?? "").trim().toUpperCase();
    try {
      await apiFetch(`api/rooms/${code}`);
      setError("lobby-error", "");
      await enterRoom(code);
    } catch (err) {
      setError("lobby-error", err.message);
    }
  });
  async function enterRoom(code) {
    document.getElementById("room-code").textContent = code;
    document.getElementById("chat-messages").innerHTML = "";
    showView("room");
    const tabId = await getActiveTabId();
    await chrome.tabs.sendMessage(tabId, {
      type: "join-room",
      serverUrl,
      token,
      roomCode: code
    });
  }
  document.getElementById("leave-room").addEventListener("click", async () => {
    const tabId = await getActiveTabId();
    await chrome.tabs.sendMessage(tabId, { type: "leave-room" });
    showView("lobby");
  });
  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    const tabId = await getActiveTabId();
    await chrome.tabs.sendMessage(tabId, { type: "send-chat", text });
    input.value = "";
  });
  function appendChatMessage(msg) {
    const container = document.getElementById("chat-messages");
    const line = document.createElement("div");
    line.className = "chat-line";
    const author = document.createElement("strong");
    author.textContent = `${msg.from} :`;
    const text = document.createElement("span");
    text.textContent = msg.message;
    line.append(author, text);
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  }
  chrome.runtime.onMessage.addListener(
    (message) => {
      if (message.type === "chat-received" && message.chatMessage) {
        appendChatMessage(message.chatMessage);
      } else if (message.type === "sync-state" && message.state) {
        document.getElementById("room-participants").textContent = message.state.participants.join(", ");
      } else if (message.type === "sync-error") {
        setError("lobby-error", message.errorMessage ?? "Erreur de synchronisation");
      }
    }
  );
  async function init() {
    serverUrl = await getStored(STORAGE_KEYS.serverUrl) ?? "";
    token = await getStored(STORAGE_KEYS.token);
    username = await getStored(STORAGE_KEYS.username);
    if (!serverUrl) {
      showView("setup");
      return;
    }
    document.querySelector('#setup-form [name="serverUrl"]').value = serverUrl;
    if (token && username) {
      showView("lobby");
    } else {
      showView("auth");
    }
  }
  init();
})();
