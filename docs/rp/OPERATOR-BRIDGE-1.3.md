# Bridge 1.3.0 : objectif de faction depuis le dialogue

Le runtime Netscript reste 1.11.0-rp.7.2. Cette version ajoute deux adaptateurs au bridge externe, sans script permanent ni cout RAM additionnel dans Bitburner. Les choix pause/reprise et leur protocole de tickets 1.2 restent compatibles.

## Choix pris en charge

`GET /v1/operator/briefing` peut proposer `faction-reputation` avec `params.faction`, `params.targetRep` et une observation de la reputation actuelle. Le seuil vient du choix d'augmentation deja calcule par Singularity. Le bridge exige des observations recentes, le meme reset, une faction effectivement rejointe, un dispatcher vivant, le palier full et la progression active. Il ne propose pas de faction ou de seuil arbitraire. Un objectif deja actif doit d'abord etre termine ou annule.

L'utilisateur choisit le ticket tel quel via `POST /v1/operator/commands`. Le bridge revalide les conditions et le couple faction/seuil, puis confie a l'agent l'execution de `/matrix/objective.js faction <faction> <seuil> <id>`. Le moteur existant accepte le but, preserve les activites manuelles, reprend le travail attribue et observe la reputation native. Un objectif actif bloque les resets automatiques selon le fonctionnement existant ; il ne constitue pas une garantie de delai ou de succes.

Lorsqu'un objectif explicite est actif, `automatic-policy` rend la main a la politique automatique via `/matrix/objective.js auto <id>`. Ce choix annule l'objectif actif **au moment de l'execution**. Il ne promet pas d'annuler uniquement un identifiant historique ni d'arreter immediatement tout travail de faction. Les resets automatiques redeviennent possibles selon les preferences enregistrees. L'effet est explicite dans l'option avant le choix.

Les nouveaux identifiants commencent par `rp-goal:` et restent attribues au reset. Les journaux du jeu fournissent la retention et le rejeu apres redemarrage. Les identifiants `rp:` des commandes de controle restent compatibles.

## Preuves de progression

`GET /v1/operator/receipt` ajoute `kind:objective` et `objectiveReceipt`. Un etat `working`, `observing` ou `blocked` est le dernier etat enregistre, pas une certification de progression actuelle : verifier `progressFresh`, `updated`, la raison de blocage et le briefing courant. `completed:true` requiert le statut `succeeded` et la postcondition adaptee :

- faction : `scope:faction-reputation-threshold` et `currentRep >= targetRep` ;
- politique automatique : `scope:automatic-policy-restored`.

Un recu terminal est historique. Une ancienne progression intermediaire peut rester visible avec `progressFresh:false` ; aucun chiffre n'est extrapole. Un PID lance ne prouve toujours pas l'acceptation de la commande. Un nouveau reset invalide les demandes de cette session.

`objectiveAdmission` explique l'absence d'option : preuves perimees, faction non observee, palier insuffisant, progression indisponible, objectif d'un ancien reset ou journal invalide/plein. Ces restrictions n'empechent pas d'obtenir les options de controle encore disponibles.

## Validation

- `npm run test:bridge` : regressions HTTP et tickets, objectifs, postconditions, revalidation d'un seuil change, faction absente, journal invalide, reset et expiration.
- `node tests/native/operator.cjs` : moteur officiel 3.0.1 isole, requetes HTTP vers le vrai gateway, file native, vrai agent et vrais scripts d'objectif/travail. La reputation est placee un point sous le seuil apres verification du travail ; le dernier increment et le recu sont natifs. Un second objectif est annule par la politique automatique ; les rejeux ne relancent pas les commandes.
- Preuve native : `evidence/operator/native.json`, avec empreintes des sources executees. L'adaptateur de fichiers du banc remplace le transport WebSocket ; BN4, RAM, faction, XP et reputation initiale sont synthetiques. Ce test n'utilise pas la sauvegarde Steam ou un GPT reel.

La preuve live de cette livraison verifie le bridge reconnecte, la correspondance des faits et les refus sans mutation. Les objectifs longs de la partie du joueur ne sont pas remplaces pour un test. Le GPT reel, le transport externe, les objectifs arbitraires, le catalogue complet et la campagne restent ouverts ; `rpReady` reste false.

## Versions recuperables sur GitHub

| Tag | Contenu |
|---|---|
| `matrix-v1.11.0-rp.7.2` | Runtime installe et valide, SHA 144433e3bf323176a44ee4e60a8133a5842ec664 |
| `bridge-v1.2.0` | Premiere interface operateur pause/reprise, SHA cc4b2e7f533a97f1fe530e6ecd2459f944c1882e |
| `bridge-v1.3.0` | Objectifs de faction, restauration automatique, preuves et documentation de cette livraison |

La branche de travail est `fix/rp-runtime-recovery`. Les tags designent des instantanes distincts ; le numero du bridge n'est pas le numero du runtime. Pour un retour du bridge a 1.2, restaurer ses fichiers depuis ce tag et redemarrer le seul processus bridge, en conservant la cle locale et les journaux du jeu. Ne jamais restaurer une ancienne file de commandes dans une partie active.
