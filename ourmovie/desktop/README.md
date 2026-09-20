# Ourmovie Desktop

Application de bureau (Electron) avec un vrai navigateur intégré :
barre d'adresse à gauche, panneau connexion/salon/chat à droite. Même
principe que Rave/Teleparty, mais tout dans une seule fenêtre au lieu
d'une extension séparée.

## Installation / lancement

```
cd desktop
npm install
npm start
```

Le premier `npm install` télécharge le binaire Electron (~300 Mo,
une seule fois). `npm start` compile (TypeScript + esbuild) puis lance
l'app.

Au premier lancement : renseigne l'adresse **directe** de ton add-on
Ourmovie (pas l'Ingress HA) — `http://192.168.x.x:38099`, ou ton URL
Cloudflare Tunnel une fois configurée. Connecte-toi avec le même
compte que sur l'interface web/l'extension (même backend).

## Utilisation

1. Navigue dans le panneau de gauche comme dans n'importe quel
   navigateur (barre d'adresse, précédent/suivant/recharger).
2. Une fois sur la page avec la vidéo, crée un salon depuis le panneau
   de droite (ou rejoins celui de l'autre personne avec son code).
3. La lecture est synchronisée automatiquement, le chat est dans le
   panneau de droite.

## Comment ça marche

Le `<webview>` (zone de navigation à gauche) a un script "preload"
(`preload-webview.ts`) qui tourne isolé des scripts propres de la page
chargée — même principe qu'un content script d'extension navigateur.
Il détecte la plus grande balise `<video>` visible, la pilote, et
communique avec le panneau app (à droite) via les canaux IPC
d'Electron.

## Limites connues (premier jet)

- Pas encore empaqueté en installeur (`.exe`) — se lance avec
  `npm start` pour l'instant. Packaging (electron-builder) à ajouter
  si besoin.
- Mêmes limites de détection vidéo que l'extension (plus grande balise
  `<video>` visible, pas d'adaptateur par site).
- Testé par lancement réel + vérification des logs (pas de crash au
  démarrage), mais pas testé de bout en bout avec deux comptes
  pendant cette session.
