# Pause et reprise — 1.11.0-rp.5

Ces commandes pilotent les scripts gérés et le travail de faction attribué à MatrixOS. Elles sont disponibles dès le palier bootstrap. Elles ne constituent pas encore le catalogue de commandes GPT ni une pause du jeu entier.

## Utilisation

Depuis le terminal Bitburner, après installation de cette version :

```text
run /matrix/control.js pause
run /matrix/control.js status
run /matrix/control.js resume
```

La commande coûte 1,65 Go. `accepted` signifie que la demande est enregistrée ; attendre le reçu `succeeded` et lire sa portée. La pause peut attendre la fin des opérations natives déjà en cours. `status` affiche le journal canonique et la dernière observation du contrôleur, avec son horodatage. Une observation ancienne ne prouve pas un contrôleur vivant.

Le bouton historique d'activation du dashboard modifie encore la configuration. Il ne remplace pas ce protocole de pause avec drainage et reçu. Ghost et la télémétrie restent présents pendant la pause lorsqu'ils étaient déjà lancés ; la reprise par le kernel peut recréer la fenêtre Ghost.

Si aucun propriétaire de palier n'est actif pour traiter une demande acceptée, lancer une seule fois :

```text
run /matrix/kernel.js
```

## Contrat pour un futur client IA

Un client peut fournir un identifiant stable de 1 à 96 caractères (`A-Z`, `a-z`, chiffres, `_ . : -`) :

```text
run /matrix/control.js pause scene-42-pause
run /matrix/control.js resume scene-42-resume
```

Rejouer le même identifiant et la même action retourne le reçu existant. Réutiliser un identifiant pour une autre action est refusé. Une seule demande est active ; une reprise peut annuler une pause encore en attente, puis attend elle-même la fin du drainage. Une ancienne tâche d'arrêt du joueur vérifie l'identifiant actif avant tout effet.

Le fichier `/matrix/state/control-journal.txt` contient le schéma, la révision, l'état désiré, la demande active et les reçus. Chaque écriture canonique est synchrone et relue. Le port 20 diffuse la barrière `MATRIX:PAUSED` aux workers distants ; il est réservé à MatrixOS. Le journal demeure l'autorité pour les contrôleurs sur home.

Une reprise en attente expire après 120 secondes et conserve la pause. Les identifiants ne sont pas automatiquement évincés : après 1022 reçus, les nouvelles demandes sont refusées avec `control-retention-full`. Ne pas effacer le journal pour rejouer des identifiants ; sa rotation contrôlée reste à implémenter. La pause est une préférence opérateur persistante entre resets, contrairement à un achat lié à un reset précis. La reprise respecte les préférences enregistrées, y compris `masterEnabled: false`.

## Postconditions et limites

| État observé | Signification |
| --- | --- |
| `draining` | Les producteurs sont arrêtés ; certains workers possédés terminent encore leur opération. |
| `draining-before-resume` | La reprise attend que les anciennes tâches finissent. |
| `partial` | Les scripts peuvent être arrêtés mais la vérification de l'activité joueur manque ou échoue. Aucun succès de pause n'est émis. |
| `paused` | Aucun processus géré de travail ne reste sur le réseau ; le contrôle de l'activité joueur possède un reçu correspondant. |
| `starting` | Le contrôleur a transféré l'exécution au kernel. Ce n'est pas encore un reçu de reprise. |
| `blocked` | Une erreur, par exemple un manifeste absent, empêche la vérification. |

La pause conserve les chemins exacts de Ghost, télémétrie et commandes. Elle identifie les autres scripts possédés par le manifeste installé, arrête les producteurs puis laisse finir H/G/W, partage, drones, charge Stanek et backdoors. Un script tiers, y compris `/matrix/custom.js` absent du manifeste, est préservé. Une ancienne génération de worker qui ne respecte pas le port peut empêcher le drainage : le statut conserve son PID au lieu de déclarer un succès. Installer la version courante et laisser le déploiement des workers se terminer avant la pause.

L'arrêt du joueur s'applique seulement à un travail de faction correspondant à l'attribution MatrixOS du reset courant, avec faction et type de travail identiques. Les activités différentes ou inconnues sont conservées. Une reprise manuelle du même travail exact ne peut pas être distinguée de cette attribution avec ce mécanisme ; l'arbitre général RP03 reste ouvert. Sans accès Singularity, le reçu `locked` indique cette limite et confirme uniquement le drainage des scripts.

Les affectations persistantes de sleeves et de gang, l'action Bladeburner, la simulation de corporation et les activités manuelles ne sont pas suspendues. Leurs producteurs MatrixOS sont arrêtés, mais les effets autonomes du jeu peuvent continuer. Ne pas présenter ce reçu comme une pause globale de ces systèmes.

Un reçu de reprise porte `scope: stage-started`, le palier et son PID. Il confirme le démarrage du propriétaire du palier adapté à la RAM ; il ne certifie pas la santé de tous ses services. La surveillance de santé RP02 et la connexion du GPT restent à livrer.

## Vérification

`tests/rp-control.mjs` couvre les conflits et rejeux, l'annulation, les écritures défaillantes, le refus d'une ancienne demande d'arrêt, les scripts étrangers, les workers sous barrière et la reprise après drainage. `tests/native/control.cjs` exécute les vrais scripts dans le moteur officiel 3.0.1 isolé aux paliers 8/32/64 Go. Les champs de départ sont synthétiques ; ces essais n'utilisent pas la sauvegarde Steam du joueur. La preuve native est liée aux hashes des fichiers distribués dans `evidence/control/native.json`.
