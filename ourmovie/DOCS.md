# Documentation — Ourmovie

## Utilisation

1. **Créer un compte** sur l'écran de connexion (nom d'utilisateur +
   mot de passe, 8 caractères minimum). Chaque personne crée son
   propre compte — ce ne sont pas des comptes Home Assistant.
2. **Créer un salon** : coller un lien vidéo direct (mp4, HLS, ou une
   URL YouTube pointant vers un fichier lisible directement par le
   lecteur HTML5) et cliquer sur "Créer". Un code à 6 caractères est
   généré.
3. **Partager le code** avec la personne à rejoindre. Elle le saisit
   dans "Rejoindre un salon" (après avoir créé son propre compte).
4. Une fois dans le salon, la lecture (play/pause/déplacement) est
   synchronisée entre les deux personnes automatiquement, et un chat
   texte est disponible sur le côté.

## Accès à distance (l'autre personne n'est pas sur le même réseau)

L'Ingress Home Assistant (le bouton "OPEN WEB UI" dans HA) ne
fonctionne que pour des utilisateurs déjà connectés à *cette* instance
HA — ce n'est pas prévu pour donner accès à un invité externe. Pour
que la deuxième personne puisse rejoindre depuis chez elle, il faut
exposer l'add-on publiquement, par exemple via un **Cloudflare
Tunnel** (add-on officiel "Cloudflare Tunnel", à configurer
séparément avec ton propre compte/domaine Cloudflare) pointant vers le
port `8099` de cet add-on. Voir le dépôt du projet pour le détail de
cette décision d'architecture.

*(Une précédente version exposait aussi le port 8099 directement sur le
réseau local en secours ; retiré en 0.2.1 suite à un conflit de port
avec d'autres add-ons — voir `CHANGELOG.md`. L'accès se fait uniquement
via l'Ingress pour l'instant.)*

## Limitations connues de la V1

- **Netflix et les autres plateformes avec DRM ne sont pas
  supportées** — seuls les liens vidéo directs (mp4/HLS/YouTube)
  fonctionnent. Le support Netflix est prévu en V2 et nécessitera une
  extension navigateur séparée.
- **Chat audio non disponible** — seul le chat texte est actif en V1.
- **Le lien vidéo d'un salon n'est pas modifiable** une fois le salon
  créé — il faut créer un nouveau salon pour changer de vidéo.
- **Pas de vérification de session au chargement de la page** : si ta
  session a expiré, la première action échouera avec un message
  d'erreur plutôt qu'une redirection automatique vers l'écran de
  connexion — reconnecte-toi simplement dans ce cas.
