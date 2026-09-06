# Routes des factions de hacking — 1.11.0-rp.4

Le cycle Singularity prend maintenant en charge les backdoors de **CSEC → CyberSec**, **avmnite-02h → NiteSec**, **I.I.I.I → The Black Hand** et **run4theh111z → BitRunners**. Il choisit une cible réalisable par cycle, puis le gestionnaire existant relève et accepte les invitations. La valorisation des augmentations et le travail de faction suivent dans ce même cycle.

## Conditions d’admission

Le serveur doit être découvert, avoir les droits root, être accessible au niveau de hacking courant et avoir une durée estimée compatible avec la limite configurée. Les prix, niveaux et noms de serveurs ne sont pas déduits du récit. Le choix s’appuie sur `getServer`, `getHackingLevel` et `getHackTime / 4`, conforme au moteur 3.0.1. Le rooting utilise les programmes réellement possédés, sauf si `automation.rooting` est désactivé.

La liste des quatre cibles est fermée. Ce module ne backdoor jamais le World Daemon. Une backdoor déjà installée est constatée et sautée, y compris si le précédent processus s’est arrêté avant d’écrire son résultat.

Valeurs par défaut, fusionnées sans écraser les préférences existantes :

```json
{
  "progression": {
    "autoBackdoors": true,
    "maxBackdoorTimeMs": 120000
  }
}
```

Le plafond accepté est de deux minutes **estimées par opération**. Une estimation supérieure reporte la cible en attendant un meilleur niveau; ce n’est pas un délai d’annulation d’une opération déjà commencée. Le contrôleur est disponible au palier complet de 64 Go. L’admission tient compte du coût cumulé du contrôleur et du worker natif : **10,65 + 10,6 = 21,25 Go en BN4**. Le maximum réservé au cycle reste de 23,1 Go. Hors BN4, les coûts réels liés à SF4 déterminent l’admission.

## Terminal, interruptions et résultat

Le contrôleur attend si le terminal est connecté ailleurs qu’à home. Il prend un verrou persistant lié au reset, au PID, au fichier et à un jeton. Ce verrou protège les processus MatrixOS participants; il ne verrouille pas les clics du joueur ou les scripts tiers.

L’installation native est exécutée dans `/matrix/workers/backdoor-install.js`. Bitburner interdit un autre appel Netscript dans le même script pendant cette attente : le découpage permet donc au contrôleur de rendre le terminal à home pendant l’opération. Une marque persistante empêche le worker de déplacer ensuite une nouvelle connexion manuelle, y compris une reconnexion au serveur cible.

Le verrou conserve les PIDs du contrôleur et du worker. Un worker natif encore vivant conserve la propriété même si le contrôleur meurt et même si l’estimation a expiré. Après disparition des deux PIDs, un verrou non libéré expire après la durée estimée plus 30 secondes. Une donnée corrompue bloque l’admission et demeure visible pour diagnostic; elle n’est pas effacée automatiquement.

Un worker interrompu ne fournit pas de reçu de réussite. Le contrôleur signale l’échec, libère son verrou quand le worker a disparu et laisse le prochain cycle retenter. La réussite exige le reçu du bon jeton/PID **et** la relecture de `backdoorInstalled` sur la bonne cible dans le même reset. Le retour natif seul ne suffit pas.

Les chemins MatrixOS d’installation d’augmentations et de sortie de node attendent tant qu’un verrou terminal est actif. Master pause, Singularity désactivé et `autoBackdoors: false` interdisent une nouvelle installation. Une installation native déjà commencée termine son travail; la pause globale avec annulation et arbitrage de toutes les activités reste un lot distinct.

## États à lire

| Fichier | Contenu |
| --- | --- |
| `/matrix/state/backdoor-route.txt` | Routes, prérequis, cible, état courant et erreur éventuelle |
| `/matrix/state/backdoor-install.txt` | Reçu du worker, jeton, PID, cible et résultat |
| `/matrix/state/terminal-lease.txt` | Propriétaire, worker associé, expiration et retour du terminal |

Les routes distinguent `not-discovered`, `needs-root`, `needs-skill`, `waiting-faster-hacking`, `ready` et `installed`. Le contrôleur distingue notamment `paused`, `terminal-busy`, `manual-connection`, `connecting`, `installing`, `succeeded`, `failed` et `blocked`.

Ce journal expose la situation courante et permet une reprise fondée sur l’état du jeu. Ce n’est pas encore le journal durable des commandes GPT et de leurs annulations prévu dans RP04.

## Recette et références

- [Tests de logique et de concurrence](../../tests/rp-backdoors.mjs) : accès, pause, prérequis, résultat vérifié, répétition, jeton concurrent, expiration, worker orphelin, connexion manuelle, échec d’écriture et refus de lancement.
- [Recette native](../../tests/native/backdoors.cjs) et [preuve liée aux hashes](evidence/backdoors/native.json) : interruption du vrai worker natif, reprise via le superviseur, backdoor réelle de CSEC, invitation/adhésion CyberSec et début du travail de faction, avec Ghost actif à 64 Go.
- Le harnais fournit BN4, RAM, fonds, XP de hacking et root/sécurité de CSEC. **Il ne fournit ni backdoor ni adhésion CyberSec.** Les trois autres routes utilisent le même exécuteur mais n’ont pas été parcourues intégralement dans cette recette. La sauvegarde Steam et une campagne entière restent non testées.
- Moteur officiel [Singularity 3.0.1](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/Singularity.ts) : capture de la cible, durée et postcondition. Les invitations viennent de [FactionInfo](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Faction/FactionInfo.tsx).
- Comparaison avec [Alain Bryden, backdoor-all-servers](https://github.com/alainbryden/bitburner-scripts/blob/7a8951a1987c0734ae3035894a25c9495e2b28d1/Tasks/backdoor-all-servers.js) : séparation des appels natifs dans un worker et sélection des serveurs admissibles. Aucun code tiers n’est copié dans cette livraison.

RP03 et RP05 restent ouverts : il manque encore l’arbitre général d’activités, les voyages, l’entraînement, les crimes, les parcours d’entreprise et les commandes persistantes du GPT. Le statut de campagne `rpReady` reste `false`.
