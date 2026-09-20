# Ourmovie

Add-on Home Assistant pour regarder des films et séries à deux, à
distance, avec un chat en direct — un peu comme Rave ou Teleparty,
mais auto-hébergé.

## Fonctionnalités (V1)

- Comptes utilisateurs propres à l'app (pas besoin de compte Home
  Assistant pour l'invité)
- Création d'un salon avec un lien vidéo direct (mp4/HLS/YouTube) et
  un code à 6 caractères pour le rejoindre
- Lecture synchronisée (play/pause/seek relayés en temps réel)
- Chat texte en direct

Netflix et les autres plateformes avec DRM, ainsi que le chat audio,
arrivent en V2 (voir `DOCS.md`).

## Installation

1. Dans Home Assistant : **Paramètres → Add-ons → Boutique d'add-ons →
   ⋮ → Dépôts**, ajouter `https://github.com/KingjulianB/Ourmovie`.
2. Installer l'add-on **Ourmovie**.
3. Démarrer l'add-on, puis ouvrir son interface web (bouton "OPEN WEB
   UI", ou directement `http://<ip-ha>:8099`).
4. Créer un compte, créer un salon, partager le code avec la personne
   avec qui regarder.

Voir `DOCS.md` pour le détail de l'utilisation et les limitations
connues de cette version.
