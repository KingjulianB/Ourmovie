// Injecté dans le <webview> (l'onglet de navigation réel). Détecte la balise <video> la
// plus visible et la pilote — même principe qu'un content script d'extension (isolated
// world : accès DOM à la page, mais ses propres scripts n'ont pas accès à require()).
//
// Ne gère plus la connexion Socket.IO directement : elle vit dans main.ts, pour survivre
// à la navigation (ce script, lui, est détruit et recréé à chaque nouvelle page chargée
// dans le <webview> — impossible d'y garder un état qui dure plus d'une page).
import { ipcRenderer } from 'electron';

let video: HTMLVideoElement | null = null;
let suppressEvents = false;
// Sur les sites très dynamiques (YouTube, SPA), l'élément <video> peut être
// recréé/remplacé en interne plusieurs fois pour la MÊME vidéo (changement de
// qualité, re-render React, etc.). Sans ce verrou, chaque remplacement serait
// pris pour "une nouvelle vidéo" et repartagé au salon, remettant tout à zéro
// en boucle (bug réel observé avec YouTube). On ne partage donc la source
// qu'une seule fois par chargement de page.
let sourceReported = false;

function pickBestVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll('video'));
  if (videos.length === 0) return null;
  return videos.reduce((best, candidate) => {
    const bestArea = best.clientWidth * best.clientHeight;
    const candidateArea = candidate.clientWidth * candidate.clientHeight;
    return candidateArea > bestArea ? candidate : best;
  });
}

function emit(type: 'play' | 'pause' | 'seek', position: number) {
  if (suppressEvents) return;
  ipcRenderer.send('local-video-event', { type, position });
}

function attach(v: HTMLVideoElement) {
  if (video === v) return;
  video = v;
  console.log('[ourmovie-preload] vidéo (ré)attachée sur', window.location.href);
  if (!sourceReported) {
    sourceReported = true;
    ipcRenderer.send('local-video-source', window.location.href);
  }
  v.addEventListener('play', () => emit('play', v.currentTime));
  v.addEventListener('pause', () => emit('pause', v.currentTime));
  v.addEventListener('seeked', () => emit('seek', v.currentTime));
}

function trackVideo() {
  const best = pickBestVideo();
  if (best) attach(best);
}

trackVideo();
setInterval(trackVideo, 1500); // beaucoup de sites (SPA) chargent la vidéo après coup

ipcRenderer.on('apply-remote-playback', (_event, payload: { paused: boolean; position: number }) => {
  if (!video) return;
  suppressEvents = true;
  if (Math.abs(video.currentTime - payload.position) > 1.5) {
    video.currentTime = payload.position;
  }
  if (payload.paused && !video.paused) video.pause();
  if (!payload.paused && video.paused) video.play().catch(() => {});
  setTimeout(() => {
    suppressEvents = false;
  }, 50);
});
