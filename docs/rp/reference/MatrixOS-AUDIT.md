# MatrixOS — Audit vérifié et comparaison

Dépôt figé : `2e6977cc15d3aea05bdc2c80b9073b963c76108e`. Analyse statique et simulations locales; aucune validation de la sauvegarde réelle.

## Constats prioritaires

Les reproductions et preuves statiques sont distinguées. « Statique » confirme le chemin de code, sans mesurer sa fréquence ni ses conséquences sur la partie du joueur.

### A01 — Réserves écrasées

**P0 · reproduit; lot L01.** coordinator.js écrit un objectif avec budgets puis writeState réécrit le même fichier sans budgets. Notre scénario à 60 G$ donne une réserve de 9 G$ au lieu du jalon 100 G$.

Preuve : [matrix/services/coordinator.js:330](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/coordinator.js#L330).

### A02 — Pause incomplète

**P0 · statique; lot L02.** Go ne consulte pas masterEnabled; le worm ne consulte pas la configuration. Dormir dans une boucle ne termine pas les activités persistantes du jeu.

Preuve : [matrix/services/go.js:52](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/go.js#L52).

### A03 — Mise à jour partielle

**P0 · statique; lot L04.** Le manifeste final est écrit avant la copie des fichiers. Pas de journal de reprise transactionnel visible; arrêt omettant coordinateur, Go et Stanek.

Preuve : [install.js:209](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/install.js#L209).

### A04 — Dépenses non arbitrées

**P0 · statique; lot L03.** TOR, programmes, augmentations et dons ne suivent pas tous la réserve stratégique; corporation crée sans grant personnel. Corriger avec des grants propres à chaque objectif.

Preuve : [matrix/services/singularity.js:47](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/singularity.js#L47).

### A05 — Liquidation sans 4S ignorée

**P1 · reproduit; lot L05.** Un portefeuille existant avec TIX mais sans 4S reçoit zéro appel sellStock et une télémétrie de positions à zéro.

Preuve : [matrix/services/stock.js:42](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/stock.js#L42).

### A06 — Mauvaise échelle de karma

**P1 · reproduit; lot L01.** Avec SF2 hors BN2 et karma -100, le coordinateur sort de la phase karma. Le seuil officiel hors BN2 est -54000.

Preuve : [matrix/services/coordinator.js:145](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/coordinator.js#L145).

### A07 — Plafond de fraction de hack violé

**P1 · reproduit; lot L06.** Un hackPercent synthétique de 0.6 produit une forme f=0.6 malgré maxHackFraction=0.4. Vérifier le prélèvement après conversion en threads.

Preuve : [matrix/lib/hacking-planner.js:107](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/lib/hacking-planner.js#L107).

### A08 — Blocage des cibles suivantes

**P1 · statique; lot L06.** Les sorties break fill arrêtent toute admission quand la première forme ne tient pas. Une cible plus petite peut pourtant tenir.

Preuve : [matrix/services/hacking.js:1279](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/hacking.js#L1279).

### A09 — Perte de travail sleeves

**P1 · statique; lot L03.** Réattribution du crime à chaque cycle. La méthode officielle crée un nouveau SleeveCrimeWork, même si le crime demandé est inchangé.

Preuve : [matrix/services/sleeves.js:58](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/sleeves.js#L58).

### A10 — Budget sleeves et unicité faction

**P1 · statique; lot L03/L16.** Le budget est recalculé pour chaque sleeve et les mêmes directives rep sont appliquées à tous. L’API ne permet pas deux sleeves sur la même faction.

Preuve : [matrix/services/sleeves.js:60](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/sleeves.js#L60).

### A11 — Prix estimés utilisés pour sélectionner les achats

**P1 · statique; lot L03/L14.** Home utilise une formule locale; cloud choisit une taille sur SERVER_COST_PER_GB puis achète sans comparer le coût API au budget choisi.

Preuve : [matrix/services/cloud.js:29](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/cloud.js#L29).

### A12 — Capacités trop optimistes

**P1 · statique; lot L02/L11.** manualActions retourne [] dès Singularity. Pourtant le service se lance à 512 Go et ne contient pas d’exécuteurs voyage/company/backdoor/crime/gym.

Preuve : [matrix/lib/capabilities.js:139](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/lib/capabilities.js#L139).

### A13 — État installé / acheté confondu

**P1 · statique; lot L05.** hasRedPill est calculé avec getOwnedAugmentations(true), qui inclut les augmentations en file.

Preuve : [matrix/services/singularity.js:206](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/singularity.js#L206).

### A14 — Readiness World Daemon

**P1 · amendement; lot L05.** La route Bladeburner manque, mais imposer universellement Red Pill à destroyW0r1dD43m0n ne reproduit pas son implémentation 3.0.1. Distinguer API, visibilité normale et politique RP.

Preuve : [matrix/services/progression.js:19](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/progression.js#L19).

### A15 — Contrats sans acquittement

**P1 · statique; lot L13.** dispatched mémorise une soumission réussie, pas un résultat. Worker tué, solver non supporté ou tentative ratée peuvent rester bloqués jusqu’au redémarrage.

Preuve : [matrix/lib/dispatch.js:68](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/lib/dispatch.js#L68).

### A16 — Contrats 3.0.1 manquants

**P2 · statique; lot L13.** Les solveurs Total Number of Primes et Largest Rectangle in a Matrix sont absents; Square Root et Compression III sont présents.

Preuve : [matrix/lib/solvers.js:230](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/lib/solvers.js#L230).

### A17 — Cap de hashes artificiel

**P1 · statique; lot L14.** SERVER_UPGRADE_LIMIT=12 est décrit comme règle du jeu. Remplacer le compteur partagé par niveaux API, effets marginaux et horizon économique.

Preuve : [matrix/lib/hashes.js:15](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/lib/hashes.js#L15).

### A18 — Hacknet sans cache ni ROI

**P2 · statique; lot L14.** Le service compare uniquement les prix de node/level/RAM/core. L’expansion de capacité de hashes manque.

Preuve : [matrix/services/hacknet.js:4](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/hacknet.js#L4).

### A19 — Worm coûteux et télémétrie trompeuse

**P2 · statique; lot L07.** Chaque propagateur scanne tout le réseau et relance d’autres propagateurs. drones=botnetUsed/DRONE_RAM inclut de la RAM occupée par d’autres tâches.

Preuve : [matrix/worm/spread.js:177](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/worm/spread.js#L177).

### A20 — Santé fondée sur présence

**P1 · statique; lot L02.** ensureOne considère un PID comme running sans progrès/heartbeat du service. Les reprises UI disposent déjà de protections spécifiques à conserver.

Preuve : [matrix/start.js:102](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/start.js#L102).

### A21 — Gift, Bladeburner et corporation partiels

**P2 · statique; lot L17/L18.** Stanek ne fait pas acceptGift ni placement; Bladeburner utilise la moyenne des probabilités; corporation reste un bootstrap Agriculture incomplet.

Preuve : [matrix/services/stanek.js:54](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/services/stanek.js#L54).

### A22 — Documentation incohérente

**P2 · statique; lot L00/L02.** README annonce full à 32 Go; stages.js fixe full à 64. HANDOFF annonce encore 0.9.2. Générer les tableaux depuis le registre.

Preuve : [matrix/lib/stages.js:4](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/lib/stages.js#L4).

### A23 — Plan BitNode borné à 13

**P2 · statique; lot L05/L19.** Les valeurs 14 et 15 sont écartées avant planification.

Preuve : [matrix/lib/common.js:352](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/matrix/lib/common.js#L352).

### A24 — Domaines absents

**P2 · à implanter; lot L11/L19/L20.** Aucun service Darknet ou Grafting dans le manifeste; pas de parcours complet de carrière/factions malgré les bibliothèques d’aide.

Preuve : [manifest.json:12](https://github.com/evilguard1/Matrix-OS/blob/2e6977cc15d3aea05bdc2c80b9073b963c76108e/manifest.json#L12).

## Corrections à apporter au compendium

Le document est un journal historique utile, pas une spécification de bugs tous encore ouverts. Les numéros Cxxx du registre joint suivent les titres de niveau 4 dans leur ordre original; les sauts correspondent aux directions de recherche. Les reprises et amendements restent reliés plutôt que comptés comme de nouvelles anomalies.

- **World Daemon :** lire [src/NetscriptFunctions/Singularity.ts:1153](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/Singularity.ts#L1153). La branche accepte hacking/root OU fin des BlackOps et n’ajoute pas de test direct de Red Pill. Les règles de visibilité sont séparées. Le compendium doit retirer son affirmation universelle de faux positif et conserver les autres problèmes de readiness.

- **Karma :** [src/PersonObjects/Player/PlayerObjectGangMethods.ts:12](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Player/PlayerObjectGangMethods.ts#L12) distingue BN2, Source-File et seuil. Ne pas imposer -54000 à BN2.

- **Sleeves :** [src/PersonObjects/Sleeve/Sleeve.ts:192](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Sleeve/Sleeve.ts#L192) recrée le travail; cette partie du compendium est confirmée par 3.0.1.

- **Worm et paliers :** ancienne règle des 35 % historique; relève désormais à 64 Go. Le problème des propagateurs et de leur comptage subsiste.

- **Ranking :** le scheduler roulant et le classement Formulas existent. Les reconcevoir comme nouveautés ferait perdre des améliorations récentes. Le fallback et l’admission fragmentée restent à améliorer.

- **TOR :** le coordinateur utilise désormais hasTorRouter; le producteur Singularity conserve cependant son booléen trompeur. Ne pas classer tout le sujet TOR comme corrigé ou tout comme ouvert.

- **Probes :** l’erreur de probe d’un stage antérieur est corrigée. Une probe unique ne prouve toujours pas l’intégrité du payload.

- **Dev vs stable :** les liens /dev du compendium ne définissent pas la version cible. Les API 3.0.1 sont la référence; vérifier chaque mécanique avancée à son lot.

- **Qualité rédactionnelle :** conserver les conclusions et preuves utiles, remplacer les répétitions horaires par tickets, états, version vérifiée, contre-exemple et critère de fermeture. Les exemples de code dans le compendium ne constituent pas une autorisation d’exécution.

## Comparaison des créateurs

| Source examinée | Ce qui est utile à MatrixOS | Ce qui exige adaptation |
|---|---|---|

| [Alain Bryden — autopilot](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/autopilot.js) | Délais de décision avant reset, orchestration par objectifs, coordination de réserves | Ses valeurs par défaut incluent des automatismes très larges; choisir une politique compatible avec ton RP |

| [Alain — stockmaster](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/stockmaster.js) | Historique pré-4S, changement de régime, frais, seuils d’entrée/sortie | Recalibrer sur 3.0.1 et mesurer le rendement net; ne pas copier ses probabilités comme garanties |

| [Alain — Hacknet](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/hacknet-upgrade-manager.js) | Payback et gain marginal | Valorisation des hashes doit suivre l’objectif actuel, pas une conversion fixe |

| [Droid — allocator](https://github.com/TheDroidYourLookingFor/BitBurner-Scripts/blob/8964992a9aca2f3c20e60dd00f1756689aac07dd/lib/allocator.js) | Fenêtre de lancement, signaux de complétion, arrêt après départ partiel | Intégrer dans les leases, coûts RAM et identifiants MatrixOS; conserver les garanties du scheduler actuel |

| [Droid — Darknet](https://github.com/TheDroidYourLookingFor/BitBurner-Scripts/blob/8964992a9aca2f3c20e60dd00f1756689aac07dd/droid-darknet.js) | Sessions, tentatives bornées, traitement de mutations et tâches spécialisées | Relire chaque appel dans les définitions 3.0.1 et isoler ce domaine des hôtes normaux |

| [drabepet — main](https://github.com/drabepet/bitburner/blob/2e32643d5a396c698587bfc892bb1153c9d09c4c/main.js) | Un orchestrateur réseau et des modules indépendants | Code plus simple, cible initiale n00dles et seuils grossiers; pas un remplaçant supérieur au rolling scheduler |

Aucun de ces ensembles n’a été exécuté dans ta partie. La comparaison porte sur le code et les stratégies, pas sur un benchmark comparatif. Aucun module tiers n’a été intégré. Alain dispose d’un LICENSE MIT à la racine et MatrixOS possède déjà une attribution. Aucun fichier LICENSE racine n’a été trouvé dans les deux autres snapshots; étudier les idées, et établir les conditions de réutilisation avant de reprendre leur texte source.

## Liaison au lore

La principale incohérence immédiate du lore est temporelle : il démarre après une capture BN1 déjà faite, alors que le joueur est encore en BN1. L’édition révisée initialise une pré-campagne, déclenche le livre I à une transition réelle, et sépare matériellement secrets GM et contexte du GPT. Les autres renforcements concernent provenance des anomalies, réalité des ressources Ghost et branches après restauration de sauvegarde.

## Limites de l’audit

Pas de connexion au jeu, pas de tests de performance live, pas de mesure mémoire Windows/Steam, pas de validation du GPT ou de son endpoint existant. Le registre distingue les points statiques recontrôlés des propositions encore à réexaminer entièrement. Le code officiel, les tests et les quatre simulations soutiennent les corrections prioritaires; ils ne prouvent pas la fiabilité de futurs lots non écrits.
