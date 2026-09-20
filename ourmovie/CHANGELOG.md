# Changelog — Ourmovie

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
