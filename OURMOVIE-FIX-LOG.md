# Ourmovie Fix Log

Journal en ajout continu des bugs notables trouvés/corrigés et des
"faux positifs" confirmés — utile à savoir avant de re-diagnostiquer
quelque chose déjà investigué.

## "videoUrl reste null" — backend modifié mais jamais poussé/redéployé (2026-09-21)

**Constaté :** après avoir ajouté le partage automatique de source
(`set-source`) au serveur et à l'app desktop, les deux fenêtres de test
recevaient toujours `videoUrl: null`, alors que le play/pause/seek
marchait normalement.

**Cause :** le changement du serveur (`ourmovie/src/ws/socket.ts`) avait
été testé en local (script + serveur de test sur un port temporaire)
mais **jamais commité ni poussé sur GitHub**, donc jamais redéployé sur
la vraie instance HA de l'utilisateur. Le serveur réel tournait encore
sur l'ancienne version, qui ignore silencieusement un événement
Socket.IO qu'elle ne connaît pas (`set-source`) — pas d'erreur visible,
juste un état qui ne se met jamais à jour. Diagnostiqué grâce à des
logs de diagnostic ajoutés dans `main.ts`/`preload-webview.ts` de l'app
desktop, qui ont montré que le côté client détectait bien la vidéo et
émettait l'événement, mais que le serveur ne renvoyait jamais le
`videoUrl` correspondant.

**Leçon :** avant de déboguer un comportement serveur qui semble
"ignoré", vérifier que le code modifié a bien été commité, poussé, et
que la version installée sur l'instance réelle a été mise à jour — pas
supposer que "j'ai testé en local" veut dire "c'est déployé".

**Fix :** commit + push + bump version (0.3.1) du changement `socket.ts`
concerné, voir `CHANGELOG.md`.

## Lien de test .mp4 direct → aucune vidéo détectée (2026-09-21)

**Constaté :** en testant avec un lien direct vers un fichier `.mp4`
(`.../BigBuckBunny.mp4`), la navigation réussissait (`did-finish-load`
confirmé dans les logs) mais aucune balise `<video>` n'était jamais
détectée par `preload-webview.ts`.

**Cause :** un lien direct vers un fichier vidéo fait afficher à
Chromium son lecteur vidéo natif interne (pas une page HTML normale
avec un DOM standard) — les scripts injectés (preload/content script)
ne s'exécutent pas dans ce contexte spécial, donc `document.
querySelectorAll('video')` ne trouve jamais rien.

**Pas un bug du code Ourmovie** — comportement normal de Chromium.
**Fix :** pour tester, utiliser une vraie page web contenant une balise
`<video>` dans son DOM (ex: une page de démo HTML5, pas un lien direct
vers le fichier).

## Conflit de port 8099 à l'installation réelle (2026-09-20)

**Constaté par l'utilisateur** à l'installation sur sa vraie instance
HA : "Vous pouvez effacer la configuration du port... ou libérer le
port manuellement en arrêtant... l'autre service qui l'utilise."

**Cause :** en 0.2.0, un mapping `ports: { 8099/tcp: 8099 }` avait été
ajouté en plus de l'Ingress, comme filet de sécurité "au cas où"
l'Ingress aurait un souci WebSocket (jamais confirmé en pratique).
8099 est un port très couramment utilisé par d'autres add-ons HA
(c'est le port d'exemple suggéré dans la doc officielle des
développeurs d'add-ons) — collision avec un autre service déjà
installé chez l'utilisateur.

**Fix (0.2.1) :** retrait complet du bloc `ports:`/`ports_description:`
de `config.yaml`. `ingress_port: 8099` seul ne réserve rien côté hôte
— contrairement à un mapping `ports:` explicite, il ne fait que dire
au Supervisor quel port interne au conteneur proxifier via l'Ingress.
L'accès direct par port n'était qu'une précaution non demandée ; le
risque qu'elle visait à couvrir n'avait jamais été confirmé.

**Non vérifié :** le risque de fiabilité WebSocket via l'Ingress
(issue GitHub home-assistant/core #93619, citée dans
`discrepancies.md`) reste théorique à ce stade — à surveiller une fois
l'add-on réellement utilisé.

## Frontend inerte + pas de style derrière l'Ingress, mot de passe fuité dans les logs (2026-09-20)

**Constaté par l'utilisateur** : "ça a démarré, je teste la création
de compte et ya rien qui se passe et aussi ya pas de style la page est
moche". Logs fournis ensuite confirmant le diagnostic :
`GET /?username=bamokina&password=Bamokina45*` — soumission de
formulaire HTML native (méthode GET par défaut, pas d'`action`), donc
le JavaScript n'avait pas chargé.

**Cause :** `index.html` référençait ses assets avec des chemins
**absolus** (`/styles.css`, `/app.js`, `/socket.io/socket.io.js`), et
`app.ts` appelait l'API avec des chemins absolus (`/api/...`). Derrière
l'Ingress HA, la page est servie sous un préfixe
(`/api/hassio_ingress/<token>/`) — un chemin absolu `/xxx` pointe donc
vers la racine de Home Assistant, pas vers l'add-on. Résultat : CSS et
JS ne chargeaient pas du tout (404 silencieux), donc aucun gestionnaire
d'événement n'était attaché, et le clic sur "Créer un compte" déclenchait
la soumission HTML par défaut du navigateur — en GET, avec les
identifiants dans la query string, capturés en clair par le logger
Fastify.

**Conséquence de sécurité :** le mot de passe de l'utilisateur s'est
retrouvé en clair dans les logs du conteneur (et dans cette
conversation, collée par l'utilisateur pour diagnostiquer). **Mot de
passe à changer** lors du prochain test.

**Fix (0.2.2) :**
- Tous les chemins d'assets/API passés en relatif (`styles.css`,
  `app.js`, `api/...`), avec un `BASE_PATH` calculé côté client depuis
  `window.location.pathname` pour reconstruire l'URL absolue nécessaire
  à l'option `path` du client Socket.IO (qui ne fait pas de résolution
  relative comme un `<script src>`).
- Logger Fastify configuré avec un serializer `req` custom qui retire
  la query string avant journalisation (défense en profondeur contre
  une récidive, quelle que soit la cause).
- Formulaires passés en `method="post"` (défense en profondeur
  supplémentaire — n'expose plus les identifiants dans l'URL même si le
  JS échoue à nouveau pour une autre raison).

**Vérifié :** build propre, inscription testée en local (racine sans
préfixe, donc `BASE_PATH = '/'`, chemin de compatibilité inchangé), et
confirmé qu'une requête avec query string n'apparaît plus dans les logs.
**Non vérifié** en conditions réelles d'Ingress (nécessiterait de
rejouer le test depuis l'installation HA de l'utilisateur).

## @fastify/static — vulnérabilité path traversal / bypass d'auth (2026-09-20)

`npm install` initial a résolu `@fastify/static@7.0.4`, vulnérable
(GHSA-8pvw-jcv7-9cmj, GHSA-83w8-p2f5-377r — bypass d'autorisation via
chemins d'URL non-canoniques, contournement du garde-fou de route via
path traversal). Détecté par `npm audit` juste après l'install initiale
du squelette de l'add-on.

**Fix :** épinglé `@fastify/static` à `^10.1.4` (dernière version
patchée au moment du fix) dans `ourmovie/package.json`.
**Vérifié :** `npm audit` → 0 vulnérabilité après réinstallation.
