# MATRIX-OS · Ghost Node War · branche RP

**État : intégration et préparation de la version jouable. La campagne complète n'est pas encore prête.** Base : MATRIX 1.10.2, `681045f8c45963e4569db1aed221e598c7cf50f6`. Audit du 5 septembre 2026; Bitburner 3.0.1, BN1 déclaré, départ RP au passage observé vers BN4.

La cible est une partie où le joueur donne des intentions et choisit des options déjà exécutables. Le moteur travaille entre les conversations; le GPT rend compte, propose, puis transmet les ordres autorisés. Aucun script généré pendant une scène.

## Lire dans cet ordre

**Développement en cours : [candidat 1.11.0-rp.1, corrections et limites](DEVELOPMENT-STATUS.md).** Les constats de l'audit initial ci-dessous sont conservés comme historique; consulter aussi les statuts actualisés de `findings.json`.

1. [Audit actuel](AUDIT.md) : code, branches, défauts et comparaison des propositions.
2. [Contrat de jeu](PLAY-CONTRACT.md) : ce que signifie « suffisamment complet » et comment produire le briefing.
3. [Implantation](IMPLEMENTATION.md) et [backlog JSON](backlog.json) : ordre, fichiers, dépendances, tests et retour arrière.
4. [Catalogue d'ordres](capability-catalog.json) : périmètre BN4 et extensions; aucun endpoint actif déclaré.
5. [Recette et sortie du développement](RELEASE-GATES.md), [scénarios](scenarios.json), [état de livraison](release-status.json).
6. [Références techniques](reference/README.md) : premier audit, 21 lots, 4 lots UI, registre de 106 entrées et contrat API initial.

## Ce que contient cette branche

Le moteur issu de 1.10.2, le dashboard Ghost à neuf vues et le programme de sortie du développement. Le candidat 1.11.0-rp.1 ajoute le registre de dépenses, la publication canonique des réserves, des corrections boursières et de hacking, ainsi que le canal RP et l'installation avec hashes et restauration. Les deux PR expérimentales restent évaluées séparément.

Le dashboard a été exécuté dans le moteur officiel 3.0.1 isolé : 1,7 Go, une fenêtre, installation et restauration testées. Ce contrôle utilise une télémétrie synthétique. Il ne prouve pas la campagne, le pont GPT ou le fonctionnement sur la sauvegarde Steam du joueur.

## Vérifier et prévisualiser

```sh
npm ci
npm test
npm run test:ghost
npm run test:rp-contract
npm run preview:ghost
```

Le dernier outil écrit `.preview/ghost.html`, une simulation locale utilisant les vrais composants Ghost. `node tools/package-ghost.mjs` génère l'installateur ciblé du dashboard dans `.preview/package`. Cloner avec l'historique : le test de restauration lit le dashboard original au SHA 1.10.2.

**Cette branche n'est pas encore un canal de mise à jour du jeu.** L'installateur et l'updater standard suivent encore main. Télécharger install.js depuis cette branche ne suffit pas à installer son contenu. Le lot RP02 doit résoudre ce point avant tout déploiement complet RP. Aucun fichier de la partie Steam n'a été changé dans cet audit.

## Sources d'autorité

Pour ce programme, les fichiers de ce répertoire priment sur les anciennes propositions en cas de différence de périmètre ou de priorité; le code et les preuves déterminent ce qui existe effectivement. `backlog.json` conserve des tâches ouvertes, `release-status.json` conserve `rpReady: false`. Une branche publiée n'est pas une certification de jeu.

Le dépôt est public : le coffre GM, les révélations et les documents auteur complets restent privés. On peut développer le moteur narratif avec des scènes de test sans divulguer l'histoire.

