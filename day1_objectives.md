# Ourmovie — Day 1 Goals
**Date :** 2026-09-20
**Projet :** Add-on Home Assistant pour regarder des films/séries en même temps qu'une autre personne à distance — chat texte + audio en direct (façon Rave/Teleparty), avec connexion à Netflix et autres plateformes, plus lecture directe de liens vidéo.
**But de ce fichier :** premier jour du projet — poser les bases avant tout code : comprendre comment des outils existants résolvent le problème de sync, cerner la contrainte Netflix/DRM, et définir un périmètre MVP réaliste.

---

## Objectif A — Étudier des projets existants
Regarder comment Teleparty, Rave, Scener et Syncplay fonctionnent techniquement, pour s'en inspirer plutôt que repartir de zéro.

- [x] Documenter le mécanisme de Teleparty (extension navigateur + relais serveur) — le serveur ne relaie que le timing/chat, chaque client garde sa propre session DRM ; extension MV3 Chrome/Edge/Safari/Opera
- [x] Documenter le mécanisme de Rave — même principe (app + intégration multi-plateformes) ; watch party façon microservices + Socket.io côté implémentations tierces trouvées sur GitHub
- [x] Documenter le mécanisme de Scener — extension Chrome only, salons à code 16 caractères, jusqu'à 20 viewers, host a la "télécommande"
- [x] Documenter le mécanisme de Syncplay — client/serveur Python (Apache 2.0), protocole ouvert et documenté (`Hello`, `State` avec `paused`/`position`/`setBy`/`doSeek`) ; pensé pour lecteurs locaux (mpv/VLC), pas de DRM à gérer
- [x] Synthétiser : quel(s) modèle(s) sont transposables — voir `discrepancies.md` § Faisabilité Netflix/DRM (Resolved) pour la synthèse complète et les sources. En bonus : deux projets trouvés en cours de route très proches du besoin — **KoalaSync** (extension + serveur relais auto-hébergeable Docker, supporte Netflix + Jellyfin/Emby + HTML5 direct) et **watchparty** de nkc-137 (Node.js + Socket.IO + adaptateurs par plateforme, correction de dérive toutes les 3s)

**statut :** terminé — synthèse complète dans `discrepancies.md`

---

## Objectif B — Définir l'architecture globale
Choisir la stack technique de base pour l'add-on.

- [x] Confirmer le format add-on HA (conteneur Docker + `config.yaml` + `Dockerfile` + `rootfs/` — format standard HA, confirmé)
- [x] Choisir le mécanisme de synchronisation d'état de lecture (WebSocket, protocole esquissé ci-dessous, inspiré de Syncplay + watchparty)
- [x] Choisir le mécanisme audio (WebRTC) — **reporté en V2** avec Netflix (voir Objectif C), pas bloquant pour l'architecture V1
- [x] Clarifier la place d'un composant client pour les plateformes avec DRM — **tranché par la recherche (Objectif A) : une extension navigateur (MV3) est obligatoire pour Netflix/Prime/Disney+**, reportée en V2 avec Netflix (Objectif C)
- [x] Clarifier comment l'invité (sans compte HA) rejoint une session — **tranché : comptes propres à l'app + Cloudflare Tunnel**, voir `discrepancies.md` § Accès de la copine à l'add-on
- [x] Esquisser un schéma d'architecture simple (ci-dessous)

**statut :** terminé pour la V1 — schéma et protocole ci-dessous

### Schéma d'architecture (V1)

```
Toi (réseau local)                    Ta copine (autre foyer)
   │                                        │
   │ Ingress HA (dashboard HA)              │ URL publique Cloudflare
   ▼                                        ▼
┌──────────────────────────────────────────────────┐
│  Add-on Home Assistant (conteneur Docker)         │
│  ┌──────────────┐   ┌───────────────────────────┐│
│  │  Frontend web │   │  Backend                  ││
│  │  (lecteur     │◄─►│  - comptes utilisateurs    ││
│  │  vidéo HTML5, │   │    (propres à l'app)       ││
│  │  chat texte)  │   │  - gestion des salons      ││
│  └──────────────┘   │  - relais WebSocket         ││
│                      │    (sync lecture + chat)   ││
│                      │  - SQLite (comptes, salons) ││
│                      └───────────────────────────┘│
└──────────────────────────────────────────────────┘
                    ▲
                    │ tunnel sortant (pas de port ouvert)
              ┌─────┴─────┐
              │ cloudflared│ → URL publique stable
              └───────────┘
```

En V1, chaque client (toi et ta copine) ouvre un lien vidéo direct
(mp4/HLS/YouTube) dans le lecteur HTML5 intégré au frontend — pas
d'extension navigateur nécessaire. En V2, l'ajout de Netflix/DRM
introduira l'extension navigateur en parallèle de ce schéma (elle
communiquera avec le même backend WebSocket).

### Protocole WebSocket (V1, esquisse)

Inspiré du protocole Syncplay (`Hello`/`State`) et de la correction de
dérive de watchparty (broadcast périodique) :

- **Connexion :** le client envoie `{"join": {"room_id": "...", "user_token": "..."}}` après login sur l'app.
- **État initial :** le serveur répond avec l'état courant du salon : `{"state": {"video_url": "...", "paused": true, "position": 0.0, "participants": [...]}}`.
- **Contrôle :** un client envoie `{"play"|"pause"|"seek": {"position": 123.4}}` ; le serveur rebroadcast à tous les autres participants du salon.
- **Anti-dérive :** le serveur rebroadcast un `state` complet toutes les ~3s (comme watchparty), pour resynchroniser un client qui aurait dérivé.
- **Chat :** `{"chat": {"message": "...", "from": "user_id", "ts": ...}}`, simple broadcast dans le salon.
- **Contrôle partagé par défaut :** en V1, les deux participants peuvent play/pause/seek (pas de "host" exclusif comme chez Scener) — cohérent avec un usage à deux plutôt qu'une party à plusieurs ; à revoir si le produit s'ouvre à plus de 2 personnes.

---

## Objectif C — Définir le MVP (périmètre minimal)
Décider ce qui doit marcher en premier.

- [x] Trancher : lecture de liens directs (mp4/HLS/YouTube) incluse dès la V1 ? → **Oui, c'est le périmètre V1**
- [x] Trancher : Netflix inclus dès la V1, ou reporté à une V2 ? → **Reporté en V2** (avec l'extension navigateur qui va avec, voir `discrepancies.md` § Périmètre du MVP)
- [x] Trancher : chat texte seul en V1, ou chat audio (WebRTC) inclus dès la V1 ? → **Texte seul en V1**, audio (WebRTC) reporté en V2
- [x] Écrire le périmètre MVP retenu dans `project_log.md` (table Résolu)

**statut :** terminé — **MVP V1 = liens vidéo directs (mp4/HLS/YouTube) + chat texte. V2 = Netflix/DRM (extension navigateur) + chat audio (WebRTC).**

---

## Not in scope today (listé pour ne pas l'oublier, pas laissé de côté par omission)
- Squelette de code de l'add-on (Dockerfile, config.yaml réels) — reporté à une session future, une fois l'architecture actée
- Gestion des comptes/identifiants Netflix — hors scope tant que la faisabilité n'est pas confirmée

---

## End-of-day check
| Objectif | Statut | Blocage (le cas échéant) |
|---|---|---|
| A — Étudier projets existants | ✅ terminé | — |
| B — Architecture globale | ✅ terminé | — |
| C — Définir le MVP | ✅ terminé | — |

**Verdict du jour :** journée très productive — les trois objectifs
sont bouclés. Le périmètre MVP est clair (liens directs + chat texte
en V1, Netflix + audio en V2) et l'architecture globale est posée
(add-on HA + comptes propres à l'app + Cloudflare Tunnel + protocole
WebSocket esquissé), avec deux vraies contraintes techniques
découvertes et tranchées en route (extension navigateur obligatoire
pour Netflix ; Ingress HA insuffisante pour un invité externe).

**Notes pour la prochaine session — reprendre dans cet ordre :**
1. Décider si on initialise un dépôt Git (`project_log.md` décision #1, seule décision encore ouverte)
2. Poser le squelette réel de l'add-on (Dockerfile, config.yaml, structure de dossiers) — explicitement hors scope du jour 1
3. Détailler le schéma de comptes utilisateurs + salons (tables SQLite) avant de coder le backend
4. Choisir la stack backend concrète (langage/framework) — pas encore tranché, à faire avant le squelette
