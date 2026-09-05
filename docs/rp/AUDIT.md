# Audit consolidé au 5 septembre 2026

## Verdict

MatrixOS possède un moteur de hacking substantiel et récemment amélioré. Il ne possède pas encore un système complet de commandement BN4 pour le RP. Ajouter seulement une belle console ou davantage de revenus ne ferme pas les trous des ordres, des parcours de faction, des resets et de la continuité narrative.

Le livrable de cet audit est une base d'intégration, Ghost et un contrat de sortie précis. Ce n'est pas une déclaration d'autopilote universel terminé.

## GitHub relu

Fetch de toutes les branches, lecture des deux PR ouvertes, revue des PR fermées et tests locaux. Les SHA sont dans [sources.json](sources.json). Les comptes rendus des PR sont des preuves rapportées par leur auteur; aucune nouvelle mesure de la sauvegarde du joueur n'a été réalisée ici.

| Élément | État constaté | Décision RP |
|---|---|---|
| main 1.10.2 `681045f` | Suite locale réussie. Scheduler roulant, Formulas, boost REP/MAX, plafond de cibles relevé et formes adaptées à la RAM | Base conservée |
| PR1–5 : rolling, worm, 64 Go, Formulas, boost | PR fermées et fonctionnalités correspondantes présentes dans main; anciens textes « draft » parfois conservés | Ne pas les réinventer ni réinstaller leurs anciennes branches |
| PR8, 1.10.1 | Plafond par défaut 32→1024 et migration protégée intégrés | Conserver la limite choisie par le joueur |
| PR9, 1.10.2 | Formes adaptatives et chemins de repli intégrés | Préserver la correction W2, les snapshots et le drainage des générations |
| PR6 core-aware `cb59e47` | Suite et tests spécifiques réussis; conflit de fusion actuel dans hacking.js | Réconcilier après les fondations RP; conserver simultanément les formes 1.10.2 et le repli à un cœur |
| PR7 Darknet `d582413` | Suite et tests spécifiques réussis; fusion textuelle avec main sans conflit | Extension isolée, sous réserve de recette du superviseur et du budget RAM au SHA intégré |
| Ghost local | Source identique au dashboard testé dans le moteur 3.0.1 isolé | Intégré à cette branche avec tests et outils |

`git merge-tree --write-tree main PR6` a signalé un conflit dans `matrix/services/hacking.js`. Le même contrôle de PR7 n'a signalé aucun conflit. Une fusion sans conflit textuel ne prouve ni la RAM du palier 128 Go ni l'absence de contention. Les deux propositions partent de 1.10.0 : remplacer main par le contenu de leur branche ferait perdre les changements 1.10.1/1.10.2. Leur intégration doit être une fusion ou un port ciblé testé.

Les performances publiées dans PR8/9 proviennent d'un réseau très développé. Elles ne prédisent pas le revenu d'un nouveau BN4 à 8 Go; les nombres théoriques de planification ne sont pas du cash encaissé. L'objectif BN4 exige une recette depuis un départ pauvre.

## Défauts prioritaires recontrôlés

| Défaut | Preuve de cet audit | Conséquence RP |
|---|---|---|
| Réserve stratégique écrasée, A01 | Exécution simulée du vrai coordinateur : budgets absents; réserve 9 G$ pour un objectif 100 G$ avec 60 G$ de cash | « Nous économisons » peut contredire les dépenses réelles |
| Pause globale incomplète, A02 | Go ne teste que son interrupteur; worm et activités persistantes ne participent pas à un protocole commun | Un ordre d'arrêt ne garantit pas l'arrêt annoncé |
| Échelle karma, A06 | -100 hors BN2 avec SF2 produit BOOTSTRAP_INCOME | Mauvais blocage/progrès annoncé; moins central au premier BN4 sans SF2 |
| Plafond de hack, A07 | hackPercent synthétique 0,6 produit f=0,6 avec plafond 0,4 sur 1.10.2 | Le plafond affiché n'est pas une garantie |
| Liquidation avant 4S, A05 | Portefeuille TIX existant, liquidation demandée, zéro vente et positions publiées à zéro | Promesse d'achat/reset financée par des actifs mal lus |
| Admission suivante, A08 | Deux `break fill` demeurent dans hacking.js | Une grosse forme non admise peut empêcher une plus petite de démarrer |
| Capacité réelle, A12/A20 | Singularity admise à 512 Go; liste manuelle supprimée dès API disponible; PID pris comme « running » | « Je peux le faire » et « le service progresse » sont trop optimistes |
| Parcours BN4 incomplet, A24 | Helpers de factions/company présents, exécution complète voyage/backdoor/travail non intégrée au service | Le dialogue arriverait à un cul-de-sac nécessitant du code |
| Reset et reprise, A03/A13/A14 | Achat vs installation confondus; updater sans journal transactionnel complet; route de sortie partielle | Coupure de la campagne et risque de mélanger deux epochs |
| Communication de capacités | Aucun routeur GPT complet livré dans ce dépôt; tools/rfa.mjs est un outil de développement | Le GPT ne dispose pas de toute l'automatisation simplement parce qu'une API existe |

Les quatre reproductions sont dans [evidence/reproductions.json](evidence/reproductions.json). Lancer `node tests/audit-repros.mjs .` : ce programme rapporte l'état observé, il **n'est pas** un test de fermeture (sortie 0 ne signifie pas zéro défaut).

Les 24 constats A01–A24 ont une décision actuelle dans [findings.json](findings.json). Pour les domaines non exécutés, la comparaison de source prouve que le chemin signalé subsiste, pas qu'un dommage est survenu dans la partie. Les mécanismes avancés devront être vérifiés à leur lot.

## Réconcilier toutes les propositions

| Proposition | Garder | Corriger / déplacer |
|---|---|---|
| Compendium | Contre-exemples, historique, 106 entrées reliées aux lots | Ne pas compter les répétitions comme des bugs; mécanismes /dev à vérifier contre 3.0.1 |
| Plan initial, L00–L20 | États, budgets, arbitre d'activités, protocole de commandes, reprise, projections narratives | L'ancien seuil MVP après L10 est trop faible pour « jouer tout BN4 » : rendre parcours Singularity et reset obligatoires avant lancement RP |
| UI01–UI04 | Sélecteurs honnêtes, flux d'ordres, vues opérationnelles, campagne | Ghost réalise une partie de l'UI seulement : ni routeur global, ni pause effective, ni directeur RP derrière les vues |
| OpenAPI initial | Authentification, epoch, commandes asynchrones, idempotence, erreurs explicites | Huit opérations / quatre types de commande ne couvrent pas BN4. Étendre avec plans exécutables et ordres du catalogue; ne pas activer des placeholders |
| Instructions GPT | Faits frais, reçus, provenance, connaissance filtrée | Interdire les options improvisées non couvertes; un objectif long se délègue au moteur, pas à une suite de tours GPT |
| Lore original + révision | Voix, mystère, progression par événements, liberté du joueur | Activer après BN1→BN4 réel; séparer les conséquences narratives des mécaniques; garder les révélations hors du dépôt public |
| Scripts Alain Bryden | Orchestration de parcours et d'augmentations, réserves, reprise et décisions de reset | Source d'architecture, pas second autopilote concurrent avec MatrixOS |
| Droid / drabepet | Allocation, retours d'exécution, découpage des responsabilités | Adapter au scheduler existant; pas de remplacement global ni de chiffre de performance importé |

Les références communautaires sont des lectures figées aux SHA du premier audit, conservés dans `reference/sources-lock.json`; ce rapport ne prétend pas avoir relu chaque nouvel upstream. [Alain Bryden](https://github.com/alainbryden/bitburner-scripts) sert notamment de comparaison pour couvrir un parcours complet. Aucun code tiers n'a été ajouté par ce regroupement.

## UI : acquis et limites

Neuf vues françaises, trace de capital observé, cibles sélectionnables, fraîcheur des services, reçus des changements de configuration et adaptation à la largeur de la fenêtre du jeu. RAM native observée 1,7 Go; installateur ciblé 4,25 Go. Pièces de validation natives et navigateur dans `evidence/`.

Le composant ne prend pas les appels Netscript hors de main. Un reçu `saved` atteste le fichier modifié, pas un service arrêté. Le graphe est une représentation des cibles, pas une carte topologique. Campagne reste en attente tant que son backend manque. La correction du masquage des actions dans Ghost ne répare pas encore le producteur `manualActions()`.

## Risques de livraison à traiter en premier

L'updater suit main même si son installateur a été téléchargé ailleurs. La CI actuelle ne réagit qu'à une branche historique sur push; cette branche RP ajoute son propre déclenchement. HANDOFF, README et CAPABILITY-MATRIX contiennent des couches historiques contradictoires : ne pas en déduire la disponibilité actuelle. Le contrat de jeu doit devenir la source unique du dashboard, du GPT et de la recette.
