# Agreed Workflow — Ourmovie

Référence vivante sur comment le travail est réparti entre toi et
l'agent sur ce projet. À modifier directement dès que la convention
change — c'est la source de vérité, pas un doc figé posé une fois.

## Répartition du travail

| Quoi | Comment | Qui touche |
|---|---|---|
| Recherche technique (comment marchent Teleparty/Rave/etc., contraintes DRM) | Recherche web + synthèse dans `discrepancies.md` | Agent, humain valide les conclusions |
| Décisions d'architecture (stack, périmètre MVP) | Proposées par l'agent, tranchées par toi | Humain décide ; agent applique après accord |
| Code de l'add-on (une fois l'architecture actée) | Édition de fichiers directe dans `B:\Claude\Duomovie` | Agent, sauf logique métier ambiguë → demande d'abord |
| Comptes/identifiants externes (Netflix, autres plateformes) | Jamais stockés en clair par l'agent | Humain uniquement |
| Remote Git | `github.com/KingjulianB/Ourmovie` (vide pour l'instant) | — |
| Commits / push | À confirmer avant le premier commit — voir `project_log.md` #1 | Humain décide si/quand ; agent ne commit ni ne push sans accord explicite |

## Gotchas d'environnement / outils

### Gotchas spécifiques Home Assistant

- **Port 8099 très disputé entre add-ons.** Ne pas ajouter de mapping
  `ports:` explicite "juste au cas où" — ça réserve réellement le port
  côté hôte et peut entrer en conflit avec un autre add-on déjà
  installé. `ingress_port` seul ne réserve rien côté hôte. (Rencontré
  en 0.2.0, corrigé en 0.2.1 — voir `OURMOVIE-FIX-LOG.md`.)
- **L'Ingress sert l'add-on sous un préfixe variable**
  (`/api/hassio_ingress/<token>/`), jamais à la racine du domaine. Tout
  chemin **absolu** (`/app.js`, `/api/...`) dans le HTML/JS pointera
  vers la racine de Home Assistant au lieu de l'add-on — CSS/JS ne
  chargeront pas, silencieusement (pas d'erreur bloquante visible pour
  l'utilisateur, juste une page sans style/interaction). Toujours
  utiliser des chemins relatifs pour les assets, et calculer un
  "BASE_PATH" côté client (depuis `window.location.pathname`) pour tout
  ce qui a besoin d'un chemin absolu réel (ex : l'option `path` du
  client Socket.IO, qui ne fait pas de résolution relative comme un
  `<script src>`). (Rencontré et corrigé en 0.2.2.)
- **Ne jamais logger la query string** d'une requête HTTP sans y
  réfléchir — un bug frontend peut faire retomber un formulaire sur une
  soumission GET native du navigateur, ce qui met les champs (mot de
  passe inclus) en clair dans l'URL, donc dans les logs du serveur.
  Corrigé en 0.2.2 via un serializer `req` custom sur le logger
  Fastify qui retire systématiquement la query string.

## Pourquoi certaines opérations nécessitent une validation explicite

Rien de lent/risqué identifié pour l'instant (pas encore de
déploiement, de migration, ni d'intégration de comptes tiers). Cette
section sera complétée dès qu'une opération de ce type apparaît (ex :
publication de l'add-on, connexion à un vrai compte Netflix).

## Suivi de tâches pour le travail multi-étapes

Pour toute implémentation à plusieurs étapes, une liste de tâches
explicite est créée avant de commencer et mise à jour au fil de
l'avancement — chaque étape passée en "en cours" juste avant d'être
lancée puis "terminée" juste après, jamais en bloc à la fin. Ça donne
une visibilité en temps réel plutôt qu'un mur de résultats d'un coup,
et ça permet de voir exactement ce qu'il reste si une session est
interrompue en cours de route.

## Journal d'incidents

Ajout uniquement — une entrée par chose qui a mal tourné. Le but n'est
pas de blâmer, c'est d'éviter de redécouvrir la même erreur. Ne jamais
supprimer ou modifier une entrée existante ; ajouter des corrections
comme nouvelles entrées.

*(aucun incident pour l'instant)*
