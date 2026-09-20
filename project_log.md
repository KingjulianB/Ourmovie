# Ourmovie — Project Log

**À lire en premier.** Une page, uniquement des tableaux, pas de récit —
un index de ce qui attend une décision de ta part et de ce qui est
identifié comme problématique, à parcourir avant d'ouvrir
`discrepancies.md` (détail technique complet par sujet) ou le
`dayX_objectives.md` du jour (suivi tâche par tâche). Mis à jour à
chaque nouvelle décision ou problème ; les lignes résolues sont
déplacées dans le tableau "Résolu" en bas avec la réponse, jamais
supprimées.

**Ordre de lecture :** ce fichier → `discrepancies.md` → `dayX_objectives.md` du jour.

---

## Décisions à prendre

*(aucune pour l'instant)*

## Problèmes connus (pas des décisions — en cours d'investigation, rien à faire de ton côté pour l'instant)

*(aucun pour l'instant — le point Netflix/DRM est résolu, voir Résolu ci-dessous)*

## Résolu

| # | Décision/Problème | Réponse |
|---|---|---|
| 1 | Approche pour aborder Netflix/DRM en session 1 | Recherche de faisabilité d'abord (Teleparty/Rave/Scener), avant tout code — voir `day1_objectives.md` |
| 2 | Faisabilité de la sync Netflix/DRM | Confirmé faisable, mais nécessite obligatoirement une extension navigateur côté client (le serveur ne relaie que le timing + chat, jamais le flux vidéo) — voir `discrepancies.md` § Faisabilité Netflix/DRM (Resolved) pour le détail et les sources |
| 3 | Périmètre MVP retenu | **V1 = liens vidéo directs (mp4/HLS/YouTube) + chat texte, sans extension navigateur. V2 = Netflix + autres plateformes DRM (extension navigateur MV3) + chat audio (WebRTC).** |
| 4 | Accès de la copine à l'add-on | **Comptes utilisateurs propres à l'app (pas des comptes HA), add-on exposé publiquement via Cloudflare Tunnel.** Voir `discrepancies.md` § Accès de la copine à l'add-on (Resolved) pour les implications d'architecture. |
| 5 | Nom du projet et remote Git | **Ourmovie** — remote `github.com/KingjulianB/Ourmovie`, repo local initialisé et premier commit poussé le 2026-09-20. |
| 6 | Stack backend | **Node.js + TypeScript, Fastify + Socket.IO, SQLite via `node:sqlite`, bcryptjs.** Voir `day1_objectives.md` Objectif D pour le détail et les raisons (notamment : évite la compilation native multi-arch pour l'add-on HA). |
| 7 | Schéma comptes/salons + squelette add-on | Tables `users`/`sessions`/`rooms`/`room_members` (pas de persistance du chat en V1), squelette Fastify + Socket.IO fonctionnel dans `ourmovie/` — testé localement (register/login/room/socket.io tous vérifiés). Voir `day1_objectives.md` Objectifs E et F. |
| 8 | Frontend V1 | Page connexion/lobby/salon en JS/TS vanilla (pas de bundler), lecteur vidéo synchronisé + chat. **Vérifié bout en bout par un test Socket.IO scripté à deux clients** (join, sync play, chat, leave — tous passés). Voir `day1_objectives.md` Objectif G. |
