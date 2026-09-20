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

## Objectif D — Choisir la stack backend
Ajouté en cours de session, à la suite de l'Objectif B (architecture globale).

**Décision : Node.js + TypeScript.**

- **Serveur HTTP + WebSocket :** Fastify (API HTTP légère — login, gestion
  des salons) + **Socket.IO** pour le relais de sync + chat. Socket.IO
  est choisi plutôt qu'un WebSocket brut (`ws`) car son concept de
  "room" correspond exactement à nos salons, et il gère nativement la
  reconnexion/heartbeat — moins de code maison à écrire et maintenir
  pour ça. C'est aussi le choix fait par watchparty (nkc-137), la
  référence la plus proche trouvée en Objectif A.
- **Base de données :** SQLite via **`node:sqlite`** (module intégré au
  runtime Node depuis la v22, passé en *release candidate* dans Node
  24.15/25.7 début 2026). Choisi plutôt que `better-sqlite3` (le choix
  le plus populaire habituellement) pour une raison spécifique aux
  add-ons HA : `better-sqlite3` est un module natif qui doit être
  recompilé pour chaque architecture cible (amd64, aarch64...), ce qui
  complique le Dockerfile multi-arch. `node:sqlite` étant intégré au
  runtime, ce problème disparaît entièrement.
  **Risque mineur à surveiller :** `node:sqlite` est en RC, pas encore
  stable à 100% — si son API pose problème en pratique, `better-sqlite3`
  reste le filet de sécurité (au prix de la complexité multi-arch).
- **Auth :** `bcryptjs` (implémentation pure JS, pas de compilation
  native — même raison que ci-dessus) pour le hash des mots de passe,
  + tokens de session simples stockés en DB. Pas besoin d'OAuth/identité
  tierce pour un usage à 2 personnes.
- **Frontend V1 :** servi en fichiers statiques par ce même backend
  (un seul conteneur, un seul déploiement).
- **Pourquoi TypeScript de bout en bout :** le backend, le frontend et
  la future extension navigateur (V2, forcément en JS/TS — c'est la
  contrainte des extensions Manifest V3) peuvent partager les mêmes
  types pour le protocole WebSocket déjà esquissé (Objectif B :
  `join`/`state`/`play`/`pause`/`seek`/`chat`) — un seul langage à
  maintenir sur tout le projet, et moins de bugs de dérive de protocole
  entre composants.

**Sources :**
- [node:sqlite — Node.js v26 Documentation](https://nodejs.org/api/sqlite.html)
- [Home Assistant docker-base — multi-arch images](https://github.com/home-assistant/docker-base)
- [watchparty (nkc-137) — Node.js + TypeScript + Socket.IO](https://github.com/nkc-137/watchparty)

**statut :** terminé

---

## Objectif E — Détailler le schéma comptes + salons
Ajouté en cours de session, avant de poser le squelette de l'add-on.

**Décisions prises :**
- **Pas de persistance du chat en V1** — les messages sont relayés en
  direct via Socket.IO et ne sont pas stockés en base. Plus simple, et
  cohérent avec l'usage (une conversation en direct pendant le
  visionnage, pas un historique à consulter plus tard). Revisitable si
  le besoin apparaît.
- **Code de salon** à 6 caractères alphanumériques (façon Scener), pas
  d'UUID exposé à l'utilisateur.
- **Token de session opaque** (pas de JWT) stocké dans une table
  `sessions`, envoyé en `Authorization: Bearer <token>` pour l'API HTTP
  et via `socket.handshake.auth.token` pour la connexion Socket.IO —
  suffisant à cette échelle (pas besoin du stateless-ness d'un JWT pour
  2 utilisateurs).

**Schéma SQLite (`node:sqlite`) :**

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

CREATE TABLE rooms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,       -- code à 6 caractères, partagé pour rejoindre
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_url  TEXT,
  position   REAL NOT NULL DEFAULT 0,    -- secondes
  paused     INTEGER NOT NULL DEFAULT 1, -- 0/1
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE room_members (
  room_id   INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (room_id, user_id)
);
```

`room_members` permet à chacun de retrouver "mes salons" plus tard,
sans dépendre uniquement des connexions Socket.IO en cours (qui sont
éphémères par nature).

**statut :** terminé — schéma repris tel quel dans `ourmovie/src/db/schema.sql`

---

## Objectif F — Poser le squelette de l'add-on
Ajouté en cours de session.

- [x] Structure de dossiers add-on HA (`repository.yaml` à la racine du repo + dossier `ourmovie/` pour l'add-on lui-même, pour ne pas mélanger avec les docs de planification)
- [x] `config.yaml` (métadonnées add-on, Ingress activé, arch amd64/aarch64)
- [x] `Dockerfile` multi-stage (build TypeScript → image runtime légère, basée sur `node:24-alpine` pour avoir `node:sqlite` en RC sans flag)
- [x] `package.json` / `tsconfig.json`
- [x] Squelette backend fonctionnel : DB (schéma + init), auth (register/login), salons (create/get), relais Socket.IO (protocole `join`/`state`/`play`/`pause`/`seek`/`chat` + anti-dérive toutes les 3s)
- [x] Vérifié : `npm install` + compilation TypeScript passent localement (Node v24.11.1 disponible)

**statut :** terminé — squelette initial commité et affiné avec le frontend (Objectif G ci-dessous)

---

## Objectif G — Frontend V1 (connexion, salon, lecteur + chat)
Ajouté en cours de session — le rythme du jour a permis de dépasser le simple squelette backend.

- [x] Page de connexion/inscription (`src/public/index.html` + `src/client/app.ts`)
- [x] Lobby : créer un salon (avec lien vidéo) ou en rejoindre un par code
- [x] Vue salon : lecteur `<video>` HTML5 synchronisé (play/pause/seek relayés via Socket.IO, avec garde anti-boucle pour ne pas ré-émettre les événements déclenchés par un état reçu du serveur) + chat texte
- [x] Client Socket.IO servi directement par le backend (`/socket.io/socket.io.js`) — pas de bundler, pas de dépendance frontend supplémentaire
- [x] TypeScript client compilé séparément du backend (`tsconfig.client.json`, lib DOM) — nécessaire car le tsconfig backend n'a pas la lib DOM (partagé avec Node)
- [x] **Vérifié bout en bout** : build propre, serveur démarré, script de test scripté avec deux clients Socket.IO réels (inscription/connexion, création de salon, join à deux, play → sync reçue par l'autre client, chat → reçu par l'autre client, leave → participants mis à jour) — tous les checks passent
- [x] Bug trouvé et corrigé pendant la vérification : `broadcastState` était défini dans le scope d'une connexion Socket.IO, inaccessible depuis la boucle anti-dérive globale — remonté au niveau module

**Limitations connues (assumées pour la V1) :**
- Pas de vérification de session au démarrage du frontend : un token expiré échoue seulement à la première action (erreur affichée), pas de redirection automatique vers l'écran de connexion
- L'URL vidéo est fixée à la création du salon, pas modifiable depuis l'interface une fois le salon créé
- Vérification visuelle en navigateur non faite (le MCP chrome-devtools ne pouvait pas ouvrir de nouvel onglet isolé — nombreux processus Chrome déjà ouverts, risqué de les toucher) ; compensé par un test Socket.IO scripté de bout en bout qui couvre le même chemin fonctionnel

**statut :** terminé — commité et poussé

---

## Objectif H — Prêt à installer aujourd'hui (version, icône, docs)
Demandé explicitement en fin de session : "je veux que l'app marche dès
aujourd'hui, met à jour la version sur github pour que HA détecte la
mise à jour, créer un logo".

- [x] `config.yaml` : version bump `0.1.0` → `0.2.0` (pour que le
  Supervisor HA détecte une mise à jour disponible)
- [x] `arch` étendu à `amd64` / `aarch64` / `armv7` — couvre la quasi
  totalité des installations HA courantes (générique x86, Pi 4/5 en
  64 bits, Pi plus ancien en 32 bits) sans avoir besoin de demander le
  matériel exact
- [x] Port `8099` exposé directement en plus de l'Ingress — accès de
  secours fiable en local le temps de confirmer si le souci WebSocket
  via l'Ingress (cf. `discrepancies.md`) se manifeste en pratique
- [x] `icon.png` (128×128) et `logo.png` (250×100) générés avec PIL
  (script jetable, supprimé après usage) — motif triangle "play" +
  bulle de chat, dégradé violet/indigo
- [x] `README.md`, `DOCS.md`, `CHANGELOG.md` — nécessaires pour un
  affichage correct dans le store d'add-ons HA (aperçu, documentation,
  historique de versions)
- [x] Rebuild final vérifié (compilation propre) après tous ces
  changements

**Pour que ça marche vraiment aujourd'hui, il reste à faire côté
utilisateur** (je ne peux pas le faire depuis cette session — nécessite
ta vraie instance HA) :
1. Ajouter `https://github.com/KingjulianB/Ourmovie` comme dépôt
   d'add-ons dans HA (Paramètres → Add-ons → Boutique → ⋮ → Dépôts)
2. Installer l'add-on **Ourmovie**, le démarrer
3. Ouvrir l'interface (bouton "OPEN WEB UI", ou `http://<ip-ha>:8099`
   en direct) et tester la création de compte / de salon

**statut :** terminé côté code — installation réelle à faire par l'utilisateur

---

## Not in scope today (listé pour ne pas l'oublier, pas laissé de côté par omission)
- Gestion des comptes/identifiants Netflix — hors scope tant que la faisabilité n'est pas confirmée
- Configuration réelle du Cloudflare Tunnel — nécessite le compte/domaine Cloudflare de l'utilisateur

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
1. ~~Décider si on initialise un dépôt Git~~ — fait (repo local + remote `Ourmovie` + premier commit poussé, 2026-09-20)
2. ~~Choisir la stack backend~~ — fait (Node.js/TS + Fastify + Socket.IO + `node:sqlite`, voir Objectif D)
3. Détailler le schéma de comptes utilisateurs + salons (tables SQLite) avant de coder le backend
4. Poser le squelette réel de l'add-on (Dockerfile, config.yaml, structure de dossiers)
