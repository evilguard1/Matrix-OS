# Profil GPT RP 1.0.0

L'agent existant BITBURNER AGENT a ete configure puis enregistre sous le nom **MATRIX — Ghost Node War**, avec acces prive. Identifiant conserve : `g-6a98ce2b8c048191b0cc8a69dc480eba`.

Configuration enregistree dans l'editeur ChatGPT le 8 septembre 2026 :

- Instructions : `INSTRUCTIONS.md` ; remplacement des hypotheses perimees BN1/Singularity et des consignes de developpement.
- Description : « Ton partenaire IA dans Bitburner : bilans verifies, objectifs pilotables et RP Ghost Node War, sans inventer la telemetrie. »
- Amorce : « Alors, quelles sont les nouvelles ? Fais-moi un bilan reel et propose les choix disponibles. »
- Connaissances ajoutees : `Bitburner_The_Ghost_Node_War_FINAL.md` fourni par le joueur. Les 16 references techniques preexistantes ont ete conservees et qualifiees d'historiques dans les instructions.
- Modele recommande et fonctions preexistantes conserves.
- Action existante : meme origine HTTPS et meme authentification, sans saisie ou rotation de cle. Schema limite aux quatre operations de `openapi.template.json`. Remplacer le placeholder par l'origine deja configuree avant restauration. Les confirmations des POST restent celles par defaut de ChatGPT.

## Connexion et verification

Le premier appel getMatrixStatus du GPT reel a retourne 502, signale correctement sans inventer de telemetrie. Le processus local du bridge 1.3 etait arrete : aucun listener sur 31337/12525. Son redemarrage a retabli la connexion de Bitburner et le heartbeat de l'agent.

Le second test, depuis le GPT reel enregistre, a obtenu un bilan BN4 : palier full/running, Home 1024 Go, financement local de Neuralstimulator et option de reputation The Black Hand. Le GPT a distingue le jalon local du pourcentage global inconnu et n'a soumis aucun ticket. Cela prouve le parcours de lecture ChatGPT -> Action existante -> bridge -> jeu. La postcondition d'un ordre mutateur depuis le GPT reste a valider ; G8 n'est pas declare passe.

Ce raccordement reutilise une integration deja presente dans le compte. Il n'installe pas la facade GPT connector 0.1 et ne cree pas de nouveau tunnel. Restreindre les operations declarees dans le schema du GPT **n'isole pas** les permissions de la cle administrative existante ; la facade avec cle distincte reste une etape separee.

La fermeture du processus bridge rendra de nouveau les Actions indisponibles. Le demarrage automatique et la stabilite d'une adresse HTTPS permanente restent ouverts. Aucun nouveau service Windows n'a ete cree.

## Limites RP

Le role, la voix, le canon, la discipline des revelations et le pilotage des quatre adaptateurs sont configures. Ce profil ne cree ni moteur persistant de campagne ni catalogue strategique general. Les evenements du lore ne deviennent pas des preuves du jeu. Le test de lecture ne certifie ni 100 dialogues ni un parcours complet BN4.

Tag de restauration : `gpt-profile-v1.0.0`. Aucune cle d'Action ni URL de conversation privee n'est incluse.
