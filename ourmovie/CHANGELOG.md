# Changelog — Ourmovie

## 0.3.2 (2026-09-21)

- Correction : boucle de lecture sur YouTube (et sites SPA similaires)
  — l'élément `<video>` interne est recréé plusieurs fois pour la même
  vidéo, ce qui repartageait la source en boucle et remettait tout à
  zéro. La source n'est maintenant partagée qu'une fois par page.
- Correction : la position n'était plus recalculée pendant la lecture
  (valeur figée en base), ce qui pouvait forcer un retour en arrière à
  chaque correction anti-dérive périodique. Calculée en direct
  maintenant, à partir du temps écoulé depuis le dernier événement.
- Garde-fou serveur supplémentaire contre les doublons `set-source`.

## 0.3.1 (2026-09-21)

- Nouveau : événement `set-source` côté serveur — quand un participant
  navigue vers une nouvelle vidéo, elle devient la source du salon et
  tout le monde est redirigé dessus automatiquement (façon Rave).
  Nécessaire pour l'app desktop et l'extension (V2).

## 0.3.0 (2026-09-20)

- **Extension navigateur (V2)** dans `extension/` — synchronise la
  lecture vidéo (play/pause/seek) et le chat sur n'importe quel site
  avec une balise `<video>` standard, comme Rave/Teleparty. Mêmes
  comptes que l'interface web (même backend).
- Backend : CORS activé (Fastify + Socket.IO) pour accepter les
  requêtes de l'extension.
- `config.yaml` : port direct remis sur `38099` (au lieu de l'ancien
  `8099`, source du conflit en 0.2.0/0.2.1) — nécessaire pour que
  l'extension puisse atteindre le serveur sans passer par l'Ingress.

## 0.2.2 (2026-09-20)

- **Correction critique** : le frontend utilisait des chemins absolus
  (`/app.js`, `/styles.css`, `/api/...`), qui pointaient vers la racine
  de Home Assistant au lieu de l'add-on une fois servis derrière
  l'Ingress — résultat, aucun style et aucun JS ne chargeait
  (formulaires inertes, retombant sur une soumission HTML native).
  Tous les chemins sont maintenant relatifs au préfixe réel de la page.
- Correction : les identifiants ne sont plus jamais écrits dans les
  logs du serveur (la query string est retirée avant journalisation) —
  suite à un incident réel où un mot de passe s'est retrouvé en clair
  dans les logs à cause du bug ci-dessus.
- Défense en profondeur : les formulaires de connexion/inscription
  utilisent `method="post"` pour ne plus jamais exposer les
  identifiants dans l'URL, même si le JavaScript échouait à charger.

## 0.2.1 (2026-09-20)

- Correction : retrait du mapping de port direct `8099` (conflit avec
  un autre add-on/service utilisant déjà ce port sur certaines
  installations). L'accès se fait uniquement via l'Ingress HA
  désormais.

## 0.2.0 (2026-09-20)

- Frontend V1 : connexion/inscription, création/rejoint de salon,
  lecteur vidéo synchronisé, chat texte.
- Icône et logo de l'add-on.
- Accès réseau local direct sur le port 8099 en plus de l'Ingress.
- Architecture multi-arch (amd64, aarch64, armv7).

## 0.1.0 (2026-09-20)

- Premier squelette de l'add-on : backend Fastify + Socket.IO,
  comptes utilisateurs, salons, relais de synchronisation vidéo et
  chat, base SQLite (`node:sqlite`).
