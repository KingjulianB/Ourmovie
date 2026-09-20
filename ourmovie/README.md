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
- **Extension navigateur (V2)** : synchronise n'importe quel site avec
  une balise `<video>` (Netflix, Prime, YouTube, etc.), comme
  Rave/Teleparty — voir `extension/README.md`.

Le chat audio arrive dans une prochaine version (voir `DOCS.md`).

## Installation

1. Dans Home Assistant : **Paramètres → Add-ons → Boutique d'add-ons →
   ⋮ → Dépôts**, ajouter `https://github.com/KingjulianB/Ourmovie`.
2. Installer l'add-on **Ourmovie**.
3. Démarrer l'add-on, puis ouvrir son interface web (bouton "OPEN WEB
   UI").
4. Créer un compte, créer un salon, partager le code avec la personne
   avec qui regarder.

Pour l'extension navigateur (regarder sur n'importe quel site), voir
`extension/README.md` — elle a besoin de l'adresse directe de l'add-on
(`http://<ip-ha>:38099`), pas de l'Ingress.

Voir `DOCS.md` pour le détail de l'utilisation et les limitations
connues de cette version.
