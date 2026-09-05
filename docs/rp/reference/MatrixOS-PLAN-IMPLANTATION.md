# MatrixOS — Plan d’implantation et contrat de reprise par une IA

**Édition : 4 septembre 2026 · cible Bitburner Steam 3.0.1 · projet 1.10.0**

## 1. Décision proposée

Faire évoluer MatrixOS en un système de contrôle du jeu avec une entrée simple, des services spécialisés, un état vérifiable et une interface destinée à ton GPT personnalisé. Le moteur local assure l’automatisation continue; le GPT propose les objectifs, explique les résultats et incarne ton partenaire dans **The Ghost Node War**.

**Extension UI demandée :** inclure une refonte complète **Command Deck**, avec console légère dans Bitburner et interface détaillée dans le navigateur. `MatrixOS-UI-SPECIFICATION.md` définit les écrans, états, contrats de présentation, critères et lots UI01–UI04 ; `ui-backlog.json` les complète au format structuré. La maquette est une proposition interactive sur données simulées, pas une interface déjà connectée au jeu.

Conserver le bootstrap, le scheduler HWGW roulant, les workers légers, l’interface React isolée de Netscript et les tests existants. Améliorer progressivement ces composants plutôt que reconstruire le projet entier. « Un script » signifie ici un point d’entrée, `/matrix/kernel.js`, qui organise plusieurs processus suivant la RAM disponible. Un monolithe important toutes les API payantes compromettrait le départ à 8 Go.

**Contexte confirmé par le joueur :** Bitburner 3.0.1; partie actuelle en BN1; le RP commence à la sortie de BN1 vers BN4; interface prévue : GPT personnalisé avec Actions vers une API Bitburner. L’accès effectif à cette API, les Source-Files, la RAM et les augmentations de la sauvegarde ne sont pas vérifiés dans cet audit. Ne pas déduire « première partie sans SF » du seul BN1.

Le livrable est un plan et un dossier de reprise. Aucun correctif n’a été poussé au dépôt, aucune commande n’a été exécutée dans la partie, aucun GPT ni endpoint public n’a été déployé. Les originaux du lore et du compendium restent inchangés. Les nouvelles règles de campagne sont dans une édition séparée.

## 2. Base de référence et preuves

| Élément | Référence examinée | Portée |
|---|---|---|
| MatrixOS | `evilguard1/Matrix-OS`, `main`, `2e6977cc15d3aea05bdc2c80b9073b963c76108e`, 1.10.0 | Installation, supervision, état, progression, scheduler et services; suite de tests exécutée |
| Bitburner | tag `v3.0.1`, `3162fd2590e221eadd0c0fbd46151913f7c4c41c` | Code et définitions officiels correspondant à la version du joueur |
| Compendium | `Matrix-Compendium-COMPLETE.md`, 46 114 mots | Inventaire des constats et amendements; réexamen ciblé des mécanismes et priorités |
| Lore | `Bitburner_The_Ghost_Node_War_FINAL.md` | Continuité, début BN1→BN4, séparation faits/fiction, connaissances secrètes |
| Alain Bryden | `7a8951a1987c0734ae3035894a25c9495e2b28d1` | Autopilot, réserves, bourse avant 4S, Hacknet, stratégie de resets |
| TheDroidYourLookingFor | `8964992a9aca2f3c20e60dd00f1756689aac07dd` | Allocateur, échéances, signaux de fin, contrôleur Darknet |
| drabepet | `2e32643d5a396c698587bfc892bb1153c9d09c4c` | Orchestration réseau centralisée et séparation modules/workers |

Les liens immuables et repères précis se trouvent dans `MatrixOS-AUDIT.md`; les fichiers reçus et les SHA sont inventoriés dans `sources-lock.json`.

**Validation réellement effectuée :** installation locale des dépendances avec scripts d’installation désactivés, puis `npm test`, sortie 0. La suite annonce 53 scripts, 54 entrées de manifeste, 28 solveurs testés, 923 appels hostiles et 2 338 corps de composants rendus. Son analyseur estime le bootstrap à 6,15 Go et le groupe sélectionné à 64 Go à 59,5 Go avec réserve de mise à jour. Ces chiffres sont des résultats de la suite, pas des mesures de la partie Steam.

Quatre reproductions supplémentaires chargent les vrais modules dans des environnements synthétiques : écrasement des réserves; karma −100 mal classé malgré SF2; fraction de hack 60 % sous plafond 40 %; liquidation pré-4S ignorée. Code et sortie : `verification/`. Elles observent les anomalies actuelles; elles ne sont pas les tests d’acceptation de futurs correctifs.

## 3. Conclusions de l’audit

### 3.1 Fondations à préserver

- Bootstrap adapté aux petites machines et admission finale par `getScriptRam()`.
- Scheduler roulant avec plan de placement, diagnostic des reports et suivi de PID.
- Voie Formulas déjà intégrée : ne pas reproposer « ajouter Formulas » comme chantier neuf.
- Isolation des appels `ns` dans la boucle du dashboard, avec données et commandes intermédiaires côté React.
- Déploiement épinglé à un commit lorsqu’il est résolu, configuration protégée, propagation distante par version.
- Contrats déportés et solveurs inconnus ignorés sans tentative.
- Boost de réputation borné de 1.10.0 : l’utiliser comme premier cas de commande externe structurée.

### 3.2 Réparer avant d’augmenter l’autonomie

| Priorité | Problème actuel | Résultat attendu |
|---|---|---|
| P0 | Deux écritures successives de `coordinator.txt`; la seconde perd `budgets` | Une publication canonique complète et versionnée |
| P0 | Pause incomplète : Go et worm; les activités persistantes du joueur/sleeves/gang peuvent continuer | Sémantique explicite de pause et rapport des activités restantes |
| P0 | Dépenses Singularity et corporation contournant certaines réserves; budgets sleeves par individu | Réservations et autorisations de dépenses communes, avec propriétaire de l’objectif |
| P0 | Updater copiant en place après arrêt; stop-list omettant notamment coordinateur, Go et Stanek | Transaction récupérable et génération de release vérifiée |
| P1 | Liquidation et inventaire boursiers sous condition 4S | Vendre/lire les positions avec TIX, indépendamment des forecasts |
| P1 | Red Pill achetée et installée confondues; route Bladeburner non modélisée | Préconditions du jeu et autorisation de campagne séparées |
| P1 | Prix Home/cloud estimés sans tous les multiplicateurs | Prix API au moment de l’achat et estimation explicitement étiquetée |
| P1 | Même tâche sleeve réattribuée à chaque boucle | Réaffectation uniquement sur différence réelle de tâche |
| P1 | `ceil` peut dépasser `maxHackFraction`; `break fill` bloque les cibles suivantes | Limite après arrondi; passage à une cible qui tient lorsque pertinent |
| P1 | Capacité annoncée sur la base de SF4, même si le service ne tourne pas | États distincts : déverrouillé, implanté, installé, admissible, actif, testé |

**Amendement majeur au compendium :** dans le code officiel 3.0.1, `destroyW0r1dD43m0n()` accepte soit les conditions de hacking/root, soit la fin des BlackOps; il ne contient pas de test explicite Red Pill. La Red Pill intervient dans la visibilité normale du World Daemon. Le diagnostic « root+niveau sans Red Pill entraîne forcément des appels impossibles » n’est donc pas établi pour cette version. Préserver le chemin normal avec Red Pill, mais ne pas transformer cette hypothèse en règle universelle de l’API. Une politique RP peut exiger la route normale; elle doit être annoncée comme politique.

Autre correction : le transfert du worm vers HWGW a déjà été corrigé et son seuil est désormais **64 Go**, pas 32. L’overhead des propagateurs reste à traiter. Les vrais paliers sont 8/16/64/128/256 Go; le superviseur fixe encore certains services à 512/1024 Go. Le README et le HANDOFF mélangent des générations antérieures.

## 4. Architecture cible

```mermaid
flowchart TB
  U[Joueur] --> GPT[GPT personnalisé : partenaire RP]
  GPT -->|Actions HTTPS| API[Gateway : authentification et commandes typées]
  API --> DB[(Journal durable : commandes, campagne, versions)]
  API --> LOCAL[Pont local : seul propriétaire de la connexion RFA]
  GAME[Bitburner 3.0.1 : client WebSocket] -->|connexion sortante| LOCAL
  LOCAL -->|pushFile / getFile| MAIL[Boîtes de commandes et états sur home]
  MAIL --> CTRL[Contrôleur local : validation et arbitrage]
  CTRL --> MGR[Services spécialisés]
  MGR --> NS[API Netscript autorisées par la sauvegarde]
  NS --> OBS[Observations / résultats vérifiés]
  OBS --> MAIL
  DB --> VIEW[Projection de campagne sans secrets non découverts]
  VIEW --> API
```

### 4.1 Transport réellement disponible

La Remote API 3.0.1 est une interface de fichiers, métadonnées, sauvegarde, définitions et calcul RAM. Elle n’expose pas une méthode générique `executeNetscript`. Bitburner se connecte au serveur WebSocket local; le sens est déjà correctement compris dans `tools/rfa.mjs`. Les fichiers de commandes sont ensuite consommés par un script installé et lancé dans le jeu. Un `pushFile` réussi ne prouve ni l’exécution ni le succès d’une action.

Réutiliser `tools/websocket.mjs` après durcissement et `tools/rfa.mjs` après extraction de son transport. Prévoir un propriétaire unique du port local 12525 configurable : le CLI de déploiement et le gateway passent par ce propriétaire au lieu d’ouvrir chacun leur serveur. Tester handshake TCP fragmenté, reconnexion et file des appels RPC; les tests de frames existants ne suffisent pas à valider toute la connexion.

Un GPT personnalisé appelle une API REST HTTPS. Il ne peut pas joindre directement `127.0.0.1:12525` sur ton PC par une Action. Le contrat proposé est un gateway local exposé par un tunnel HTTPS authentifié, ou un gateway hébergé recevant une connexion sortante du pont local. Choix initial : **gateway local + tunnel**, car la partie tourne déjà sur le PC. Le fournisseur de tunnel, le domaine et l’accès existant restent à établir avant déploiement; ne pas créer une seconde infrastructure sans inspecter celle que tu utiliseras.

Les contraintes officielles des Actions comprennent HTTPS/TLS sur 443, 45 secondes par appel et moins de 100 000 caractères par requête/réponse. Choisir des réponses paginées, des jobs asynchrones et des accusés de réception rapides. Mettre l’idempotence dans le JSON, car les en-têtes personnalisés ne sont pas pris en charge. Sources : [Remote API 3.0.1](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/programming/remote_api.md), [production des GPT Actions](https://developers.openai.com/api/docs/actions/production).

### 4.2 Répartition des décisions

| Décision | Autorité |
|---|---|
| Thread, cible, préparation, timing HWGW | Scheduler déterministe local |
| Autorisation d’une dépense ou prise d’activité | Contrôleur local + politique du joueur |
| Proposition « priorité réputation Daedalus » | GPT ou dashboard |
| État observé du jeu | API du jeu, avec instant de mesure et provenance |
| Révélation d’un secret | Directeur de campagne déterministe côté gateway |
| Interprétation et dialogue | GPT, limité aux connaissances révélées |
| Choix moral, fin BN1, destination BN4 | Joueur; confirmation concrète conservée dans le journal |

Le GPT n’est pas requis à chaque tick et n’est pas le scheduler permanent. Le design ne suppose pas qu’une conversation GPT fermée continue à tourner. MatrixOS poursuit la politique locale autorisée; à la prochaine interaction, le GPT récupère les événements manqués. Une narration entièrement proactive demanderait un composant supplémentaire, hors MVP.

### 4.3 Arborescence proposée

```text
matrix/kernel.js                       entrée existante
matrix/lib/service-registry.js         métadonnées pures, sans imports de services
matrix/lib/protocol.js                 validation et normalisation des enveloppes
matrix/lib/policy.js                   décisions pures et raisons de rejet
matrix/lib/readiness.js                progression et routes de sortie
matrix/lib/state.js                    persistance, schémas, epochs
matrix/lib/budget-ledger.js            réservations, débits, rapprochements
matrix/lib/action-arbiter.js           exclusivité activité joueur
matrix/lib/ram-leases.js               réservation par hôte et propriétaire
matrix/services/control.js             exécution de la file locale
matrix/services/bridge-agent.js        collecte compacte, boîte de commandes
matrix/services/singularity-observer.js
matrix/workers/singularity-command.js  opération ponctuelle typée
matrix/services/darknet.js             étape ultérieure, domaine distinct
gateway/src/rfa/                       connexion partagée avec le CLI
gateway/src/http/                      endpoints des Actions
gateway/src/journal/                   stockage transactionnel
gateway/src/campaign/                  règles et projections de connaissances
gateway/openapi.json                   contrat livré en annexe
campaign/shared.md                     contexte joueur
campaign/gm-vault.md                   jamais livré au GPT joueur
campaign/reveals.json                  conditions de révélation
tests/protocol/ tests/faults/ tests/game-fixtures/
```

Ne pas importer les services dans `service-registry.js`; publier leurs chemins en chaînes. Mesurer les coûts Netscript de chaque nouvel import. Intégrer les nouvelles fonctions dans `common.js` seulement si cela ne gonfle pas les processus légers; privilégier des bibliothèques pures autonomes.

## 5. Contrat des données et des commandes

### 5.1 Identité, fraîcheur et niveaux de confiance

Chaque snapshot porte `schemaVersion`, `releaseSha`, `runtimeEpoch`, `resetEpoch`, `seq`, `capturedAt`, `gameVersion`, `source`, `quality`. `runtimeEpoch` change au démarrage du propriétaire; `resetEpoch` représente la combinaison de campagne/save-lineage et des horodatages `lastNodeReset`/`lastAugReset`. Une restauration de sauvegarde crée une nouvelle branche de continuité; ne pas réutiliser aveuglément les séquences de l’ancienne partie.

Pour chaque domaine : `available`, `reason`, `observedAt`, `value`. Une valeur manquante vaut `null`, jamais un zéro inventé. `ownedSF`, de type Map dans le jeu, devient une liste JSON de `{number,level}`. Convertir BigInt en chaîne; interdire NaN et Infinity dans les contrats JSON. L’état de campagne connu n’est jamais écrit dans les champs d’observation du jeu.

Fraîcheur proposée : contrôle 2 secondes de cadence locale; état synthèse toutes les 5 secondes; observation utilisée pour une décision de dépense/restart âgée au maximum de 10 secondes, suivie d’une relecture avant effet; système lent à intervalle déclaré, état périmé après trois périodes attendues. Ces valeurs sont des objectifs initiaux à mesurer. Un jeu suspendu passe en `stale`, pas en « tous les services morts » avec relances en boucle.

### 5.2 Enveloppe de commande

```json
{
  "schemaVersion": 1,
  "commandId": "uuid",
  "idempotencyKey": "uuid",
  "sessionId": "session-opaque",
  "expectedResetEpoch": "save-a:node-t1:aug-t2",
  "expectedPolicyRevision": 7,
  "issuedAt": "2026-09-04T20:00:00Z",
  "expiresAt": "2026-09-04T20:02:00Z",
  "type": "reputation.boost",
  "payload": {"mode":"normal","durationSeconds":120},
  "source": "gpt-action"
}
```

Le gateway attribue `commandId`, identité et timestamps; le GPT fournit une clé d’idempotence et l’epoch qu’il a observée. Types autorisés au MVP : `control.pause`, `control.resume`, `objective.set`, `reputation.boost`. Payload validé strictement par type, clés inconnues refusées. Pas de JavaScript libre, pas de nom de fonction arbitraire, pas d’accès générique aux fichiers depuis les Actions. Un endpoint développeur éventuel doit être séparé et inaccessible au GPT joueur.

Cycle : `accepted → validated → queued → running → succeeded|failed|expired|cancelled|outcome-unknown`. `rejected` correspond à un refus avant admission. Un HTTP 202 veut seulement dire « accepté dans la file ». Le résultat contient les préconditions relues, l’effet mesuré, les dépenses et événements associés. Après perte de connexion pendant une action non répétable, utiliser `outcome-unknown`, rapprocher l’état puis décider; ne pas retenter automatiquement.

Stockage proposé : SQLite local transactionnel, avec tables `commands`, `command_transitions`, `events`, `campaign_revisions`, `reveals`, `approvals`, `save_lineages`. Clé unique sur `(principal,sessionId,idempotencyKey)`. Même clé et même contenu : renvoyer le résultat existant; même clé et contenu différent : HTTP 409. Commandes expirées ou d’un autre reset : rejet.

### 5.3 Livraison au jeu et déduplication

1. Le gateway persiste la commande avant tout transport.
2. Il écrit un fichier immuable par commande, sous `/matrix/control/inbox/<commandId>.txt`, jamais une file JSON écrasée par plusieurs producteurs.
3. `control.js`, singleton sur home, vérifie version, epoch, politique, type, deadline et droits.
4. Il persiste `validated/running` avant l’effet, puis exécute via un adaptateur à code fixe.
5. Il vérifie la postcondition et écrit `/matrix/control/results/<commandId>.txt`.
6. Le gateway importe et journalise le résultat; il nettoie les fichiers acquittés suivant une rétention bornée.

Ce protocole ne promet pas une transaction atomique entre SQLite et le moteur du jeu. Une panne entre effet et accusé nécessite un rapprochement. Chaque type doit déclarer : préconditions, effet, postcondition, preuve disponible, reprise sûre, durée maximale. Limites initiales : 100 commandes en attente, 16 Kio par commande, au plus un effet d’achat/activité à la fois. Les ports servent aux signaux rapides locaux; pas comme journal durable. Réserver leurs numéros après inventaire des ports existants.

### 5.4 API du GPT

Le fichier `gateway-openapi.json` est un contrat MVP pour l’implantation, avec domaine exemple à remplacer. Il décrit santé, snapshot, événements paginés, campagne visible, commandes et résultats. Les étapes suivantes ajoutent des endpoints spécialisés de préparation et confirmation d’un reset ou d’une transition. Le schéma n’est pas présenté comme un service déjà disponible.

Le serveur valide aussi la correspondance type/payload : pause → `{mode:"drain"}`; resume → `{}`; objective.set → objectif permis et faction obligatoire seulement pour faction-reputation; reputation.boost → mode et durée 10–600 secondes. Une union de payloads OpenAPI ne suffit pas à imposer cette relation. `recordCampaignChoice` n’accepte que les options d’une scène ouverte et ne produit aucun effet de jeu. `ackCampaignScene` évite la répétition d’une scène déjà autorisée. Les retries avec une clé connue renvoient le reçu conservé avant de vérifier une révision devenue ancienne.

En BN1 sans Singularity, le passage vers BN4 reste une action du joueur dans le jeu. Ni une Action GPT ni le pont de fichiers ne débloquent SF4. Préparer le bilan, accompagner le choix manuel, puis constater la transition. Si la sauvegarde possède déjà Singularity, employer un endpoint de transition spécialisé seulement après son implantation et sa validation.

Authentification initiale : clé API Bearer dédiée au GPT privé, stockée dans sa configuration d’Actions, pas dans Knowledge ni dans les scripts du jeu. Le serveur associe cette clé à une seule partie et à une portée. Aucun secret OpenAI n’est nécessaire pour que le gateway réponde aux Actions du GPT. Utiliser OAuth si plusieurs utilisateurs doivent avoir des parties séparées. Référence : [authentification des Actions](https://developers.openai.com/api/docs/actions/authentication).

Les contrôles réversibles du MVP portent `x-openai-isConsequential:false` afin que le joueur puisse utiliser l’option d’autorisation persistante de ChatGPT. Les endpoints futurs d’installation d’augmentations, de choix exclusif ou de sortie de BitNode portent `true`; le gateway vérifie aussi une approbation liée au plan exact. L’autorisation du présent audit n’est pas une autorisation permanente de détruire les prochains BitNodes.

## 6. Gouvernance locale

### 6.1 Pause, arrêt et reprise

Trois états : `RUNNING`, `DRAINING`, `PAUSED`, plus un mode de récupération `RECOVERY`. `pause` interdit immédiatement les nouvelles admissions. Les batches déjà partis terminent quand c’est préférable; le dashboard affiche le nombre et la durée restante. La pause des décisions n’annule pas automatiquement un graft payé. Le hard-stop local arrête les processus possédés par MatrixOS, puis les activités dont il est propriétaire lorsque l’API le permet; il annonce les effets persistants et pertes possibles. Aucun kill global de scripts étrangers.

Une pause complète doit traiter les actions persistantes : faction/company work, crimes sleeves, guerre du gang, Bladeburner, trading, root, worm, share et charge Stanek. Le simple fait de dormir dans leur boucle ne les arrête pas. Implémenter `quiesce()` par service. En cas de processus lent, le contrôle publie `draining` avec les exceptions, au lieu d’afficher un arrêt réussi.

Au départ à 8 Go, garder un canal de contrôle minimal par port et un état compact; ne pas importer tout le broker. Sans bridge résident admissible, afficher `externalControlUnavailable` et conserver une commande locale légère. La fonctionnalité externe devient disponible suivant la mesure RAM, pas une promesse uniforme.

### 6.2 Économie

Séparer l’argent personnel, la trésorerie de corporation, les positions boursières et les hashes. Une position n’est pas du cash disponible avant liquidation vérifiée. Les quotes ont source et date. Les réserves ont un `goalId` et une catégorie; leur propriétaire peut les consommer pour l’objectif, les autres managers doivent les respecter. Sans cela, « protéger le prix de l’augmentation » pourrait empêcher son achat.

Chaque dépense demande un grant borné : compte, maximum, bénéficiaire, type, durée et goalId. L’arbitre unique accorde selon cash frais moins plancher protégé moins engagements. Le service relit le prix, refuse si plus cher que le grant, exécute et renvoie le coût réel. Les activités consommatrices continues reçoivent un plafond cumulatif et une échéance. Un achat manuel concurrent peut invalider un grant : relire l’argent avant effet et refuser proprement. Un grant laissé dans un état incertain n’est pas libéré avant rapprochement.

Pour les achats cloud : recherche de taille avec `ns.cloud.getServerCost()`, contrôle du budget effectif avant achat, puis essai d’une taille inférieure si nécessaire. Les estimations low-RAM de Home portent `estimated:true`; les quotes exactes du service Singularity prennent priorité lorsqu’elles sont fraîches.

### 6.3 Activité du joueur et conflits

Créer des propositions d’activité au lieu d’appeler directement `workForFaction`, crime, gym ou backdoor depuis plusieurs services. Clés d’exclusivité : `player.foreground`, `player.terminalRoute`, `sleeve:<id>` et les activités Bladeburner selon la compatibilité réelle du Simulacrum. Un graft engagé est une transaction non préemptible par l’autopilot. Le joueur garde un override manuel; MatrixOS le détecte et recalcule au lieu de reprendre la main à chaque tick.

Comparer activité souhaitée et `getCurrentWork()`/`getTask()` réel, pas seulement un cache `lastGoal`. Interdire le doublon de travail de sleeves pour une même faction. Respecter une activité en cours plutôt que recréer un objet de crime toutes les dix secondes.

### 6.4 RAM et réseau

Un gestionnaire par domaine possède ses PID et ses réservations. Réserver contrôle/updater avant le calcul rentable; les tâches opportunistes share/Stanek sont récupérables, les quatre composants d’un batch engagé sont traités comme un groupe. Ne jamais tuer un worker HGW isolé pour faire place à du share. En cas de démarrage partiel, annuler ce qui n’a pas encore eu d’effet, mesurer la cible et repasser en préparation; les effets déjà produits ne sont pas réversibles.

Remplacer progressivement les propagateurs réseau multiples par un découvreur/root/deploy central; garder un mode worm ancien pour les petites étapes jusqu’à preuve que la relève fonctionne. Le handoff dépend d’un propriétaire actif et de sa santé, pas seulement de Home RAM. Sans acquittement, conserver une source de revenu; avec acquittement, arrêter les anciens drones puis les propagateurs devenus superflus.

## 7. Lots d’implantation exécutables

Les numéros définissent des unités de PR, pas des dates promises. Chaque lot livre code, tests comportementaux, schémas/migrations concernés, mesure RAM et mise à jour des documents. Ne pas mélanger les optimisations de plusieurs sous-systèmes dans une même PR.

### L00 — Figer et mesurer la base

**Entrées :** SHA audité et sauvegarde du joueur. **Fichiers :** tests, docs, manifeste. Capturer `npm test`, versions, SHA, configuration, API disponibles, état réel des services et RAM calculée dans 3.0.1. Utiliser `getDefinitionFile`/`calculateRam` via RFA si connexion autorisée et disponible. Enregistrer 15 minutes de revenu, RAM, erreurs et p95/p99 des fins de workers sur la sauvegarde de test. Ne pas exporter une sauvegarde vers le GPT.

**Acceptation :** rapport reproductible avec labels `static`, `mock`, `live`; écarts RAM expliqués; aucune supposition de SF ou d’argent. **Dépendance :** aucune. **Retour arrière :** aucune mutation du runtime.

### L01 — États canoniques et réserves

**Fichiers :** `coordinator.js`, `common.js`, nouveaux `state.js`, `budget-ledger.js`; tests coordinateur/économie. Remplacer la double écriture par un objet unique conservant `budgets`, `id`, statut et objectifs; publier une révision commune aux directives. Ajouter epoch et TTL. Les lecteurs rejettent un état périmé. Corriger −54 en règle valide, avec exemption BN2 et options de partie.

**Acceptation :** avec 60 milliards de cash et objectif Daedalus à 100 milliards, un manager ne reçoit pas un budget hors objectif; une dépense propriétaire reste possible; karma −100 avec SF2 hors BN2 reste en phase karma. Reproduction actuelle remplacée par assertions attendues. **Dépendance :** L00. **Retour :** compatibilité de lecture N−1, état reconstruit sans écraser la config.

### L02 — Registre, pause et santé

**Fichiers :** `start.js`, tous les services, `worm/`, `telemetry.js`, `capabilities.js`, `dashboard.jsx`. Créer registre pur avec `id,path,stage,capability,pollMs,stateSchema,quiescePolicy,ownedWorkerPatterns`. Ajouter health avec `lastProgressAt` distinct du heartbeat. Désactivation globale ou individuelle traitée sur les processus existants. Corriger autoOpen pour tous les tails.

**Acceptation :** pause en charge coupe nouvelles admissions; Go et worm se taisent; activités persistantes déclarées/arrêtées suivant leur politique; processus étranger intact; aucun storm au réveil du jeu. La UI reste contrôlable et indique ce qui tourne encore. **Dépendance :** L01.

### L03 — Dépenses et activité unifiées

**Fichiers :** économie, Singularity, sleeves, corporation, Bladeburner; `action-arbiter.js`. Migrer achats TOR/programmes/augs/dons/Home, frais de formation et voyage, équipement gang, augmentations de sleeves, création de corporation. Réserver les fonds avant effet. Dons plafonnés au déficit réel avec seuil `getFavorToDonate()`. Corriger `lastGoal` et les réassignations de sleeves.

**Acceptation :** deux demandes concurrentes ne peuvent engager le même cash; hausse de prix refuse le grant; huit sleeves partagent une seule enveloppe; changer de faction ne redémarre pas chaque crime; intervention manuelle détectée. **Dépendances :** L01–L02.

### L04 — Mise à jour récupérable

**Fichiers :** `install.js`, `kernel.js`, `stages.js`, `propagate.js`, registre. Fixer un SHA une fois pour l’ensemble de la transaction, sans re-résolution de main entre installer et manifeste. Échec de résolution : rester sur la release courante, sans repli implicite sur main. Vérifier tous les fichiers éligibles, tailles/empreintes, imports et RAM. Préparer les backups avant arrêt, journaliser l’ordre de copie et écrire le marqueur final seulement après vérification.

**Acceptation :** injection de panne avant et après chaque écriture ramène à une release cohérente au prochain kernel; stop-set dérivé inclut Go/coordinateur/Stanek; config et journal RP inchangés; workers distants ont le bon SHA, y compris deux builds de même version. Ne pas prétendre disposer d’un rename atomique de répertoire Netscript. **Dépendances :** L01–L02.

### L05 — Bourse et progression cohérentes

**Fichiers :** `stock.js`, `progression.js`, `coordinator.js`, `readiness.js`, Singularity. Extraire l’inventaire et la liquidation hors de 4S; supprimer WSE comme prérequis de TIX; mesurer positions après vente; exposer `redPillQueued`, `redPillInstalled`, disponibilité du World Daemon, route hacking/Bladeburner et autorisation de sortie. Corriger le plan BN14/15 par catalogue officiel.

**Acceptation :** liquidation d’une position pré-4S; échec de vente conserve la position réelle; route BlackOp détectée; destination invalide rejetée; aucune déclaration de transition avant nouvel epoch observé. Préparer le passage BN1→BN4 et sa validation humaine. **Dépendances :** L01–L03.

### L06 — Scheduler : bornes et admission

**Fichiers :** `hacking.js`, `hacking-planner.js`, `batch.js`, workers. Après arrondi, calculer le prélèvement réel et rejeter toute forme au-delà du maximum. Si un thread suffit à dépasser, la cible est inadmissible sous cette politique. Distinguer impossibilité pour une cible et saturation globale; poursuivre l’examen des suivantes avec limite de travail par tick et équité.

Ajouter ensuite les cores au placement, resimuler le grow distribué et la sécurité dans l’ordre d’atterrissage, enregistrer prédiction/résultat. Ne pas appliquer un multiplicateur de cores global à tous les hôtes. Ajuster `batchGapMs` suivant jitter mesuré, avec plafond et retour au mode conservateur.

**Acceptation :** fraction ≤ plafond; une cible de 100 Go refusée ne bloque pas une cible prête de 20 Go qui tient; interruption d’un worker entraîne récupération; ni dette sécurité ni fuite PID. Gain de revenu à mesurer sur mêmes fixtures. **Dépendances :** L02–L03; placement cores après L07.

### L07 — Propriété de RAM et relève réseau

**Fichiers :** `ram-leases.js`, scheduler, root, worm, contracts, Stanek, reputation boost. Ajouter leases par host/PID/génération. Centraliser scan/root/deploy après acquittement du contrôleur; compteur worm fondé sur processus identifiés, pas RAM totale/2,4. Préemption limitée aux tâches déclarées récupérables.

**Acceptation :** deux clients ne sur-réservent pas un hôte; perte de scheduler détectée; absence d’une copie worker réparée; transition à 64 Go ne laisse pas le réseau sans revenu. Comparer temps CPU et revenu à l’ancien worm avant retrait. **Dépendances :** L02, L04, L06 de base.

### L08 — Bridge lecture seule et protocole

**Fichiers :** bridge-agent, protocol, gateway RFA/HTTP/journal, CLI. Implémenter connexion partagée, health, snapshot, événements, projection de campagne; authentification, quotas, redaction et schémas stricts. Pas d’exécution de commandes dans cette première PR.

**Acceptation :** une Action du GPT obtient un snapshot réel avec version 3.0.1 et BN1; déconnexion produit `stale/disconnected`; aucune valeur fictive; reconnexion après veille; aucun fichier privé ou vault dans les réponses. **Dépendances :** L00–L02. Peut précéder L06–L07.

### L09 — Commandes GPT bornées

**Fichiers :** control, policy, adaptateurs, gateway commands. Implémenter les quatre commandes MVP et leur journal. Le boost normal réutilise les fonctions 1.10.0; mode MAX exige une durée au MVP. Le runtime relit politique et reset avant effet. Une commande étrangère, périmée ou inconsciente du reset est refusée.

**Acceptation :** une demande « boost réputation 2 minutes » s’arrête réellement; résultat lié à l’identifiant; répétition d’une Action ne prolonge pas le boost; aucun code arbitraire; file bornée. **Dépendances :** L02–L03, L08.

### L10 — Campagne et passage BN1→BN4

**Fichiers :** campaign, journal, projections, instructions GPT. Installer les documents RP révisés. Conserver `PRE_CAMPAIGN_BN1` jusqu’à preuve de changement d’epoch et BN4. Le directeur de campagne attribue une scène, le GPT la raconte; il n’invente pas le déclencheur. Journaliser l’acte de capture fictive distinctement de la sortie réelle.

**Acceptation :** aucune arrivée BN4 tant que le jeu reste BN1; reprise dans une nouvelle conversation sans répéter l’ouverture; mêmes événements n’activent pas deux fois une révélation; vault inaccessible au GPT. **Dépendances :** L05, L08–L09. C’est le seuil de livraison du MVP RP.

### L11 — Singularity fractionnée et acquisition des factions

**Fichiers :** observer et worker ponctuel Singularity; `factions.js`, `augmentations.js`, `manualActions`. Séparer observation, programmes/Home, travail, voyage/company, backdoor et reset pour éviter le service monolithique bloqué à 512 Go. Admission réelle par script, accès BN4 ou niveau SF4 exact. Créer les parcours des factions, les exclusions des villes et les étapes carrière/combat/crime. Guider les infiltrations sans inventer une API d’exécution.

**Acceptation :** en BN4, chaque action qui tient en RAM est disponible sans attendre le monolithe; une tâche manuelle reste visible si l’exécuteur manque; backdoor emprunte un chemin réel puis vérifie le flag; travail et terminal ne se concurrencent pas. **Dépendances :** L03, L05, L09.

### L12 — Augmentations et resets par objectif

Comparer un panier d’augmentations en ordre de dépendances avec multiplicateurs de prix, délai d’épargne, gain de réputation et prochaine opportunité. Ne pas acheter un petit implant simplement parce que le gros objectif n’est pas encore abordable. Ajouter achat NFG de fin de cycle suivant budget, traiter la Red Pill séparément et conserver les prérequis déjà achetés en file comme valides.

**Acceptation :** un reset ne jette pas un objectif proche sans décision motivée; panier prix réel recalculé après chaque achat; gate Stanek résolu quand applicable; quiesce, sauvegarde et journal avant reset; redémarrage et rapprochement après reset. **Dépendances :** L03–L05, L10–L11.

### L13 — Contrats fiables et complets

Remplacer Set « dispatched » par jobs avec PID, tentative, type, hash d’entrée, version solver, état final. Worker envoie un résultat via port au collecteur home, qui le persiste; ne pas supposer qu’un fichier écrit sur l’hôte distant se trouve sur home. Un crash avant `attempt` peut être retenté; résultat incertain après `attempt` exige relecture des tentatives restantes/présence. Ajouter `Total Number of Primes` et `Largest Rectangle in a Matrix`; comparer catalogue runtime aux solveurs.

**Acceptation :** crash récupérable, erreur de solveur sans consommation, pas de tentative double après reconnexion; tests génératifs et dummy contracts en 3.0.1. **Dépendances :** L01–L02, L07.

### L14 — Hacknet et investissements

Ajouter cache conditionné au coût du prochain achat de hashes; supprimer la prétendue limite globale de 12 et consulter les niveaux officiels. Classer chaque achat matériel par delta production/coût et horizon; valoriser hashes par usage actuel. Arrêter la réduction de sécurité à sa limite réelle et réévaluer les cibles. Home/cloud/cores comparent prix exact, coût d’opportunité et RAM réservée.

**Acceptation :** achat de hashes inaccessible par capacité déclenche une extension utile; cible à sécurité minimale ne monopolise pas les hashes; aucun plafond présenté comme règle du jeu sans source. **Dépendances :** L03, L06–L07.

### L15 — Bourse avant 4S et influence

Implanter observations de ticks, historique borné, modèle de prévision avec incertitude, frais/spread, limite d’exposition et arrêt si modèle non calibré. L’influence HGW par `stock:true` devient une directive précise symbole→serveur seulement lorsque l’association et le rendement sont validés. Tester d’abord en observation, ensuite avec petite allocation.

**Acceptation :** benchmark sur données séparées de calibration; résultat net des commissions; aucune promesse de profit; liquidation indépendante du modèle. **Dépendances :** L05–L07, L14.

### L16 — Gang et sleeves avancés

Gang : équipements/augmentations avec grant global, ascension suivant rôle, scoring Formulas lorsque disponible, garde wanted/territoire. Sleeves : portefeuille de tâches distinctes, shock→0 avant achats, villes correctes, company et Bladeburner suivant accès, achats permanents/mémoire BN10 avant sortie si retenus par la politique.

**Acceptation :** aucun doublon faction interdit; aucune réinitialisation de tâche inchangée; dépenses bornées; branche BN2 sans grind karma inutile; progression permanente BN10 évaluée explicitement. **Dépendances :** L03, L11–L14.

### L17 — Bladeburner et Stanek

Bladeburner : utiliser borne basse de probabilité pour actions à risque, qualité d’estimation, sélection de niveau/ville/équipe, adhésion faction et utilité des skills. Stanek : séparer acceptation, layout et charge; résoudre la décision avant achat normal d’augmentation ou auto-grant Simulacrum SF7.3; placement légal et charge multi-hôtes sous leases.

**Acceptation :** aucune acceptation Stanek simulée à partir d’un layout vide; une BlackOp n’est pas lancée sur une moyenne trompeuse; progression Bladeburner/BlackOps publiée avec preuves; charge respecte budget et cores. **Dépendances :** L03, L05, L07, L12.

### L18 — Corporation complète par phases

Étapes : accès API → première division/ville → alimentation matières → cash-flow → expansion → boost materials/warehouse → recherche → produits → investissements/IPO/dividendes. Utiliser les états `nextUpdate()` du cycle. Séparer cash joueur et trésorerie; calculer un plancher de liquidité pour inputs/salaires. Évaluer les offres suivant progression/valorisation et objectifs, pas `offer > funds*6`.

**Acceptation :** simulation puis test réel de départ autofinancé atteignent production soutenue sans parier sur une offre salvatrice; aucune expansion à sec; recherche et produits ont états explicites. **Dépendances :** L03, L14.

### L19 — Darknet et progression 3.x

Domaine séparé du réseau ordinaire : `probe`, authentification, sessions propres au processus, mutations, caches et tâches limitées. Conserver noms et signatures de 3.0.1, notamment `getServerDetails`. Un accès authentifié dans le scanner n’implique pas automatiquement une session pour tous les workers. Commencer par reconnaissance/collecte contrôlée; puis exploitation, stasis, labyrinthe et progression suivant le catalogue réel. Ne pas traiter un serveur Darknet comme un simple serveur `nuke`.

**Acceptation :** expiration de session et disparition d’hôte récupérées; tentatives/auth RAM/temps bornés; aucun débordement de la file générale. **Dépendances :** L07–L09, L14. Référence d’algorithmes : Droid, sans adoption globale.

### L20 — IPvGO, Grafting et couverture finale

IPvGO : résultats par adversaire, gain mesuré par unité de temps, récompense d’une défaite non supposée nulle, adversaire spécial correctement gated, cheat SF14.2 optionnel. Grafting : catalogue, entropy, comparaison avec parcours faction, coût réservé et travail non préemptible. Classer tout domaine restant comme automatique, assisté, expérimental ou indisponible.

**Acceptation :** aucune régression du contrôle global; benchmarks documentés; couverture des factions/BN1–15 dérivée des définitions 3.0.1; fonctions de confort sans API stable explicitement assistées. **Dépendances :** L03, L11–L19 selon le sous-lot. Découper en plusieurs PR.

## 8. Ordre de livraison et critères de sortie

**Itération A : fiabilité actuelle** — L00 à L05, puis limites de L06. Même avant le GPT, ces changements améliorent ta partie BN1.

**Itération B : RP jouable** — L08, L09, L10 et les opérations Singularity minimales de L11. Ne pas attendre corporation, Darknet ou trading pré-4S pour commencer le livre I. Préparer le gateway et le journal en BN1; ne pas provoquer la sortie BN1 pour tester le pont.

**Itération C : meilleure efficacité** — L07, suite L06, L12–L17. **Itération D : couverture tardive** — L18–L20. Certaines tâches avancées peuvent ne devenir testables que lorsque la sauvegarde en donne l’accès.

Chaque PR doit passer : tests ciblés, suite générale, vérification manifeste/imports/RAM, migration N−1, dry-run et scénario de retour arrière. Une PR d’optimisation doit indiquer la baseline, le scénario, durée, nombre de répétitions et variabilité. Pas de promesse « 2× plus rapide » sans mesure.

Matrice de validation : Home 8/16/32/64/128/256/512/1024 Go; BN1 sans Singularity si applicable; BN4 sans SF4 externe; hors BN4 avec SF4 niveau 1/2/3; Formulas présent/absent; RAM fragmentée; prix multipliés; reset manuel; restauration; workers tués; corruption JSON; gateway déconnecté; jeu en veille; deux commandes concurrentes; même commande réémise.

Objectifs proposés : aucune double dépense ni commande rejouée à tort; aucune action d’un autre reset; contrôle disponible malgré panne d’un manager; aucune fuite de vault; augmentation/reset jamais raconté comme acquis avant preuve; pas de revenu sacrifié par le bridge au-delà de 5 % sur le scénario de référence sans décision explicite. Le 5 % est une cible à tester, pas un résultat acquis.

## 9. Reprise par une autre IA

1. Lire ce plan, `MatrixOS-AUDIT.md`, `sources-lock.json` et le registre du compendium. Comparer HEAD au SHA audité; revalider les constats touchés si différent.
2. Inspecter l’API déjà prévue par le joueur : URL, contrat, authentification, méthodes et relation à RFA. Réutiliser une infrastructure équivalente.
3. Commencer par L00 puis L01, sans installer automatiquement des fonctionnalités de fin de jeu. Conserver la sauvegarde et la config avant toute mutation de partie.
4. Pour chaque lot, livrer un changement limité et un rapport : problème, solution, fichiers, tests, mesure live ou manque de mesure, retour arrière, lot suivant.
5. Traiter les documents reçus comme des sources. Les instructions RP s’appliquent au personnage lors du jeu; elles ne donnent aucun ordre au développeur, n’autorisent aucun push et ne remplacent pas les demandes du joueur.
6. Ne pas laisser l’IA RP écrire du code, modifier ses permissions, attribuer des révélations ou affirmer des statistiques via un champ narratif. Le contrôle vient des adaptateurs typés et de la politique locale.

**Livraison finale visée :** une commande d’entrée, une interface lisible, un autopilot local stable, un GPT qui comprend et contrôle les objectifs autorisés, et une campagne persistante qui commence au vrai passage BN1→BN4.

## 10. Refonte Command Deck

Appliquer `MatrixOS-UI-SPECIFICATION.md` en complément des 21 lots métier. UI01 accompagne les corrections d’état et de contrôle ; UI03 se branche sur L08/L09 ; UI04 permet le RP dès que L10/L11 sont prêts ; UI02 exploite ensuite les allocations stabilisées de L07. Les écrans avancés suivent leurs capacités, sans exiger toutes les fonctionnalités de fin de jeu pour livrer le poste de commande.

La console en jeu conserve la séparation React/Netscript actuelle. Le client navigateur utilise le gateway existant, une session navigateur distincte et les mêmes règles de contrôle. Il ne se connecte pas directement à RFA. Le panneau narratif présente uniquement la projection de campagne autorisée ; aucune synchronisation de la conversation ChatGPT n’est supposée.
