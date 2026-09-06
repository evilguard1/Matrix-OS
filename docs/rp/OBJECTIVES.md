# Objectif durable de réputation — 1.11.0-rp.7

Cette version ajoute une intention exécutable : atteindre un seuil absolu de réputation auprès d'une faction déjà rejointe. Le worker Singularity poursuit l'objectif entre les conversations, au fil de ses cycles ordinaires.

## Utilisation en BN4

Le moteur complet doit être installé, avec home à 64 Go ou plus. Il faut déjà être membre de la faction demandée.

```text
run /matrix/objective.js faction CyberSec 250000 mission-cybersec-1
run /matrix/objective.js status
run /matrix/briefing.js
```

Pour un nom contenant des espaces, utiliser des guillemets. Le seuil est absolu : `250000` signifie atteindre 250 000 de réputation totale, pas en gagner 250 000 supplémentaires. Il doit être fini, strictement positif et au plus égal à 10¹². L'identifiant est facultatif pour un opérateur local ; un client IA doit en conserver un stable pour les retries.

La commande consomme **3,3 Go** et le worker de travail **8,6 Go en BN4**, tous deux mesurés dans le moteur officiel 3.0.1. Le worker réutilise la place séquentielle existante ; le maximum du cycle demeure 23,1 Go. Hors BN4, l'accès SF4 et les coûts natifs s'appliquent. Une commande acceptée ne garantit pas que le cycle dispose de RAM, que tous ses fichiers sont installés, ou que le travail peut commencer.

Pour retirer l'objectif et rendre la sélection du travail à la politique automatique :

```text
run /matrix/objective.js auto retour-auto-1
```

Ce reçu confirme la politique enregistrée. Il n'arrête pas instantanément l'activité du joueur et ne certifie pas le choix suivant du worker. Pour suspendre le travail attribué à MatrixOS, utiliser le [protocole pause/reprise](CONTROL.md). Reprendre MatrixOS reprend aussi l'objectif actif, sans réémettre la commande.

## Exécution et états

Le journal `/matrix/state/objective-journal.txt` contient un objectif actif et les reçus conservés. Une écriture canonique, synchrone et relue, précède le démarrage du travail. Le worker relit la réputation native ; il ne déduit jamais une réussite du simple lancement d'un script.

| Statut | Signification |
| --- | --- |
| `accepted` | Intention enregistrée ; attend le worker. |
| `starting` | Intention de travail persistée, avant l'appel natif. |
| `working` | Travail de faction observé avec attribution MatrixOS correspondante. |
| `observing` | Travail de cette faction déjà en cours, conservé sans en revendiquer la propriété. |
| `blocked` | Faction non rejointe, activité manuelle différente ou travail non démarré ; le worker réévalue au prochain cycle. |
| `succeeded` | Une lecture native constate `currentRep >= targetRep` dans le même reset. L'objectif actif est libéré et la sélection automatique redevient applicable au cycle suivant. |
| `cancelled` | Une commande `auto` a retiré cet objectif. |
| `reset-interrupted` | Le worker a constaté un autre reset. L'objectif n'est pas transféré automatiquement au nouveau reset. |

La détection de réussite intervient lors du passage du worker ; le seuil peut être dépassé avant cette observation. Il ne s'agit pas d'un plafond de réputation ni d'une promesse d'arrêt exact du travail. La réputation peut venir du travail, d'autres gains ou d'une activité existante : la postcondition porte sur le seuil observé, pas sur l'origine exclusive de chaque point.

Une activité manuelle différente n'est pas remplacée. L'attribution existante distingue faction, type de travail et reset ; elle ne distingue pas une reprise manuelle du même travail exact d'une ancienne attribution identique. L'arbitre général reste ouvert dans RP03.

Les achats, dons et autres gestionnaires conservent leurs politiques et budgets habituels. Cet objectif remplace seulement la sélection du travail de faction ; il n'ajoute pas une autorisation de dépense ou un plan d'achats spécifique. Les installations automatiques d'augmentations et la sortie automatique du node attendent la libération de l'objectif. Un journal invalide les bloque également. Les resets manuels restent possibles ; le briefing masque immédiatement l'ancien objectif et le worker inscrit `reset-interrupted` lorsqu'il peut de nouveau s'exécuter.

## Contrat d'intégration IA

- Une seule intention est active. Pour en changer, revenir explicitement à `auto`, puis soumettre le nouvel objectif.
- Un identifiant déjà enregistré avec le même contenu retourne son état courant sans réarmer l'objectif, même après réussite ou reset. Un contenu différent sous le même identifiant est refusé.
- Le journal conserve ses identifiants. Les nouvelles intentions sont refusées à partir de 1023 reçus ; la dernière place reste disponible pour retourner à `auto`. Aucune éviction ni rotation automatique n'est implémentée.
- Aucun timeout n'annule un objectif long. Un blocage ou une pause peut le conserver indéfiniment ; cela retarde aussi les resets automatiques. L'opérateur doit choisir `auto` pour le retirer.
- Le [briefing](BRIEFING.md) donne priorité à l'objectif explicite lorsque son epoch, sa fraîcheur et ses propriétaires sont vérifiés. Sinon il affiche un objectif inconnu au lieu de substituer silencieusement un objectif automatique concurrent.
- Le rapport expose aussi `operatorObjective.active` et `operatorObjective.lastReceipt`. Le dernier reçu est historique : vérifier son epoch et son statut. Seul `succeeded` prouve que le seuil a été observé.

Le routeur GPT, les objectifs de voyage/crime/entreprise, la composition de plans X/Y/Z et leur sélection depuis Ghost restent à développer. La commande locale n'active aucun outil GPT et ne termine pas la campagne.

## Preuves reproductibles

`tests/rp-objective.mjs` couvre rejeu, conflits, seuil réel requis, activité manuelle, pause, changement de reset, défaut d'écriture avant effet, retour automatique, blocage des resets et attribution du briefing. `tests/native/objective.cjs` vérifie le coût réel, le travail de faction, l'interruption du dispatcher puis sa relance par le superviseur, la réussite et le rejeu.

La [preuve native](evidence/objective/native.json) utilise un moteur officiel 3.0.1 isolé. BN4, RAM, appartenance CyberSec et XP sont synthétiques. La réputation est placée à 99 après la reprise ; le vrai travail de faction franchit ensuite la cible de 100 et le vrai worker constate le résultat. Cette recette ne mesure pas le temps d'une route complète et n'utilise pas la sauvegarde Steam du joueur.
