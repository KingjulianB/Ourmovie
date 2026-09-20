# Ourmovie Fix Log

Journal en ajout continu des bugs notables trouvés/corrigés et des
"faux positifs" confirmés — utile à savoir avant de re-diagnostiquer
quelque chose déjà investigué.

## @fastify/static — vulnérabilité path traversal / bypass d'auth (2026-09-20)

`npm install` initial a résolu `@fastify/static@7.0.4`, vulnérable
(GHSA-8pvw-jcv7-9cmj, GHSA-83w8-p2f5-377r — bypass d'autorisation via
chemins d'URL non-canoniques, contournement du garde-fou de route via
path traversal). Détecté par `npm audit` juste après l'install initiale
du squelette de l'add-on.

**Fix :** épinglé `@fastify/static` à `^10.1.4` (dernière version
patchée au moment du fix) dans `ourmovie/package.json`.
**Vérifié :** `npm audit` → 0 vulnérabilité après réinstallation.
