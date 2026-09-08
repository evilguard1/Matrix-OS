# Matrix GPT connector 0.1.0

Facade HTTP dediee au GPT, compatible avec le bridge 1.3.0 et le runtime rp.7.2. Quatre routes seulement : statut, briefing operateur, envoi d'un ticket et lecture d'un recu. Les fichiers, jobs arbitraires, serveurs et calculs RAM administratifs sont refuses meme avec une cle operateur valide. Le gateway historique conserve ses propres acces.

## Installation locale

Conserver ce dossier complet et le bridge existant. Node est la seule dependance du connecteur. Creer un fichier JSON prive hors du depot contenant `gatewayTokenFile` (chemin de `.matrix-cloud.env` existant), `operatorTokenFile` (nouveau fichier de cle distinct), `publicOrigin` (origine HTTPS de la facade) et `port:31338`.

Lancer `node tools/gpt-connector/start.mjs <chemin-absolu-du-json-prive>`. Le premier lancement cree la cle operateur ; les suivants la conservent. Ne pas utiliser la cle administrative dans le GPT. Sur Windows, conserver ces fichiers dans le profil prive de l'utilisateur ; le mode POSIX demande par Node ne remplace pas les ACL Windows.

Un acces HTTPS autorise devra aboutir a `http://127.0.0.1:31338`, pas au gateway administratif 31337. Le connecteur n'ecoute que sur loopback ; le chiffrement public doit etre termine par le tunnel ou reverse proxy choisi. Cette livraison n'ouvre aucun acces public. `publicOrigin:https://matrix.example.invalid` est un placeholder de preparation locale, pas un endpoint fonctionnel pour ChatGPT.

`GET /openapi.json` fournit le schema sans cle ni observation du jeu. Le schema utilise uniquement l'origine HTTPS configuree, jamais l'en-tete Host fourni par un visiteur. Avant import dans le GPT, renseigner l'origine publique effective et redemarrer le connecteur.

Le connecteur borne les requetes a 4096 octets, les reponses a 80000 octets, les appels autorises a 60/minute et un appel gateway a 20 secondes. Il ne suit aucune redirection et remplace les en-tetes entrants par la cle administrative uniquement vers l'origine locale fixe. Une erreur POST de transport reste ambigue : meme ticket obligatoire au rejeu.

Le fonctionnement depend des processus locaux. Cette version ne cree ni service Windows ni tache de demarrage automatique. Pour une utilisation reguliere, fournir une origine HTTPS stable ; une adresse temporaire changerait la configuration necessaire du GPT.

## Configuration du GPT personnalise

Dans le GPT voulu, ajouter une Action avec le schema de la facade, choisir l'authentification API Key/Bearer et saisir **la cle operateur** dans le champ d'authentification. Utiliser `GPT-INSTRUCTIONS.md` comme base des instructions, en preservant les elements personnels et en retirant les anciennes consignes demandant de modifier des scripts pour jouer. Garder le GPT prive pendant la validation. Ne jamais placer une cle dans les instructions, les connaissances, une URL ou Git.

Le POST est marque `x-openai-isConsequential:false` pour permettre le choix « toujours autoriser » des Actions pour ces operations de jeu. Cela ne vaut pas consentement a n'importe quel ordre : les instructions exigent un choix du joueur et une verification de l'action et des parametres. Les confirmations eventuelles de ChatGPT et les 15 secondes d'expiration peuvent imposer un nouveau briefing ; la verification du bridge n'est jamais contournee.

Tester d'abord le statut et le bilan. Verifier que le GPT distingue argent et reputation, cite le jalon local et ne pretend pas connaitre un pourcentage global du node. Tester ensuite un ordre choisi et suivre le recu jusqu'a sa portee finale. Aucune validation GPT ne decoule d'un simple test HTTP.

## Sources officielles consultees le 8 septembre 2026

L'editeur GPT prend en charge l'authentification par cle API : [authentification des Actions](https://developers.openai.com/api/docs/actions/authentication). Les Actions exigent HTTPS avec certificat public sur 443 ; les appels sont limites a 45 secondes et les charges utiles doivent rester sous 100000 caracteres. La page de production decrit aussi le drapeau de confirmation : [contraintes des Actions](https://developers.openai.com/api/docs/actions/production).

## Tests et version

`node tools/gpt-connector/test.mjs` teste de vrais serveurs HTTP isoles : distinction des cles, routes administratives interdites, remplacement des en-tetes, limites, validation des identifiants et preservation de l'etat queued. Les regressions et preuves natives du bridge 1.3 demeurent independantes. Le tag `gpt-connector-v0.1.0` identifie cette livraison ; il ne signifie pas que le GPT reel est valide.
