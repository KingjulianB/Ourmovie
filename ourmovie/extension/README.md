# Extension navigateur Ourmovie (V2)

Synchronise la lecture vidéo et le chat sur **n'importe quel site**
(pas de scraping, pas de site ciblé) : l'extension pilote la balise
`<video>` déjà présente sur la page que tu regardes, dans ton
navigateur, comme le fait Rave/Teleparty.

## Installation (extension non empaquetée)

Pas encore publiée sur le Chrome Web Store (nécessiterait un compte
développeur Google et une revue) — installation manuelle pour l'instant :

1. `cd extension && npm install && npm run build` (déjà fait si tu
   utilises la version du dépôt telle quelle — `dist/` est commité).
2. Dans Chrome/Edge : `chrome://extensions` → activer le **Mode
   développeur** (en haut à droite) → **Charger l'extension non
   empaquetée** → sélectionner le dossier `extension/`.
3. Cliquer sur l'icône Ourmovie dans la barre d'outils.
4. Renseigner l'**adresse du serveur** — pas l'Ingress HA (voir
   `../DOCS.md`), mais l'adresse directe : soit l'IP locale de ta HA
   sur le port `38099` (`http://192.168.x.x:38099`), soit ton URL
   Cloudflare Tunnel une fois configurée.
5. Se connecter avec le même compte que sur l'interface web (les
   comptes sont partagés — même backend).

## Utilisation

1. Va sur la page où se trouve la vidéo à regarder (n'importe quel
   site avec une balise `<video>` — Netflix, Prime, un site perso...).
2. Ouvre le popup de l'extension, crée un salon (ou rejoins celui de
   l'autre personne avec son code).
3. La lecture est synchronisée automatiquement ; le chat est dans le
   popup.

## Limites connues (premier jet)

- Détecte la plus grande balise `<video>` visible sur la page — sur
  des sites avec plusieurs lecteurs (pubs, aperçus...), ce n'est pas
  garanti à 100% d'être le bon.
- Pas d'adaptateur par site (pas d'API privée Netflix, etc.) — juste le
  contrôle standard `play()`/`pause()`/`currentTime` sur l'élément
  `<video>`. Ça suffit pour la plupart des sites HTML5 standards ; le
  comportement sur des lecteurs très custom n'est pas garanti.
- Pas testée dans un vrai navigateur pendant le développement (contexte
  d'agent sans accès à un profil Chrome isolé) — vérifiée par
  compilation TypeScript stricte + bundle esbuild sans erreur, mais un
  premier essai réel est à faire.
