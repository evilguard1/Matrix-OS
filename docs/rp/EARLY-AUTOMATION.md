# Démarrage automatique BN4 — candidat 1.11.0-rp.3

## Parcours livré

Avec Singularity disponible et assez de RAM libre, `/matrix/kernel.js` amorce le botnet puis `/matrix/early.js` passe la main à `/matrix/early-progression.js`. Le contrôleur consomme **14,15 Go dans le moteur officiel 3.0.1 en BN4**. Il convient au départ du joueur à 32 Go et a aussi été essayé à 16 Go. Le botnet travaille sur le réseau pendant que home héberge le contrôleur.

Toutes les cinq secondes, le contrôleur relit l’argent, la réserve configurée, le coût natif du prochain doublement de RAM, TOR et les programmes possédés. L’ordre est déterministe :

1. Acheter la RAM home si le solde après réserve couvre le prix natif.
2. Sinon acheter TOR, puis le premier programme de port manquant, seulement s’il est abordable et ne coûte pas plus du quart du prochain doublement de RAM.
3. Sinon conserver l’argent pour home. Les achats de serveurs du contrôleur early cèdent leur budget à cet objectif.

Les programmes concernés sont BruteSSH, FTPCrack, relaySMTP, HTTPWorm et SQLInject. Formulas et les utilitaires coûteux attendent le moteur complet. Après un achat TOR/programme, le kernel réamorce le worm avec les nouveaux accès. Le contrôleur surveille également le rapport du worm reçu au démarrage : un rapport absent ou vieux de 90 secondes déclenche un réamorçage. Ce contrôle ne garantit pas que le revenu du botnet est optimal ou positif à chaque instant.

À **64 Go**, le contrôleur passe à l’installateur existant, qui télécharge les fichiers du palier complet au **même SHA que la release installée**, vérifie leurs hashes et relance le kernel. Ghost et les services admis par le superviseur démarrent ensuite. Les paliers suivants restent 128 et 256 Go. Les coûts RAM réellement calculés déterminent quels services peuvent coexister.

## Configuration et contraintes

Les valeurs par défaut sont `earlyAutomation.enabled: true` et `earlyAutomation.buyPrograms: true`. Elles s’appliquent aussi aux configurations antérieures qui ne contiennent pas encore ces clés. Une mise à jour ordinaire conserve `/matrix/config.json`.

`masterEnabled: false`, `automation.singularity: false` ou `earlyAutomation.enabled: false` empêchent le contrôleur d’effectuer des achats. La réserve d’argent existante reste applicable; la disponibilité du prix affiché seul ne suffit donc pas toujours. Les dépenses utilisent le registre commun avec prix relu, intention persistée et reçu de débit. Une issue ambiguë reste bloquée selon le contrat du registre.

Le fichier `/matrix/state/early-progression.txt` expose statut, epoch de reset, RAM actuelle/suivante, fonds, réserve, prix RAM, prochain programme et reçu. Une politique active de moins de 30 secondes accorde la priorité au propriétaire et à la cible exacts de l’achat. Une politique d’un ancien reset ou périmée ne conserve pas ce privilège. Cette règle empêche une ancienne réserve stratégique de bloquer le nouveau départ.

La RAM libérée par la fin de `/matrix/early.js` est prise en compte avant le transfert. Les scripts tiers qui occupent home peuvent toutefois empêcher un lancement. Le contrôleur early demeure alors actif jusqu’à ce que la place soit disponible.

En **BN4**, Singularity est accessible directement. Hors BN4, il faut SF4, et son niveau modifie fortement le coût RAM. Si l’accès manque ou si le contrôleur ne tient pas, le moteur early conserve ses travailleurs et ses indications d’achats manuels. Le bootstrap à **8 Go** ne dispose pas de ce nouveau contrôleur d’achat. Il n’est donc pas exact de promettre une autonomie identique dans tous les nodes et à tous les niveaux de SF4.

Les chemins de reset existants relancent déjà `/matrix/kernel.js`, qui choisit le palier selon la RAM constatée. Les transactions de reset et le parcours complet d’un node restent hors de cette recette; voir RP06. L’arbitre global de pause reste à terminer dans RP03 : les travailleurs distants déjà actifs ne sont pas tous arrêtés par ce nouveau contrôleur.

## Installation et usage

Depuis une installation RP déjà active :

```text
run /matrix/update.js
```

Pour adopter explicitement ce canal depuis une autre installation, télécharger l’installateur de la branche et le lancer sans `--fresh` :

```text
wget https://raw.githubusercontent.com/evilguard1/Matrix-OS/rp/ghost-node-war/install.js /rp-install.js
run /rp-install.js --channel rp/ghost-node-war
```

L’installateur conserve la configuration, choisit le palier et démarre le kernel. Le premier lancement dans une partie reste nécessaire. Pour relancer des fichiers déjà installés : `run /matrix/kernel.js`.

## Preuves et limites de validation

- [Tests des décisions et transitions](../../tests/rp-early.mjs) : réserve, priorité RAM, achats limités, prix invalides, refus natif, droits, pause, epoch, expiration de politique, singleton, mise à jour et réamorçage après perte du worm.
- [Test du moteur officiel](../../tests/native/early.cjs) et [résultats liés aux hashes](evidence/early/native.json) : contextes BN4 isolés, départ avec fichiers early seulement, 16 → 32 → 64 Go et 32 → 64 Go, achats natifs TOR et BruteSSH à 32 Go, reçus RAM, téléchargement du palier complet et présence effective de Ghost et du superviseur.
- La recette fournit **des fonds synthétiques** pour accélérer les achats. Le déploiement des producteurs précède le transfert, mais le temps nécessaire pour gagner l’argent n’a pas été mesuré. Les téléchargements GitHub sont interceptés avec les vrais fichiers locaux au SHA de test; la disponibilité du réseau public ne fait pas partie de cette preuve.

Aucune sauvegarde Steam du joueur n’a été chargée ou modifiée. La surveillance générale après installation, la campagne BN4 complète et les commandes du GPT externe demeurent ouvertes. `rpReady` reste `false`.
