# Ourmovie Fix Log

Journal en ajout continu des bugs notables trouvés/corrigés et des
"faux positifs" confirmés — utile à savoir avant de re-diagnostiquer
quelque chose déjà investigué.

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

## @fastify/static — vulnérabilité path traversal / bypass d'auth (2026-09-20)

`npm install` initial a résolu `@fastify/static@7.0.4`, vulnérable
(GHSA-8pvw-jcv7-9cmj, GHSA-83w8-p2f5-377r — bypass d'autorisation via
chemins d'URL non-canoniques, contournement du garde-fou de route via
path traversal). Détecté par `npm audit` juste après l'install initiale
du squelette de l'add-on.

**Fix :** épinglé `@fastify/static` à `^10.1.4` (dernière version
patchée au moment du fix) dans `ourmovie/package.json`.
**Vérifié :** `npm audit` → 0 vulnérabilité après réinstallation.
