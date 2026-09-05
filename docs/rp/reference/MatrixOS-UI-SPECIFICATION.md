# MatrixOS Command Deck — spécification de refonte de l’interface

**Avancement du 5 septembre :** une première édition native, **Ghost Command Deck**, est désormais implantée sur une base 1.10.2 et livrée dans `Ghost-Deck/`. Elle apporte neuf vues, des contrôles d’options existantes et un installateur réversible, vérifiés dans une partie isolée du moteur 3.0.1. Le présent document reste la cible complète ; les contrats du gateway, le contrôle global renforcé, le thème clair et le moteur RP demeurent à implanter. Les statuts historiques des lots ne constituent pas un inventaire du code de cette nouvelle édition : lire aussi `Ghost-Deck/VALIDATION.md`.

Édition du 4 septembre 2026. Complément au plan principal, demandé après son premier dépôt. **Statut : conception proposée, non implantée.** Cible : Bitburner 3.0.1, préparation BN1, campagne à l’entrée réelle dans BN4. Référence du dépôt : `2e6977cc15d3aea05bdc2c80b9073b963c76108e`.

## 1. Résultat attendu

Créer une nouvelle interface complète appelée provisoirement **Command Deck** : un poste de commande permettant de comprendre ce que MatrixOS fait, pourquoi il le fait, ce qu’il attend et ce que le joueur peut décider. Conserver l’identité Matrix avec un accent vert, des surfaces sobres et une présentation des nombres en monospace. Réserver une typographie sans empattement aux textes et décisions.

La refonte dépasse un changement de couleurs. Elle réorganise navigation, états, commandes et narration. L’interface actuelle a été examinée dans son code, pas dans une session Steam active ; aucune comparaison de fluidité en jeu n’est encore établie. La maquette conversationnelle présente des données fictives, des interactions locales et seulement quatre écrans illustratifs. Elle n’est ni un client opérationnel ni une reproduction de la sauvegarde du joueur.

## 2. Deux surfaces, une autorité

| Surface | Fonction | Contraintes |
|---|---|---|
| Console dans Bitburner | État essentiel, contrôle, blocages, accès aux détails | Conserver la séparation actuelle : `main(ns)` observe/exécute, composants React présentent. Admission suivant RAM effectivement calculée. |
| Command Deck dans le navigateur | Vue détaillée, historique, campagne, inspection des décisions | Client du gateway prévu en L08/L09 ; même projection et mêmes règles de commandes. Pas de seconde connexion RFA. |
| GPT personnalisé | Dialogue et RP | Continue dans ChatGPT via Actions. Le panneau MATRIX ne prétend pas intégrer ni synchroniser la conversation ChatGPT. |

Le navigateur évite de charger tout le poste de commande dans les scripts du jeu. La console en jeu reste utile sans navigateur et conserve un mode texte si React ne peut pas être lancé. L’autopilot fonctionne même si les deux interfaces sont fermées.

Le panneau narratif affiche les événements de campagne publiés et les éventuels textes du narrateur déjà persistés par un mécanisme explicite. L’API actuelle ne prévoit pas de retour automatique des réponses du GPT : ne pas inventer cette synchronisation. Ajouter un tel mécanisme exigerait un contrat distinct, hors MVP.

## 3. Architecture d’information

Navigation de la version complète : **Vue d’ensemble, Réseau, Services, Progression, Campagne, Journal**. Paramètres accessibles depuis le bandeau. Ne pas créer un onglet par script. Les domaines tardifs s’intègrent à Progression et Services selon les capacités réellement constatées.

| Écran | Contenu prioritaire | Interaction utile | Critère de résultat |
|---|---|---|---|
| Vue d’ensemble | Objectif actif, santé, trésorerie/réserves, revenu net défini, RAM Home et capacité allouable | Examiner un blocage ; pause globale ; consulter la dernière décision | En une vue, identifier l’objectif et la raison du prochain travail |
| Réseau | Hôtes, accès, rôle, RAM, workers propriétaires, cibles, préparation et échéances | Sélectionner un hôte puis une allocation | La somme des allocations se rapproche de la RAM observée, avec processus étrangers séparés |
| Services | État demandé/observé, heartbeat, dernier progrès, budget, files, dernière erreur | Examiner la raison d’arrêt ou la capacité absente ; commandes prises en charge | Un service bloqué ne s’affiche pas « sain » uniquement parce que sa boucle répond |
| Progression | Chemin courant, factions, réputation, panier d’augmentations, étapes manuelles et accès | Choisir un objectif pris en charge ; inspecter coûts/prérequis | Distinguer acquis, en file, atteignable et inconnu |
| Campagne | Acte/scènes publiées, choix disponibles, faits vérifiés, chronologie connue du personnage | Choix publié ou accusé de lecture | Rien du coffre GM n’est transmis au navigateur joueur ni au GPT |
| Journal | Observations, décisions, commandes, résultats, événements RP | Ouvrir les preuves d’une décision et son identifiant de commande | Une narration ne remplace jamais un résultat Netscript |

Préférer une liste réseau triée et des détails à une carte animée permanente. Une carte optionnelle n’entre en développement qu’après validation d’un besoin réel. Les indicateurs de progression utilisent un dénominateur vérifiable ; aucun pourcentage global inventé pour « finir BN1 ».

## 4. Composition et composants

Arborescence proposée, à adapter aux conventions réelles du dépôt lors de L00 :

```text
matrix/dashboard.jsx                 # entrée conservée, façade de compatibilité
matrix/ui/theme.js                   # tokens produit ; aucune API ns
matrix/ui/formatters.js              # montants, durées, RAM, valeurs inconnues
matrix/ui/selectors.js               # projection -> modèles de vues purs
matrix/ui/components/StatusStrip.jsx
matrix/ui/components/CommandReceipt.jsx
matrix/ui/components/CapabilityReason.jsx
matrix/ui/components/DecisionDetail.jsx
matrix/ui/screens/Overview.jsx
matrix/ui/screens/Network.jsx
matrix/ui/screens/Services.jsx
matrix/ui/screens/Progression.jsx
matrix/ui/screens/Campaign.jsx
matrix/ui/screens/Journal.jsx
gateway/ui/                          # client navigateur, emplacement à confirmer
tests/ui/fixtures/                   # états synthétiques sans sauvegarde ni secrets
```

`StatusStrip` montre version, BitNode observé, fraîcheur, état de connexion et politique active. `CommandReceipt` conserve la demande, l’état serveur, le résultat et sa preuve. `CapabilityReason` explique accès absent, RAM insuffisante, politique, ou absence d’exécuteur. `DecisionDetail` expose objectif, coût, réserve, propriétaire de ressource et règle ayant conduit à la décision.

Partager les sélecteurs et types purs entre les deux surfaces. Ne partager les composants React que si les versions et mécanismes de chargement sont compatibles ; sinon deux couches de rendu fines. Aucun import navigateur, `window`, `document`, `fetch` ou client gateway dans les modules Netscript. Le JavaScript DOM de la maquette reste strictement hors du déploiement en jeu. Préserver les tests de rendu sans accès `ns` dans callbacks, effets ou minuteurs React.

## 5. Données et vérité affichée

Les noms de champs définitifs restent ceux des contrats canoniques de L01 et L08. Introduire un adaptateur de vue ; ne pas remplacer les schémas existants par ceux de la maquette.

Chaque vue sait identifier : révision/epoch du snapshot, horodatage de capture, fraîcheur, source, capacité requise, valeur éventuellement inconnue. Les montants inconnus affichent « Indisponible » ou « — » avec raison, jamais zéro. Un revenu de scripts ne se présente pas comme un revenu total. Une moyenne indique sa fenêtre. Une réserve n’est ni un solde dépensé ni une RAM déjà utilisée.

La vue Home affiche séparément RAM maximale, utilisée, réserve future et encore allouable. L’agrégation réseau utilise les hôtes admissibles au scheduler et indique son périmètre. Chaque montant budgétaire doit pointer vers la révision du registre de dépenses ; la UI ne recalcule pas une autorisation d’achat concurrente.

Présenter les dernières valeurs reçues lors d’une déconnexion, grisées avec leur âge. Elles restent consultables mais ne sont pas qualifiées d’actuelles. Une commande dépendante d’un snapshot périmé est bloquée dans le client et revalidée au serveur.

## 6. États et commandes

| Situation | Affichage | Comportement |
|---|---|---|
| Première ouverture | Chargement ou absence de snapshot | Aucun indicateur de succès ni nombre fictif |
| Gateway joignable, jeu absent | Gateway connecté / jeu déconnecté | Lecture du dernier état identifié comme ancien ; contrôle du jeu indisponible |
| Heartbeat récent, aucune progression attendue observée | Bloqué ou à examiner, avec raison | Ne pas confondre disponibilité du processus et réussite du travail |
| Pause demandée | Arrêt des admissions, travaux encore en cours | Pas d’état « en pause » anticipé |
| Pause confirmée | Services arrêtés/suspendus et exceptions persistantes listés | Contrôle et télémétrie restent accessibles |
| Accès absent | Verrou avec explication exacte | Guide manuel si disponible ; aucune tentative d’API inaccessible |
| RAM insuffisante | Coût calculé, RAM disponible, service non admis | Version réduite de l’interface ou mode texte |
| Réponse perdue | Résultat inconnu, rapprochement en cours | Interroger le job existant ; ne pas créer une seconde commande |
| Nouveau reset/epoch | Session renouvelée | Invalider sélections sensibles et commandes de l’ancien epoch |
| Choix RP publié | Choix et conséquences narratives connues | Aucune mutation du jeu implicite ni accès aux branches secrètes |

Le MVP utilise les seules opérations déjà définies dans `gateway-openapi.json` : consultation santé/snapshot/événements/contexte/commande, pause, reprise, objectif, boost réputation borné, choix de campagne, accusé de scène. Ne pas afficher comme disponibles des commandes « arrêter un service », « tuer ce PID », « installer les augmentations » ou « changer de BitNode » : elles nécessitent d’abord un adaptateur et une politique typés. Les détails de services sont consultables dès le MVP.

Pour une mutation prise en charge : capturer le contexte requis par le contrat, créer l’identifiant d’idempotence, afficher l’état local « envoi », conserver le reçu `202` et suivre la commande par son identifiant. Mapper les états canoniques vers des libellés français sans inventer une deuxième machine d’états. Une erreur de transport n’établit ni échec ni succès du jeu.

Les confirmations de resets futurs affichent le panier, ce qui sera perdu, l’état de sauvegarde et le contexte de transition. Elles viennent seulement avec L12 et un contrat adapté. L’interface ne transforme jamais un bouton de lecture ou de choix narratif en reset.

## 7. Identité visuelle et accessibilité

- Thème système par défaut, avec variantes Graphite et Clair. Accent vert Matrix réservé à l’état actif et aux repères utiles ; ambre pour attention, rouge pour erreur, avec libellé explicite.
- Texte courant 14–16 px, légendes au moins 12 px dans la version livrée ; monospace pour valeurs, hôtes et identifiants. Contraste cible de 4,5:1 pour texte normal, à mesurer sur tous les états.
- Espacement confortable par défaut ; variante compacte qui réduit les marges, pas la lisibilité. Pas de pluie de caractères, balayage, clignotement ni animation en boucle par défaut.
- Desktop : navigation latérale et détails adjacents. À petite largeur : navigation repliée ou réorganisée et détails empilés ; conserver les actions essentielles dès 320 px, sans faire défiler toute la page horizontalement.
- Boutons natifs, labels explicites, focus visible, parcours clavier complet, cibles tactiles d’environ 44 px. Résultats de commandes annoncés sobrement via région accessible ; ne pas annoncer chaque tick.
- Conserver sélection, vue et préférences locales entre mises à jour. Respecter `prefers-reduced-motion`. Prévoir tests light/dark et à 200 % de zoom.

La maquette comporte un réglage d’ambiance, de densité et de présence du panneau narratif dans les options de présentation fournies par l’hôte. Ces choix illustrent une direction ; leur validation esthétique n’est pas une validation technique en jeu.

## 8. Performance, accès et exploitation

Console : recalculer seulement les sélecteurs affectés ; borner l’historique rendu, éviter l’animation permanente. Proposer un rafraîchissement à 1 s pour les vues actives, ralentir les détails secondaires, puis mesurer l’effet sur le scheduler. Ce sont des réglages initiaux à tester, pas des garanties de performance. Une UI lourde ne doit pas retarder les workers.

Client navigateur : commencer par les routes de lecture existantes avec polling borné et un seul appel en vol par ressource ; backoff jusqu’à 30 s sur panne, reprise progressive. Ne pas ajouter WebSocket/SSE au contrat simplement pour animer les nombres. Borner le journal à 200 lignes rendues, chargement d’historique via curseur, âge de snapshot toujours visible.

Le navigateur ne reçoit pas la clé privée utilisée par les Actions GPT. Servir la UI en même origine que son backend, avec une session navigateur distincte ; prévoir un appairage local, cookie HttpOnly/SameSite et protection CSRF pour mutations. Si un tunnel public est utilisé, aucune route de contrôle anonyme. Formaliser les routes de session séparément du contrat Actions. Ne jamais placer les secrets en query string, dans le bundle ou dans les exports de diagnostic.

La console locale emploie le même routeur de commandes et la même politique, sans exiger Internet. Le coffre GM ne doit entrer dans aucun bundle joueur ; masquer un composant côté client ne protège pas un secret. La source de campagne doit fournir exclusivement la projection autorisée.

## 9. Lots d’implantation complémentaires

Ces quatre lots UI complètent L00–L20 sans renumérotation. Le fichier `ui-backlog.json` porte les dépendances et critères structurés. Ce sont des tâches planifiées, pas des correctifs réalisés.

### UI01 — Fondations et console essentielle

**Dépendances : L00, L01, L02.** Créer tokens, formatters, sélecteurs, bandeau santé, reçus, états absents/périmés et Vue d’ensemble. Brancher la console React actuelle via une façade. Mettre l’ancienne UI derrière un choix de configuration réversible, dont le nom sera figé en PR. Ajouter le mode texte de secours.

**Acceptation :** les fixtures chargement, actif, déconnecté, périmé, RAM insuffisante et pause partielle sont correctement rendues ; aucun callback React ne touche `ns` ; aucune donnée simulée dans le runtime ; RAM mesurée dans 3.0.1 aux paliers prévus. **Retour :** restaurer l’ancienne UI sans migration de l’état métier.

### UI02 — Réseau, services et décisions

**Dépendances : UI01, L03, L07.** Livrer les listes et panneaux de détails, preuves des décisions et raisons d’admission. Afficher owners/leases lorsque présents ; ne pas déduire un nombre de workers depuis une division approximative de la RAM.

**Acceptation :** allocation fragmentée, processus étranger, budget refusé, service sans progrès, capacité absente et pause en charge ont des raisons compréhensibles ; toutes les actions affichées correspondent à un adaptateur existant. **Retour :** désactiver les nouveaux écrans, conserver Vue d’ensemble et l’ancien diagnostic.

### UI03 — Client navigateur et commandes

**Dépendances : UI01, L08, L09.** Servir le client et sa session distincte, consommer les contrats existants, connecter pause/reprise/objectif/boost, suivre les reçus et le rapprochement après panne. Réutiliser les sélecteurs ; garder les composants Netscript sans dépendance Web.

**Acceptation :** authentification, session expirée, CSRF, double clic, réponse perdue après acceptation, rejeu de même identifiant et changement d’epoch testés ; aucun appel RFA direct ; aucune clé Actions dans le navigateur. Essai réel prouvant qu’une pause demandée puis confirmée correspond aux processus de jeu. **Retour :** retirer le client navigateur ; la console et l’autopilot continuent localement.

### UI04 — Progression, campagne et finition

**Dépendances MVP : UI01, UI03, L10, L11.** Livrer Progression en lecture, Campagne et Journal corrélés, choix publiés et accusés de scène. Ajouter les contrôles d’augmentations seulement après L12 et contrats associés. L02 fournit les états nécessaires au journal initial ; ne pas attendre tous les domaines tardifs pour rendre la chronologie utile.

**Acceptation :** BN1 ne déclenche pas l’ouverture BN4 ; aucun secret GM dans payload, bundle, erreur ou journal joueur ; étapes manuelles encore visibles si exécuteur absent ; prix/achats en file correctement distingués ; clavier, zoom, modes clair/sombre et faibles RAM contrôlés. **Retour :** lecture seule et masquage des vues avancées, conservation des événements déjà validés.

## 10. Séquence et définition de terminé

UI01 accompagne l’itération A du plan principal. UI03 et le sous-ensemble RP de UI04 accompagnent l’itération B ; UI02 suit les données d’allocation stabilisées de L07. Les domaines avancés de Progression arrivent avec leurs lots métier. Ne pas bloquer le début du RP sur une refonte graphique complète.

La refonte est terminée lorsque le joueur peut répondre à « Que fait le système ? Pourquoi ? Que puis-je faire ? Ma commande a-t-elle réellement abouti ? » sur données réelles, avec preuves de pause/reprise, déconnexion/reconnexion et transition de campagne. Fournir captures et mesures pour les deux surfaces, tests des états dégradés, comparaison RAM/temps de rendu avec la référence et procédure de retour arrière.

La maquette actuelle valide seulement la direction et quelques interactions locales. Les tests de rendu ne prouvent ni compatibilité Netscript, ni exactitude d’un solde, ni fonctionnement de l’API, ni performance dans Bitburner.
