# Plan d'implantation de la version jouable

## Décision de périmètre

Le chemin critique est RP01 → RP02/03 → RP04 → RP05 → RP06 → RP07 → RP08 → RP09 → RP10 → RP11. Les optimisations et domaines optionnels sont RP12. Les dépendances exactes et chemins sont dans [backlog.json](backlog.json).

L'ancien plan de 21 lots est conservé en référence. Son « MVP RP » pouvait ouvrir une conversation avant d'avoir tous les moyens de terminer BN4. Le nouveau critère exclut cette ouverture prématurée. Une belle scène sans exécuteur n'est pas une fonctionnalité livrée.

## Mode de travail pour l'IA qui reprend

Partir de cette branche, relire sources.json et refaire un fetch pour détecter les changements ultérieurs. Ne pas utiliser une autre branche comme remplacement global. Lire le lot et ses constats Axx avant édition, produire les tests de résultat, implémenter puis mesurer dans le moteur 3.0.1 quand les appels/RAM changent. Un lot = un changement révisable, avec preuve, rollback et impact sur les contrats. Ne jamais confondre une validation mock avec celle de la sauvegarde utilisateur.

Utiliser les fichiers proposés comme frontières de responsabilité; si une bibliothèque équivalente existe, l'étendre et documenter le chemin final plutôt que créer un doublon. Les chemins de nouveaux dossiers sont une architecture cible, pas des modules déjà présents. Le registre sera la source des tables de docs, du dashboard, des capacités API et des scénarios.

Le gate RP11 exige de fermer tous les défauts P0/P1 des chemins activés, même si le lot historique correspondant est rangé dans les extensions. A07/A08 affectent le moteur actuel : leur correction n'attend pas une éventuelle optimisation Home. Les constats sleeves/gang/corporation peuvent être différés uniquement si ces capacités sont explicitement exclues du profil et des scènes.

## Lots détaillés

### RP00 — Base, audit et Ghost

**État :** delivered-audit-only. **Dépendances :** aucune. **Rapprochement historique :** L00, UI01, UI02, UI03, UI04.

**Fichiers :** `docs/rp`, `matrix/dashboard.jsx`, `tests/ghost-deck.mjs`, `tests/ghost-installer.mjs`.

Conserver 1.10.2, intégrer Ghost identique au SHA testé, inventorier branches et propositions, distinguer preuves rapportées/locales/natives.

**Critère de fermeture :** npm test; test:ghost; test:rp-contract. La preuve native de Ghost doit correspondre aux octets de source; rpReady reste false.

**Retour arrière :** Revenir au commit parent restaure le dashboard; les originaux et le dossier auteur sont conservés.

### RP01 — Vérité opérationnelle et budgets

**État :** planned. **Dépendances :** RP00. **Rapprochement historique :** L01, L03.

**Fichiers :** `matrix/services/coordinator.js`, `matrix/lib/common.js`, `matrix/lib/state.js`, `matrix/lib/budget-ledger.js`.

Une écriture canonique conserve budgets, id, phase et révision. Ajouter epoch/TTL, prix API avant achat, grants atomiques réservés par propriétaire et journal. Corriger karma hors BN2 et maintenir chemins de dépense propriétaire.

**Critère de fermeture :** A01 devient test de résultat 100 G$; zéro budget discrétionnaire à 60 G$ sur cet objectif. Deux dépenses simultanées ne dépassent pas le cash engagé. État corrompu/périmé ne devient pas permission de dépenser.

**Retour arrière :** Lecteur N-1 et reconstruction du ledger depuis reçus; pas de répétition automatique des achats au rollback.

### RP02 — Canal RP et mises à jour reprenables

**État :** planned. **Dépendances :** RP01. **Rapprochement historique :** L04.

**Fichiers :** `install.js`, `matrix/update.js`, `matrix/lib/common.js`, `matrix/start.js`, `manifest.json`.

Introduire profil de release séparé de config : canal autorisé, SHA immuable, version de schéma, hashes du payload et précédent connu bon. Pas de fallback silencieux main. Préparer dans staging, valider, journaliser, arrêter propriétaires, promouvoir, lancer, constater santé; rollback si lancement invalide. Config protégée reste conservée.

**Critère de fermeture :** Installations aux paliers 8/16/64/128/256 et passage automatique conservent le même canal. Coupures simulées à chaque phase, fichier manquant, hash faux et rate limit GitHub : aucun mélange de versions accepté. Mesurer RAM native de l'installateur.

**Retour arrière :** Pointeur sur release précédente avec journal de migration; restauration contrôlée des seuls fichiers possédés.

### RP03 — Capacités, pause et arbitre des activités

**État :** planned. **Dépendances :** RP01. **Rapprochement historique :** L02, L03, L07.

**Fichiers :** `matrix/start.js`, `matrix/lib/capabilities.js`, `matrix/services`, `matrix/worm`, `matrix/lib/activity-arbiter.js`.

Registre unique : API permise, fichier installé, RAM mesurée, service vivant, progrès et test de postcondition. Leases exclusives pour activité joueur, faction sleeve et backdoor. Drainage H/G/W, partage, Go, worm, Stanek et tâches persistantes sous protocole commun.

**Critère de fermeture :** Pause pendant charge : aucune nouvelle admission après acquittement; tâches possédées finissent/cessent selon policy; processus étranger intact; reprendre ne crée pas de doublons. Singularity disponible sans exécuteur n'est jamais READY.

**Retour arrière :** Lecture seule possible; expiration des leases sans voler une activité manuelle inconnue.

### RP04 — Routeur de commandes et journal durable

**État :** planned. **Dépendances :** RP02, RP03. **Rapprochement historique :** L08.

**Fichiers :** `matrix/control`, `matrix/lib/commands.js`, `matrix/state`, `tests/control`.

Définir schemas stricts, plans persistants, version et préconditions. Rejet du code libre. Dispatcher par exécuteurs installés à RAM mesurée, enveloppes de dépense, TTL, idempotence et acquittement métier. Annulation et planification longue hors GPT.

**Critère de fermeture :** Doublon, conflit de payload, deux clients, requête périmée, changement d'epoch et crash avant/après effet : aucun double achat/reset. Reçu succeeded seulement si postcondition vérifiée.

**Retour arrière :** Désactiver admissions externes, conserver le journal, réconcilier les travaux; ne pas purger les reçus.

### RP05 — Parcours Singularity BN4 complet

**État :** planned. **Dépendances :** RP01, RP03, RP04. **Rapprochement historique :** L11, L12.

**Fichiers :** `matrix/services/singularity.js`, `matrix/lib/factions.js`, `matrix/lib/company.js`, `matrix/workers/singularity`, `matrix/lib/route-planner.js`.

Découper les appels coûteux en workers courts. Implémenter TOR/programmes/Home, voyage, entraînement, crimes, candidature/travail company, invitations, backdoors, travail faction, dons et panier d'augmentations avec prérequis. Détecter la route réalisable selon SF/ville/faction/argent. Poursuivre un objectif sans tours GPT supplémentaires.

**Critère de fermeture :** Route nouvelle partie BN4 pauvre → programmes → faction de hacking → réputation → achat. RAM native de chaque worker sous BN4 puis SF4 niveaux 1/2/3 hors BN4; leases empêchent tout écrasement de tâche manuelle; interruption/reprise de backdoor testée.

**Retour arrière :** Suspendre le plan, libérer ses leases, conserver les étapes déjà accomplies; aucune annulation fictive des achats.

### RP06 — Augmentations, liquidation et boucle de reset

**État :** planned. **Dépendances :** RP02, RP04, RP05. **Rapprochement historique :** L05, L12.

**Fichiers :** `matrix/services/stock.js`, `matrix/services/singularity.js`, `matrix/services/progression.js`, `matrix/lib/reset-plan.js`.

Valoriser et liquider positions TIX avec ou sans 4S; contrôler résultat de vente et commissions. Distinguer augs achetées/installées. Construire plan de reset coût/bénéfice, achat cher d'abord/NFG borné, autorisation liée au plan, checkpoint, reboot et nouvel epoch. Route World Daemon conforme 3.0.1; initialement sortie vers BN4 explicitement choisie.

**Critère de fermeture :** A05 ferme sur ventes réelles simulées et portefeuille relu; vente refusée ne publie pas zéro. Un cycle achat→installation→redémarrage reconstruit objectifs et contrôle. Double soumission de reset ne produit qu'un effet. BN1→BN4 déclenche une seule transition.

**Retour arrière :** Restaurer le programme et son journal; un reset du jeu est irréversible dans ce protocole, jamais relancé pour corriger une absence de reçu.

### RP07 — Briefing, objectifs et options réalisables

**État :** planned. **Dépendances :** RP04, RP05, RP06. **Rapprochement historique :** L09, L11, UI03.

**Fichiers :** `matrix/lib/objectives.js`, `matrix/lib/briefing.js`, `matrix/control/plans`, `matrix/services/telemetry.js`.

Calculer métriques et blocages explicites, comparer le curseur aux événements, produire 2–3 plans utiles seulement si admissibles, ou moins si aucune alternative réelle. Progression versionnée par objectif, coûts bornés, ETA nullable, stale interdit. Un objectif long compose des primitives installées.

**Critère de fermeture :** 100000/250000→40% de réputation, jamais 40% natif BN. Une inconnue conserve null. Trois choix obsolètes ne sont pas réofferts. Simulation de pénurie, API verrouillée, lease occupée : blocage correct et voie viable ou report.

**Retour arrière :** Servir le dernier snapshot étiqueté périmé, aucune nouvelle option exécutable tant que l'état manque.

### RP08 — Gateway et Actions du GPT

**État :** planned. **Dépendances :** RP04, RP07. **Rapprochement historique :** L09.

**Fichiers :** `gateway`, `docs/rp/reference/gateway-openapi.json`, `tests/gateway`.

Auditer le bridge existant, propriétaire unique RFA; adapter plutôt que doubler. Ajouter lectures cohérentes, plans, commandes, reçus et pagination. HTTPS/auth, schema strict, sessions non exposées; aucune API de shell/code du GPT. Étendre le schéma initial seulement pour les commandes passées en recette.

**Critère de fermeture :** Dans le GPT réel : lecture fraîche, option, ordre, reçu final; 401, 429, timeout, déconnexion et reconnexion. Requêtes asynchrones bornées sous 45s; un doublon conserve requestId. Routes majeures séparées et confirmation liée au plan.

**Retour arrière :** Couper les écritures API; autopilote local poursuit sa politique existante. Rotation d'une clé sans changer l'état du jeu.

### RP09 — Directeur narratif et continuité

**État :** planned. **Dépendances :** RP06, RP07, RP08. **Rapprochement historique :** L10.

**Fichiers :** `campaign/engine`, `campaign/schema`, `gateway/projection`, `tests/campaign`.

Interpréter des données de scènes avec conditions, effets narratifs bornés, choix et report; aucun code dynamique. Journal des connaissances séparé du coffre GM privé. Déclenchement BN4 observé; préserver découvertes entre resets d'augmentations et conversations. Couvrir toutes les branches du premier chapitre avec options exécutables.

**Critère de fermeture :** Replay d'événement et nouvelle conversation ne doublent pas scène/révélation. Choix refusé ou reporté ne bloque pas le jeu. Aucun secret futur dans payload, log ou bundle. Scène sans plan admissible propose attendre/expliquer, jamais développer un script.

**Retour arrière :** Désactiver nouvelles scènes et conserver le journal; pas d'effacement des connaissances déjà révélées.

### RP10 — Ghost comme console de commandement

**État :** planned. **Dépendances :** RP03, RP07, RP09. **Rapprochement historique :** UI01, UI02, UI03, UI04.

**Fichiers :** `matrix/dashboard.jsx`, `tests/render-deck.mjs`, `tests/ghost-deck.mjs`.

Raccorder les neuf vues au même briefing/routeur que le GPT. Cartes de décisions, coûts, blocages, journal et reçus métier; commandes de configuration héritées distinguent saved et achieved jusqu'au remplacement. Conserver mode léger, accessibilité et largeur du tail.

**Critère de fermeture :** Chaque choix UI et GPT produit le même plan/reçu. Fresh/stale/locked/ram-blocked/draining distincts; callbacks React sans Netscript; mesurer RAM native aux paliers et navigation sans fuite de fenêtres.

**Retour arrière :** Lecture seule Ghost ou ancienne UI; aucun état de campagne supprimé.

### RP11 — Certification et gel de la version jouable

**État :** planned. **Dépendances :** RP02, RP03, RP04, RP05, RP06, RP07, RP08, RP09, RP10. **Rapprochement historique :** L00, L20.

**Fichiers :** `docs/rp/RELEASE-GATES.md`, `docs/rp/release-status.json`, `tests/e2e`, `release`.

Exécuter tous les scénarios sur release immuable, parcours BN4 complet et tests de panne; collecter preuves, décider go/no-go. Revue des 24 constats : tout P0/P1 sur un chemin activé doit être fermé ou le chemin retiré du profil. Publier ensuite un tag rp-bn4-v1.0.0 et geler API/mécaniques pendant le chapitre.

**Critère de fermeture :** Tous les gates passent; zéro édition de scripts pendant le parcours, un reset augmentation et un cycle fin BN4 observés, 8h de stabilité, trois reprises et 100 dialogues/choix sans capacité inventée. Aucun rpReady=true avant preuves.

**Retour arrière :** Revenir à la release précédente validée entre sessions; incidents en lecture seule explicable, pas d'auto-patch par le GPT.

### RP12 — Optimisations et domaines optionnels

**État :** planned. **Dépendances :** RP11. **Rapprochement historique :** L06, L13, L14, L15, L16, L17, L18, L19, L20.

**Fichiers :** `matrix/lib/core-aware.js`, `matrix/services/darknet.js`, `matrix/services`, `tests`.

Porter PR6 sans perdre 1.10.2; tester PR7 intégré. Compléter solveurs, Hacknet, gang, sleeves, Bladeburner, corporation, Stanek, Grafting et autres BN par paquets de capacités versionnés. Les corrections bloquantes A07/A08 sur le moteur actif remontent avant RP11; les nouvelles optimisations restent optionnelles.

**Critère de fermeture :** Recette ciblée par paquet, coûts RAM et non-régression revenus/drainage/propriété. Aucun chapitre ne dépend d'un paquet non certifié; demander une capacité indisponible donne un choix viable existant.

**Retour arrière :** Désactiver le paquet et ses seules tâches, journal intact; ne jamais remplacer tout le scheduler par une branche ancienne.

## Format d'une livraison de lot

Mettre à jour le statut seulement après réalisation : commit exact, diff, commandes de tests avec résultats, données de recette expurgées, capacités ajoutées/retirées, migration et rollback. Maintenir compatibilité des identifiants d'ordres. Un nouveau verbe après gel attend une prochaine version entre les chapitres; une scène se construit par composition de verbes existants.

## Pas de date de fin inventée

Les lots représentent plusieurs chantiers réels, notamment le parcours Singularity et la certification de reset. Les durées dépendront de la RAM, des capacités de départ, des accès au bridge et des échecs constatés. Mesurer le débit de réalisation après RP01–RP04 pour estimer la suite. La recette autorise une attente normale de progression du jeu; elle n'autorise pas une attente de développement.
