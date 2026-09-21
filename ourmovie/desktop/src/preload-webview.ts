// Injecté dans le <webview> (l'onglet de navigation réel). Détecte TOUTES les balises
// <video> de la page (façon Internet Download Manager qui liste les flux détectés),
// et attend soit un clic explicite "Partager" (côté navigation normale), soit un
// signal "enable-auto-follow" (côté suivi automatique — la personne redirigée n'a
// rien à cliquer, elle rejoint juste la vidéo déjà choisie par quelqu'un d'autre).
import { ipcRenderer } from 'electron';

interface DetectedVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
}

let nextId = 1;
const videoRegistry = new Map<number, HTMLVideoElement>();
let sharedVideo: HTMLVideoElement | null = null;
let suppressEvents = false;
let autoFollowMode = false;

function emit(type: 'play' | 'pause' | 'seek', position: number) {
  if (suppressEvents) return;
  ipcRenderer.send('local-video-event', { type, position });
}

function attachSharedVideo(v: HTMLVideoElement) {
  if (sharedVideo === v) return;
  sharedVideo = v;
  v.addEventListener('play', () => emit('play', v.currentTime));
  v.addEventListener('pause', () => emit('pause', v.currentTime));
  v.addEventListener('seeked', () => emit('seek', v.currentTime));
  // Fin naturelle de la vidéo : signale au serveur d'enchaîner avec la playlist.
  v.addEventListener('ended', () => ipcRenderer.send('local-video-ended'));
}

function pickBestVideo(elements: HTMLVideoElement[]): HTMLVideoElement | null {
  if (elements.length === 0) return null;
  return elements.reduce((best, candidate) =>
    candidate.clientWidth * candidate.clientHeight > best.clientWidth * best.clientHeight ? candidate : best
  );
}

function applyRemotePlayback(payload: { paused: boolean; position: number }) {
  if (!sharedVideo) return;
  suppressEvents = true;
  if (Math.abs(sharedVideo.currentTime - payload.position) > 1.5) {
    sharedVideo.currentTime = payload.position;
  }
  if (payload.paused && !sharedVideo.paused) sharedVideo.pause();
  if (!payload.paused && sharedVideo.paused) sharedVideo.play().catch(() => {});
  setTimeout(() => {
    suppressEvents = false;
  }, 50);
}

// Beaucoup de lecteurs modernes encapsulent leur <video> dans un web component avec
// Shadow DOM — querySelectorAll('video') seul ne le traverse pas. On descend donc
// récursivement dans chaque shadow root OUVERT rencontré (un shadow root "closed" est
// délibérément inaccessible en JS, aucun moyen de le contourner).
function collectVideos(root: Document | ShadowRoot, into: HTMLVideoElement[]) {
  root.querySelectorAll('video').forEach((v) => {
    if (!into.includes(v)) into.push(v);
  });
  root.querySelectorAll('*').forEach((el) => {
    if (el.shadowRoot) collectVideos(el.shadowRoot, into);
  });
}

function findAllVideos(): HTMLVideoElement[] {
  const found: HTMLVideoElement[] = [];
  collectVideos(document, found);
  return found;
}

function scanVideos() {
  const found = findAllVideos();

  for (const [id, el] of [...videoRegistry.entries()]) {
    if (!found.includes(el)) videoRegistry.delete(id);
  }
  for (const el of found) {
    if (![...videoRegistry.values()].includes(el)) {
      videoRegistry.set(nextId++, el);
    }
  }

  // Mode suivi automatique : pas d'attente d'un clic, on s'attache dès qu'une vidéo
  // apparaît (comme avant), pour que la personne redirigée n'ait rien à faire.
  if (autoFollowMode && !sharedVideo && found.length > 0) {
    attachSharedVideo(pickBestVideo(found)!);
  }

  const list: DetectedVideo[] = [...videoRegistry.entries()].map(([id, el]) => ({
    id,
    width: el.videoWidth || el.clientWidth,
    height: el.videoHeight || el.clientHeight,
    duration: Number.isFinite(el.duration) ? el.duration : 0,
  }));
  ipcRenderer.send('videos-detected', list);
}

scanVideos();
setInterval(scanVideos, 1500); // beaucoup de sites (SPA) chargent la vidéo après coup

// L'utilisateur a cliqué "Partager" sur une vidéo précise dans la liste détectée.
ipcRenderer.on('share-video', (_event, videoId: number) => {
  const el = videoRegistry.get(videoId);
  if (!el) return;
  attachSharedVideo(el);
  ipcRenderer.send('local-video-source', window.location.href);
});

// Suivi automatique activé (navigation déclenchée par le salon, pas par l'utilisateur).
ipcRenderer.on('enable-auto-follow', (_event, state: { paused: boolean; position: number }) => {
  autoFollowMode = true;
  scanVideos();
  if (sharedVideo) applyRemotePlayback(state);
});

ipcRenderer.on('apply-remote-playback', (_event, payload: { paused: boolean; position: number }) => {
  applyRemotePlayback(payload);
});
