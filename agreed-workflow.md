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

Rien d'identifié pour l'instant — le projet vient d'être bootstrapé
(2026-09-20), aucun code ni infra encore en place. Cette section sera
remplie au fil des sessions dès qu'un piège concret est découvert (ex :
un comportement surprenant de l'add-on store Home Assistant, une
limite de l'Ingress HA, etc.).

### Gotchas spécifiques Home Assistant
*(à remplir une fois qu'on touche réellement au packaging add-on —
config.yaml, Supervisor, Ingress, etc.)*

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
