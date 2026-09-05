# Sortir du développement et commencer la campagne

## La règle de décision

Le tag `rp-bn4-v1.0.0` ne sera attribué qu'après réussite de tous les gates dans `release-status.json`. Aujourd'hui ils sont non exécutés : Ghost a des preuves natives, le système RP complet n'en a pas. Aucun pourcentage de « travail terminé » n'est calculé à partir du nombre de fichiers ou de tâches.

- **G1 :** Tous les P0/P1 des chemins activés clos avec preuves.
- **G2 :** Catalogue obligatoire installé, autorisé et testé dans BN4.
- **G3 :** Tous les scénarios S01-S20 passés sur SHA final.
- **G4 :** Parcours complet BN4, au moins un reset augmentation, sans édition de scripts.
- **G5 :** 8 heures de stabilité en charge, trois reprises contrôlées et aucun incident non réconcilié.
- **G6 :** 100 tours de dialogue/choix, zéro chiffre inventé, option inexécutable ou fuite de révélation.
- **G7 :** Installation, palier, canal, mise à jour et rollback vérifiés.
- **G8 :** GPT réel connecté : ordre jusqu'à postcondition avec journal.

## Protocole de recette

1. Capturer version du jeu, SHA du code, hash config expurgée, Node/SF/RAM/capacités observés, epoch et source de preuve. Utiliser une sauvegarde de test contrôlée et conserver son état initial localement.
2. Vérifier la release par les tests de code, budget RAM statique et RAM native. Utiliser les mêmes octets que ceux destinés au déploiement. La recette mock sert aux fautes difficiles à déclencher; elle ne remplace pas une exécution du jeu.
3. Jouer S01–S20, d'abord en simulation de protocole puis dans le moteur et le GPT. Pour chaque scénario : SHA, préconditions, requestIds, événements de jeu, résultat attendu/observé, durée et erreurs. Les dialogues du test doivent identifier leurs données comme fixtures.
4. Poursuivre BN4 de son départ à sa sortie avec un reset d'augmentations intermédiaire. L'attente de revenus ou de réputation est normale; une nécessité d'écrire du code fait échouer G4. Tester panne du worker, du bridge et réveil après suspension sur copies contrôlées.
5. Recette d'endurance minimale 8h en charge. Mesurer progrès par service, erreurs, mémoire, fils orphelins, propriété des activités et fronts de dépenses. Zéro bug bloquant, pas seulement zéro exception affichée. Trois reprises contrôlées couvrent le superviseur, le transport et l'epoch de reset.
6. Rejouer 100 échanges français variés dont choix ambigus, demandes hors périmètre, lecture seule, refus de scène et options devenues indisponibles. Zéro action par narration seule et aucune demande de développement pour une option préalablement proposée. Une nouvelle phrase du joueur peut exiger une clarification d'intention; elle ne doit pas élargir les droits.
7. Publier un rapport sur le SHA final, les gates et les éventuelles exclusions de profil. Passer `rpReady` à true uniquement si les capacités obligatoires et tous les gates possèdent leurs preuves. La CI de contrat seule n'autorise pas cette promotion.

## Politique après gel

Pendant le chapitre : le joueur contrôle les priorités, objectifs, plans, boosts, achats autorisés et scènes. Les nouveaux scénarios utilisent le vocabulaire d'effets existant. Pas de téléchargement de code arbitraire depuis le GPT. Les corrections se font dans une branche de maintenance et se livrent entre sessions avec rollback.

Pour chaque demande hors domaine, donner une alternative couverte, différer l'arc concerné ou expliquer la limitation. Ne jamais promettre l'arc puis annoncer « il faut développer un script ». Ajouter un domaine est une nouvelle version de contenu/capacités, pas une improvisation de l'IA en jeu.

## Reproductibilité de cet audit

Les journaux `evidence/main-tests.txt`, `core-aware-tests.txt` et `darknet-tests.txt` proviennent de suites locales exécutées sur leurs SHA respectifs. Les tests spécifiques des PR6/7 ont aussi été exécutés séparément. `reproductions.json` rapporte quatre défauts encore présents; ce n'est pas une suite de fermeture.

Les trois JSON de Ghost sont les preuves antérieures de l'édition 01, recopiées et reliées au hash source. Ils concernent un moteur officiel 3.0.1 isolé et des fixtures synthétiques, pas le profil réel du joueur. La suite de cette branche protège l'intégration mais ne transforme pas cette preuve UI en certification globale.
