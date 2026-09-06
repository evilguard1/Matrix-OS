import { resetEpoch } from "./state.js";

export const BRIEFING_TTL = 15000;
const normal = name => String(name).replace(/^\/+/, "");
const finite = x => Number.isFinite(x) && x >= 0;
const text = value => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 240) : null;
const STAGES = ["matrix/bootstrap.js", "matrix/early.js", "matrix/early-progression.js", "matrix/start.js"];

export function evidence(value, reset, now, ttl=30000) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "missing";
    if (!finite(value.updated) || value.updated > now) return "invalid-time";
    const epoch=resetEpoch(reset);
    if (!epoch || value.updated < Math.max(reset.lastAugReset, reset.lastNodeReset)) return "previous-reset";
    if (value.schemaVersion != null && (value.schemaVersion !== 1 || value.resetEpoch !== epoch)) return "wrong-epoch";
    return now-value.updated > ttl ? "stale" : "recent";
}

function metric(name,current,required,source) {
    if (!text(name) || !finite(current) || !Number.isFinite(required) || required<=0) return null;
    return {name:text(name),current,required,percent:Math.min(100,current/required*100),scope:"local-milestone",source};
}

// This builds observations, never action authorization or an invented node score.
export function buildBriefing(input) {
    const {now,reset,home,processes,states,files,control,controlError,configuration,configurationError,manifestValid}=input;
    if (!Number.isFinite(now) || !resetEpoch(reset) || !finite(home.maxRam) || !finite(home.usedRam) || !finite(home.cash))
        throw new Error("invalid-live-observation");
    const alive=file=>processes.filter(p=>p.host==="home" && normal(p.file)===file);
    const stagePids=processes.filter(p=>p.host==="home" && STAGES.includes(normal(p.file)));
    const expected=home.maxRam<16?"bootstrap":home.maxRam<64?"early":"full";
    const stage=stagePids.length!==1 ? null : normal(stagePids[0].file)==="matrix/bootstrap.js"?"bootstrap":normal(stagePids[0].file)==="matrix/start.js"?"full":"early";
    const sources=Object.fromEntries(Object.entries(states).map(([key,value])=>[key,{quality:evidence(value,reset,now),updated:finite(value?.updated)?value.updated:null}]));
    const desired=controlError?"unknown":control.desired;
    const admissionsClosed=Boolean(controlError || configurationError || desired==="paused" || configuration.masterEnabled===false);
    const latest=control?.receipts?.at(-1), observed=states.control;
    const receipt=latest?.action==="pause" && latest.status==="succeeded" ? latest : null;
    const pausedProof=desired==="paused" && !control.active && receipt && observed?.status==="paused" &&
        sources.control.quality==="recent" && alive("matrix/control-engine.js").length===1 &&
        observed.player?.id===receipt.id && ["idle","stopped","manual-preserved","locked"].includes(observed.player.status) &&
        manifestValid && input.remainingManaged===0;
    const status=controlError||configurationError?"blocked":pausedProof?"paused":desired==="paused"?"pausing":
        configuration.masterEnabled===false?"disabled":stagePids.length>1?"conflict":stage===expected?"running":"offline-or-transitioning";
    let objective=null;
    if (!admissionsClosed && stage===expected && stage==="early" && sources.early.quality==="recent" && states.early.status==="active" && states.early.homeRam===home.maxRam) {
        const early=states.early;
        objective={id:"EARLY_HOME_RAM",title:`Passer home de ${home.maxRam} à ${home.maxRam*2} Go`,source:"early",updated:early.updated,
            metric:finite(early.reserve)?metric("Épargne disponible pour la prochaine amélioration RAM",Math.max(0,home.cash-early.reserve),early.homeCost,"early+live-cash"):null};
    } else if (!admissionsClosed && stage===expected && stage==="full" && sources.coordinator.quality==="recent" &&
        states.coordinator.schemaVersion===1 && states.coordinator.status==="online" && alive("matrix/services/coordinator.js").length===1) {
        const c=states.coordinator;
        if(text(c.objective) && text(c.title))objective={id:text(c.objective),title:text(c.title),source:"coordinator",updated:c.updated,
            metric:metric(c.milestone?.name,c.milestone?.current,c.milestone?.required,"coordinator")};
    }
    const sf4=reset.currentNode===4 || reset.sourceFiles.some(([n,l])=>n===4 && l>0);
    const specs=[
        {id:"economy",file:stage==="bootstrap"?"matrix/bootstrap.js":stage==="early"?stagePids[0]?.file:"matrix/services/hacking.js",source:stage==="bootstrap"?"bootstrap":stage==="early"?"early":"hacking"},
        {id:"progression",file:home.maxRam<64?"matrix/early-progression.js":"matrix/services/singularity.js",source:home.maxRam<64?"early":"singularity",sf4:true,minRam:16},
        {id:"backdoors",file:"matrix/workers/singularity/backdoors.js",source:"backdoors",sf4:true,minRam:64,dispatcher:"matrix/services/singularity.js"},
        {id:"dashboard",file:"matrix/dashboard.jsx",source:"dashboard",minRam:64,keep:true},
    ];
    const capabilities=specs.map(spec=>{
        const path=normal(spec.file??""),cost=files[path]?.ram??null,pids=alive(spec.dispatcher??path).map(p=>p.pid);
        const disabled=configuration.automation?.[spec.id==="economy"?"hacking":spec.id==="progression"?"singularity":spec.id]===false ||
            (spec.id==="backdoors" && configuration.progression?.autoBackdoors===false) ||
            (spec.id==="progression" && home.maxRam<64 && configuration.earlyAutomation?.enabled===false);
        const quality=sources[spec.source]?.quality??"missing", reported=states[spec.source]?.status??states[spec.source]?.phase??null;
        const state=spec.sf4&&!sf4?"locked":home.maxRam<(spec.minRam??8)?"needs-home-ram":!files[path]?.installed||!(cost>0)?"not-installed":
            (admissionsClosed&&!spec.keep)||disabled?"paused":!pids.length?"not-running":quality!=="recent"?"unverified":
            ["error","failed","blocked","ram-blocked","missing-receipt","launch-failed"].includes(reported)?"blocked":
            ["paused","locked"].includes(reported)?reported:"observed";
        return {id:spec.id,state,file:path,ram:cost,pids,evidence:quality,reportedStatus:text(reported),healthCertified:false};
    });
    const freeAfterExit=Math.max(0,home.maxRam-home.usedRam+(input.selfRam??0));
    const commandCost=files["matrix/control.js"]?.ram;
    const stageAvailable=stagePids.length>0 || alive("matrix/control-engine.js").length>0;
    const requestFits=files["matrix/control.js"]?.installed && commandCost>0 && freeAfterExit>=commandCost;
    const options=[];
    if(!controlError && requestFits && stageAvailable && control.receipts.length<1022) {
        if(!control.active && desired==="running")options.push({id:"pause",command:"run /matrix/control.js pause",effect:"Demander le drainage des scripts et du travail de faction attribué."});
        if(desired==="paused" && (!control.active || control.active.action==="pause"))options.push({id:"resume",command:"run /matrix/control.js resume",effect:"Demander la reprise du palier, selon les préférences enregistrées."});
    }
    const blockers=[];
    if(controlError)blockers.push("Journal de contrôle invalide : commandes suspendues.");
    if(configurationError)blockers.push("Configuration illisible : état des préférences inconnu.");
    if(!manifestValid)blockers.push("Manifeste installé absent ou invalide : propriété des processus non vérifiée.");
    if(!stageAvailable)blockers.push("Aucun propriétaire actif : démarrage ou récupération nécessaire.");
    if(stagePids.length>1)blockers.push("Plusieurs propriétaires de palier sont actifs.");
    if(!objective)blockers.push("Aucun objectif local frais et attribuable au palier actif.");
    if(control?.receipts?.length>=1022)blockers.push("Journal de commandes plein : nouvelles demandes refusées.");
    return {schemaVersion:1,resetEpoch:resetEpoch(reset),updated:now,expiresAt:now+BRIEFING_TTL,status,
        scope:"operational-observation",rpReady:false,nodeProgress:null,node:reset.currentNode,home,
        stage:{expected,observed:stage,pids:stagePids.map(p=>p.pid)},objective,capabilities,sources,blockers,options,
        control:{desired,active:control?.active??null,pauseConfirmed:Boolean(pausedProof),scope:"managed-scripts-and-owned-faction-work"},
        limitations:["Aucun pourcentage global du node n'est défini.","Observations récentes et PID vivant ne certifient pas une progression réussie.","Options locales à revalider lors de l'exécution ; aucune connexion GPT active.","Les affectations persistantes avancées restent hors de la portée de la pause."]};
}

export function renderBriefing(report) {
    const lines=[`MATRIX // RAPPORT BN${report.node} // ${report.status}`,`Home : ${report.home.maxRam} Go, ${report.home.usedRam.toFixed(2)} Go utilisés, ${Math.round(report.home.cash).toLocaleString("fr-CA")} $.`];
    if(report.objective) {
        lines.push(`Objectif local : ${report.objective.title}.`);
        if(report.objective.metric)lines.push(`Indicateur « ${report.objective.metric.name} » : ${report.objective.metric.percent.toFixed(1)} % (mesure locale, pas progression du node).`);
    }
    for(const cap of report.capabilities)lines.push(`${cap.id} : ${cap.state}${cap.reportedStatus?` (${cap.reportedStatus})`:""}.`);
    for(const blocker of report.blockers)lines.push(`À vérifier : ${blocker}`);
    for(const option of report.options)lines.push(`Option ${option.id} : ${option.command} — ${option.effect}`);
    lines.push("Rapport valable 15 secondes. Aucun pourcentage global du node disponible.");
    return lines.join("\n");
}
