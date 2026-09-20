# Ourmovie — Sujets ouverts nécessitant une analyse humaine

**Démarré :** 2026-09-20. Journal en ajout continu : les nouvelles
découvertes vont sous `## Open`, groupées par sujet. Une fois résolu,
l'entrée est déplacée sous `## Resolved` avec la réponse documentée —
jamais supprimée, garder une trace de ce qui posait problème et
pourquoi a de la valeur.

But : ce fichier contient de vrais désaccords techniques et questions
ouvertes — des cas où deux approches sont en tension, où une contrainte
technique n'est pas encore comprise, ou où il n'y a pas assez
d'information pour construire quelque chose sans deviner. Ce n'est pas
une simple liste de tâches — le travail non bloqué mais pas encore fait
va dans le `dayX_objectives.md` du jour.

---

## Open

*(aucun sujet ouvert pour l'instant — voir Resolved ci-dessous)*

---

## Resolved

### Accès de la copine à l'add-on — l'Ingress HA suppose un compte sur TA propre instance

**Contexte :** en creusant le format add-on HA pour l'Objectif B, un
problème d'architecture assez fondamental est apparu. L'Ingress (le
mécanisme standard par lequel un add-on HA expose son interface web)
fonctionne comme ceci : Home Assistant gère l'authentification et sert
l'interface de l'add-on **à un utilisateur déjà connecté à cette
instance HA précise** — y compris à distance, via HA Cloud ou un
reverse proxy, mais toujours en tant qu'utilisateur de cette instance.

Ça marche très bien pour toi (tu es déjà utilisateur de ta propre
instance HA). Mais ta copine, dans son propre foyer, n'a a priori ni
compte ni accès à ton instance HA — l'Ingress n'est pas conçu pour
donner accès à un "invité" externe sans lui créer un compte sur ta HA
(ce qui donnerait aussi accès au reste de ton installation domotique,
pas seulement à l'add-on).

Autre point secondaire trouvé en même temps : plusieurs retours
(issue GitHub home-assistant/core #93619, fil de la communauté HA)
signalent des problèmes intermittents de connexion WebSocket à travers
l'Ingress — pertinent puisque toute l'architecture de sync repose sur
WebSocket.

**Réponse (2026-09-20) :** l'add-on aura son **propre système de
comptes utilisateurs, indépendant de l'authentification HA** (chacun a
un compte "app", comme sur Rave — pas un compte Home Assistant). Il
sera exposé à l'extérieur via un **Cloudflare Tunnel** (`cloudflared`),
ce qui donne une URL publique stable sans ouverture de port ni IP fixe.
L'Ingress HA reste utilisable en local pour toi (accès depuis le
tableau de bord HA), mais l'accès distant/externe (ta copine, ou toi
en déplacement) passe par l'URL Cloudflare + le compte app, pas par
l'Ingress.

**Conséquence pour l'architecture :**
- Il faut prévoir une **table/gestion d'utilisateurs propre à
  l'add-on** (inscription, connexion) en plus de la logique HA —
  l'add-on n'est donc pas juste un frontend passif servi par HA, il a
  sa propre couche applicative avec état persistant (comptes, sessions).
- Un `cloudflared` doit tourner à côté (ou dans) l'add-on — soit comme
  add-on complémentaire officiel HA (`Cloudflare Tunnel` par Home
  Assistant), soit packagé directement — **à trancher à l'implémentation**,
  pas bloquant pour l'architecture V1.
- Le risque de fiabilité WebSocket via l'Ingress (issue #93619,
  ci-dessus) devient secondaire pour les connexions distantes, puisque
  celles-ci passeront par le tunnel Cloudflare et non par l'Ingress —
  mais reste à surveiller pour l'accès local/HA.

**Sources :**
- [Presenting your app — Home Assistant Developer Docs](https://developers.home-assistant.io/docs/apps/presentation/)
- [websockets through Ingress seems to have problems intermittently — issue #93619](https://github.com/home-assistant/core/issues/93619)
- [Ingress with support for websocket — communauté HA](https://community.home-assistant.io/t/ingress-with-support-for-websocket/588542)

### Faisabilité de la synchronisation Netflix (et plateformes avec DRM)

**Réponse (2026-09-20) :** Confirmé faisable, mais ça impose une
contrainte d'architecture ferme. Les 4 outils étudiés (Teleparty, Rave,
Scener, Syncplay) plus deux projets trouvés en cours de route
(KoalaSync, watchparty de nkc-137) utilisent tous le même schéma :

- Le serveur (relais) ne transmet **jamais le flux vidéo** — uniquement
  des événements de timing (play/pause/seek/position) et le chat.
- Chaque spectateur garde son **propre abonnement et sa propre session
  DRM (Widevine/EME) intacte** — le déchiffrement reste 100% local au
  navigateur de chacun. C'est ce qui permet de "contourner" le DRM sans
  jamais y toucher : il n'y a rien à déchiffrer côté serveur.
- Une **extension navigateur (Manifest V3)** injecte un content script
  qui pilote soit l'élément HTML5 `<video>` (Prime Video, Disney+...),
  soit une API privée propre à la plateforme (Netflix — cf. watchparty
  de nkc-137, qui a un adaptateur dédié par service), et notifie le
  serveur relais via WebSocket/Socket.IO.
- watchparty (nkc-137) ajoute une correction de dérive périodique
  (broadcast d'état complet toutes les 3s) — un détail utile pour
  l'Objectif B.

**Conséquence pour l'architecture :** l'add-on HA seul ne peut pas
piloter Netflix depuis le serveur. Il doit jouer le rôle de **relais**
(comme le "serveur" dans ces outils), et une **extension navigateur
devient un composant obligatoire** pour les plateformes propriétaires
(Netflix, Prime, Disney+...). Les liens vidéo directs (mp4/HLS/YouTube),
eux, n'ont pas cette contrainte — ils peuvent être pilotés nativement
sans extension.

**Référence la plus proche du besoin :** KoalaSync — extension
navigateur + serveur relais **auto-hébergeable via Docker**, supporte
Netflix + Jellyfin/Emby + HTML5 direct. C'est quasiment le modèle
cible ; il suffirait que le serveur relais soit l'add-on HA au lieu
d'un conteneur Docker externe.

**Sources :**
- [Teleparty](https://www.teleparty.com/)
- [Rave FAQ](https://rave.io/faq) / [Rave (repo tiers, architecture microservices)](https://github.com/AI-automatization/Rave)
- [Scener FAQ](https://www.scener.com/faq)
- [Syncplay — protocole](https://syncplay.pl/about/protocol/) / [Syncplay (repo officiel)](https://github.com/Syncplay/syncplay)
- [KoalaSync](https://sync.koalastuff.net/)
- [watchparty (nkc-137)](https://github.com/nkc-137/watchparty)

**Suivi :** a fait naître une décision de périmètre, tranchée le
2026-09-20 — voir Résolu § Périmètre du MVP (V1) ci-dessous.

### Périmètre du MVP (V1) — liens directs / Netflix / chat

**Réponse (2026-09-20) :**
- **V1 :** lecture de liens vidéo directs uniquement (mp4/HLS/YouTube,
  pas de DRM) — pas besoin d'extension navigateur pour ça, l'add-on HA
  peut piloter la lecture directement.
- **V2 :** Netflix et les autres plateformes avec DRM, ce qui implique
  de construire l'extension navigateur (Manifest V3) identifiée comme
  obligatoire dans la recherche ci-dessus.
- **Chat :** texte seul en V1 (même connexion WebSocket que la sync
  vidéo) ; audio (WebRTC) reporté en V2 avec Netflix.

Reporté dans `project_log.md` (table Résolu).
