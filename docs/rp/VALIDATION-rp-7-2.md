# Validation de la version 1.11.0-rp.7.2

Les huit familles de tests natifs ont ete reexecutees sur les sources de cette version, dans le moteur officiel Bitburner 3.0.1 isole de la sauvegarde Steam. npm test et npm run test:rp-contract passent. Le controle de correspondance entre les empreintes des sources et les preuves est conserve: aucune ancienne empreinte n'a ete modifiee pour simuler une nouvelle execution.

## Corrections supplementaires

1. Le kernel lance l'agent externe existant des 32 Go, avec verification de sa presence, de son unicite et de la RAM necessaire au moteur early. A 16 Go, il le differe. Apres un achat 16 vers 32 Go, le controleur repasse par le kernel pour activer l'agent, sans attendre 64 Go. Le controleur early conserve son cout natif de 14,15 Go.
2. A 64 Go, les nouveaux observateurs permanents pouvaient empecher Singularity de demarrer. Le superviseur donne maintenant priorite au dispatcher. Telemetrie et coordinateur peuvent emprunter sa reserve entre deux cycles; si une tache manque de RAM, le dispatcher arrete uniquement ces observateurs geres. Le superviseur les relance ensuite. Agent, dashboard, travaux HWGW en vol et processus etrangers sont preserves. A partir de 128 Go cette preemption n'est pas utilisee.
3. Le canal fix/rp-runtime-recovery est explicitement accepte par le lecteur de version et l'installateur. Les changements de palier continuent a utiliser le SHA installe, et une mise a jour conserve le canal choisi.

## Preuves natives

| Famille | Resultat verifie |
|---|---|
| RP01 | Achat unique, debit reel, rejeu sans second achat, calcul RAM dans cinq contextes node/SF synthetiques |
| RP02 | Installateur a 5,3 Go; installations 8/16/64/128/256 Go; canal de recuperation conserve; configuration protegee |
| RP05 | Deux cycles Singularity, travail CyberSec conserve et achat gratuit de The Red Pill; coexistence du bridge a 64 Go |
| Early | 16 vers 32 vers 64 Go et 32 vers 64 Go, agent actif et unique a 32 Go, achats TOR/BruteSSH et installation du palier full |
| Backdoors | Interruption/reprise CSEC, backdoor effectivement installee, retour home et adhésion/travail CyberSec |
| Control | Pause, drainage et reprise a 8/32/64 Go; processus etrangers conserves; travail attribue arrete; briefing de pause frais |
| Briefing | Rapports a 32/64 Go, cout 3,45 Go, rejet de l'objectif si son producteur est mort |
| Objective | Objectif de reputation, reprise du dispatcher, franchissement reel du seuil et rejeu sans duplication |

Les JSON sont dans docs/rp/evidence. Les runners reproductibles et leurs conditions sont dans tests/native/README.md. La RAM, les fonds, les competences et certaines appartenances sont synthetiques: les tests accelerent les transitions et ne prouvent pas le temps necessaire pour gagner ces fonds ni un parcours BN4 complet. Les pics RAM publies sont echantillonnes; ils ne mesurent pas chaque allocation submilliseconde.

## Limites maintenues

rpReady reste false. Les 20 scenarios du catalogue ne sont pas tous executes, le moteur de campagne et la connexion GPT ne sont pas acheves, et les activites persistantes avancees ne sont pas toutes couvertes par pause/reprise. La detection historique des fichiers de palier reste un sujet distinct. A 64 Go, des observations peuvent etre temporairement indisponibles pendant la liberation de RAM; elles ne doivent pas etre remplacees par des donnees inventees. L'agent doit deja exister sur Home: ce changement automatise son lancement, pas son telechargement.

Cette validation remplace le constat de preuves perimees du rapport RECOVERY-2026-09-07.md. Elle ne transforme pas le contrat de livraison en certification complete du RP.

## Deploiement Steam verifie

Le commit 144433e3bf323176a44ee4e60a8133a5842ec664 a ete installe par l'installateur natif sur Home 512 Go. Les 80 fichiers non proteges ont ete relus et leurs empreintes correspondent au manifeste. La configuration personnelle est identique a celle sauvegardee avant installation. La reprise a un recu succeeded, le briefing et l'agent sont frais et le travail de faction CyberSec est actif. Le controle du 7 septembre a 17:07:51 UTC mesure 2 517 153,76 $ de revenus de hacking supplementaires sur 68,156 secondes, sans echec de lancement. Voir [la preuve de deploiement](evidence/recovery/live-rp-7-2.json). runtimeHealth reste unverified dans le profil d'installation: ces observations ne remplacent pas la certification generale.

Procedure de maintenance constatee: attendre la pause et le drainage complet, puis arreter le processus control-engine pendant l'installation en conservant le journal paused. Le gardien de pause traite sinon remote-install.js comme un nouveau producteur a arreter. Installer avec --no-start; verifier empreintes et configuration; soumettre resume, puis lancer control-engine si l'installateur l'a arrete. Ne pas effacer les journaux de controle ou de l'agent. Le lancement de l'installateur seul ne prouve jamais la promotion de la version.
