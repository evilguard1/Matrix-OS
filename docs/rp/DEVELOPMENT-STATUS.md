# Candidat 1.11.0-rp.4 — 5 septembre 2026

## Nouveau : accès aux factions de hacking

Le [parcours backdoors](BACKDOOR-ROUTES.md) ajoute une neuvième étape au cycle Singularity. Le contrôleur prépare une cible admissible parmi les quatre factions de hacking, lance un worker natif isolé, rend le terminal à home et vérifie la postcondition. Les deux processus consomment ensemble 21,25 Go en BN4; le maximum de réserve de 23,1 Go ne change pas.

Un verrou terminal durable protège contrôleur et worker, y compris un worker orphelin. Les resets MatrixOS attendent sa libération. La recette native interrompt l'installation de CSEC puis reprend par le superviseur : backdoor, invitation, adhésion CyberSec et travail de faction sont réellement exécutés. Les compétences et l'accès root sont synthétiques; la sauvegarde Steam reste intacte. RP03 n'est pas terminé : ce verrou ne constitue pas encore l'arbitre général d'activités ou la pause globale.

## Nouveau : départ automatique à faible RAM

Le [contrôleur early](EARLY-AUTOMATION.md) prend le relais après le déploiement du botnet, dès 16 Go en BN4. Il achète les programmes bon marché, protège l’épargne destinée à home et double la RAM jusqu’au seuil de 64 Go. Le passage au moteur complet reprend le SHA installé et conserve les préférences. Les tests natifs couvrent 16 → 32 → 64 Go, 32 → 64 Go, TOR, BruteSSH et le lancement effectif de Ghost. Les fonds sont synthétiques : aucun délai de revenus ni fonctionnement sur la sauvegarde Steam n’est certifié.

## Nouvelle étape : progression BN4 à 64 Go

Singularity est désormais un contrôleur de 4 Go et huit tâches courtes : infrastructure/invitations, catalogue, valorisation, achats/dons, travail de faction, RAM home, observations et installation des augmentations. La tâche la plus coûteuse consomme 23,1 Go en BN4, contre 65,35 Go pour l'ancien service complet. Les chemins Netscript restent des appels statiques ordinaires; le découpage ne contourne pas leur facturation RAM.

Le superviseur réserve une place pour une tâche à la fois. À 64 Go, avec Singularity disponible, les services cloud/Hacknet/Go cèdent leur place à la progression. Le hacking respecte cette réserve, y compris le partage de RAM. Sans SF4 dans BN1, le jeu de services précédent conserve sa priorité. Hors BN4, la décision utilise les coûts réellement facturés selon le niveau de SF4.

Chaque étape produit un reçu lié au cycle et au reset. Le contrôleur attend la fin du PID puis vérifie le reçu; il signale les tâches manquantes, bloquées par la RAM ou interrompues. Il attend les tâches orphelines plutôt que d'en lancer une deuxième. Ces reçus internes ne constituent pas encore le journal durable des futurs ordres GPT.

Le travail de faction en cours n'est plus relancé à chaque redémarrage. Une activité manuelle différente est conservée. Une activité démarrée par MatrixOS porte une attribution incluant faction, type de travail et reset. La pause globale complète et l'arbitrage de tous les autres services restent à livrer dans RP03.

Daedalus ne bloque les dépenses pour ses 100 milliards qu'après vérification du nombre d'augmentations **installées** et du seuil de compétence. Le nombre requis vient de l'API d'invitation disponible en BN4, sans dépendance à SF5. La corporation ne réserve plus des fonds quand son service n'est pas disponible. Le prix et la réputation de la Red Pill viennent du jeu; une Red Pill en attente d'installation déclenche l'objectif de reset. La sortie du node exige une observation récente de la Red Pill installée et un niveau requis du World Daemon strictement positif.

Le test [natif RP05](evidence/rp05/native.json) exécute le superviseur, le hacking, Ghost et deux cycles complets dans un home de 64 Go. CyberSec et le contexte BN4 sont initialisés par le harnais de test; l'activité de faction est ensuite démarrée par les vrais scripts et conservée au second cycle. Ce n'est pas une preuve du trajet complet depuis une partie neuve ni d'un reset réel. Le pic de RAM indiqué est échantillonné toutes les 250 ms.

La Red Pill coûte 0 $ dans 3.0.1. Le registre autorise désormais explicitement les augmentations gratuites, avec reçu et respect de la pause. Le test natif ajoute ensuite une appartenance Daedalus et 2,5 millions de réputation synthétiques pour vérifier un véritable achat gratuit : un reçu, aucun débit, augmentation en attente et non installée. Aucun reset réel n'est effectué par cette recette.

La surveillance après installation reste ouverte dans RP02. Ce candidat donne priorité au déblocage de la progression à faible RAM. Les voyages, entraînements, crimes, entreprises et plans durables de route demeurent à implémenter avec RP03–RP05.

## Fondations conservées depuis 1.11.0-rp.1

La branche `rp/ghost-node-war` contient maintenant des changements exécutables du moteur. La campagne complète n'est pas certifiée et les commandes GPT ne sont pas encore activées. `main` demeure la base 1.10.2. Les preuves initiales de l'audit sont historiques; les preuves ci-dessous concernent ce candidat.

## Ce qui fonctionne dans les tests

- Une seule publication du coordinateur conserve objectif, réserve, budgets et révision. Les lecteurs rejettent une télémétrie canonique périmée, future ou issue d'un ancien reset. Les directives d'une autre révision sont ignorées.
- Les achats de serveurs, Hacknet, actions, accès boursiers, programmes, RAM home, augmentations, dons, augmentations de sleeves et création autofinancée de corporation passent par un registre commun. Le prix est relu avant l'effet. Les achats du propriétaire de l'objectif peuvent utiliser sa réserve; les autres dépenses la respectent.
- Dans Bitburner 3.0.1, `ns.write()` est synchrone. La section prix → permission → intention persistée → achat natif → reçu ne contient aucun `await`. Cette propriété protège les achats participants dans le même moteur JavaScript; elle ne contrôle pas les scripts tiers. Une issue ambiguë laisse le registre bloqué. La réconciliation opérateur reste à livrer avec RP04.
- Les clés internes d'achat sont retenues séparément des 128 derniers reçus, avec refus de nouvelles clés après 1024 clés par reset. Ce mécanisme ne remplace pas encore le protocole des commandes externes avec validation de leur contenu.
- Le budget des augmentations de sleeves est partagé par tout le cycle. Le seuil de karma est corrigé, avec exemption BN2 et respect de `disableGang`. La Red Pill achetée est distinguée de la Red Pill installée.
- Le portefeuille conserve ses positions sans 4S. Une liquidation relit les positions après la vente; un refus de vente reste visible. Les achats incluent les commissions dans leur prix.
- Le hacking respecte le plafond réel de prélèvement après arrondi du nombre de threads. Une cible trop grosse ou impossible à placer ne bloque plus les suivantes.

## Mise à jour

Le profil `/matrix/release.json` conserve canal et SHA installé, séparément des préférences. Sur cette branche, le canal initial est `rp/ghost-node-war`. Un changement de palier reprend le SHA installé. Une mise à jour demandée par `/matrix/update.js` résout le dernier commit du canal puis transmet ce SHA à l'installateur; il n'est pas résolu une seconde fois. En cas d'échec réseau, il n'existe plus de repli silencieux vers `main`.

L'installateur vérifie le SHA-256 de chaque téléchargement, prépare les sauvegardes dans `/matrix/state/install-transaction.json`, arrête les propriétaires concernés et remplace les fichiers avec relecture. Le manifeste, le profil et le palier sont écrits après le code. Une exception ou une reprise avec journal `prepared` restaure les fichiers sauvegardés. La configuration existante est conservée, sauf demande explicite `--fresh`. Le code du worm reste actif pendant la transition comme dans 1.10.2.

`installed` signifie que les fichiers ont été promus et vérifiés. Cela ne signifie pas que les services lancés sont sains. La surveillance après lancement et le retour automatique à une release dont la santé a été prouvée restent à terminer dans RP02. `previousSha` désigne seulement l'installation précédente. Le rollback n'annule pas les effets déjà produits dans le jeu.

Les manifestes anciens sans hashes sont refusés par cet installateur. Le choix explicite du canal `main` n'autorise donc pas une migration vers un ancien manifeste incompatible. Les profils corrompus et journaux invalides provoquent un arrêt explicite.

## Preuves et reproduction

`npm test` inclut les nouveaux tests de budget, d'admission et d'installation. `npm run test:ghost` et `npm run test:rp-contract` vérifient séparément le dashboard et le dossier de livraison. Après une modification d'un fichier distribué : `npm run release:manifest`, puis les tests. Les hashes portent sur le contenu Git avec fins de ligne LF.

- [Achat natif et RAM par contexte](evidence/rp01/native.json) : achat réel d'un serveur 8 Go à 440 000 $, une seule exécution après rejeu, solde 1 560 000 $. Contextes RAM BN1, BN4 et niveaux SF4 synthétiques.
- [Installation native](evidence/rp02/native.json) : paliers 8/16/64/128/256 Go, installateur 5,3 Go, configuration conservée et aucune erreur de compilation. Les téléchargements sont servis par une interception de test avec les vrais fichiers du candidat.
- [Tests reproductibles](../../tests/native) : voir le README de ce répertoire. Moteur officiel 3.0.1 au SHA `3162fd2590e221eadd0c0fbd46151913f7c4c41c`, environnement isolé, aucune modification de la sauvegarde Steam.

## Travail encore nécessaire avant une campagne

RP02 doit surveiller le lancement. RP03 doit fournir capacités vérifiées, pause complète et arbitrage des activités. RP04 doit fournir commandes et tâches persistantes, annulation, reprise et réconciliation. RP05 doit terminer les routes autonomes au-delà du cycle de faction livré ici. RP06 doit préparer et constater les resets. Les modules avancés, l'API du GPT, les briefings fondés sur des objectifs nommés et la recette de campagne restent dans RP07–RP12.

L'objectif final demeure une partie pilotée par intentions et options exécutables. Cette livraison corrige des fondations indispensables; elle ne garantit pas encore une partie entière sans développement.
