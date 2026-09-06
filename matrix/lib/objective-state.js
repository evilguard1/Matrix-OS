import { resetEpoch } from "./state.js";
const PATH="/matrix/state/objective-journal.txt";
const validId=id=>typeof id==="string" && /^[A-Za-z0-9_.:-]{1,96}$/.test(id);
const validRep=rep=>Number.isFinite(rep) && rep>0 && rep<=1e12;
const validEpoch=epoch=>typeof epoch==="string" && /^\d+:\d+:\d+$/.test(epoch);
const statuses=new Set(["accepted","starting","working","observing","blocked","succeeded","cancelled","reset-interrupted"]);

export function readObjective(ns) {
    const raw=ns.read(PATH);if(!raw)return {schemaVersion:1,revision:0,active:null,receipts:[]};
    const s=JSON.parse(raw);
    if(s?.schemaVersion!==1 || !Number.isSafeInteger(s.revision) || s.revision<0 || !Array.isArray(s.receipts) || s.receipts.length>1024 ||
        new Set(s.receipts.map(r=>r?.id)).size!==s.receipts.length || s.receipts.some(r=>!validId(r?.id)||!["faction","auto"].includes(r.action)||!statuses.has(r.status)||!validEpoch(r.resetEpoch)||
            (r.action==="faction" && (typeof r.faction!=="string" || !r.faction.length || !validRep(r.targetRep))) ||
            (r.action==="auto" && (r.faction!==null || r.targetRep!==null))) ||
        (s.active!==null && (!s.active || typeof s.active!=="object" || Array.isArray(s.active))) ||
        (s.active && (!validId(s.active.id)||!validRep(s.active.targetRep)||typeof s.active.faction!=="string" || typeof s.active.resetEpoch!=="string" ||
            !validEpoch(s.active.resetEpoch) || !statuses.has(s.active.status)||!s.receipts.some(r=>r.id===s.active.id && r.action==="faction" && r.faction===s.active.faction && r.targetRep===s.active.targetRep && r.status===s.active.status && r.resetEpoch===s.active.resetEpoch))))
        throw new Error("invalid-objective-journal");
    return s;
}
function write(ns,s) {
    if(s.revision>=Number.MAX_SAFE_INTEGER)throw new Error("objective-revision-exhausted");
    const raw=JSON.stringify({...s,revision:s.revision+1,updated:Date.now()});
    const result=ns.write(PATH,raw,"w");if(result?.then || ns.read(PATH)!==raw)throw new Error("objective-write-failed");
}
export function objectivePending(ns) {
    // Unknown control state must not permit an automatic augmentation reset.
    try{return Boolean(readObjective(ns).active);}catch{return true;}
}
export function submitObjective(ns,{action,id,faction=null,targetRep=null},now=Date.now()) {
    if(!validId(id)||!["faction","auto"].includes(action)||!Number.isFinite(now)||now<0||now>Date.now()+1000 ||
        (action==="faction" && (typeof faction!=="string" || !faction.length || faction.length>100 || !validRep(targetRep))) ||
        (action==="auto" && (faction!==null || targetRep!==null)))throw new Error("invalid-objective-command");
    const s=readObjective(ns),epoch=resetEpoch(ns.getResetInfo());if(!epoch)throw new Error("unknown-reset");
    const prior=s.receipts.find(r=>r.id===id);
    if(prior){
        if(prior.action!==action || prior.faction!==faction || prior.targetRep!==targetRep)throw new Error("objective-id-conflict");
        return {...prior,replay:true};
    }
    if(s.receipts.length>=(action==="faction"?1023:1024))throw new Error("objective-retention-full");
    if(action==="faction") {
        if(s.active)throw new Error("objective-busy-use-auto-first");
        if(!ns.getPlayer().factions.includes(faction))throw new Error("faction-not-joined");
    }
    const receipt={id,action,faction,targetRep,resetEpoch:epoch,requestedAt:now,status:action==="auto"?"succeeded":"accepted"};
    if(action==="auto") {
        if(s.active) {
            const old=s.receipts.find(r=>r.id===s.active.id);Object.assign(old,{status:"cancelled",finishedAt:now,reason:"automatic-policy-restored"});
        }
        s.active=null;receipt.scope="automatic-policy-restored";
    } else s.active={...receipt,type:"faction-reputation",updated:now,currentRep:null,reason:null};
    s.receipts.push(receipt);write(ns,s);return receipt;
}
export function updateObjective(ns,id,patch) {
    const s=readObjective(ns);if(s.active?.id!==id)return false;
    if(!statuses.has(patch.status))throw new Error("invalid-objective-status");
    const next={...s.active,status:patch.status,reason:patch.reason??null,updated:Date.now(),currentRep:patch.currentRep??s.active.currentRep};
    if(next.currentRep!==null && (!Number.isFinite(next.currentRep)||next.currentRep<0))throw new Error("invalid-reputation-observation");
    const epoch=resetEpoch(ns.getResetInfo());
    if(epoch!==s.active.resetEpoch && patch.status!=="reset-interrupted")throw new Error("objective-reset-changed");
    if(patch.status==="succeeded" && !(next.currentRep>=next.targetRep))throw new Error("objective-postcondition-missing");
    const receipt=s.receipts.find(r=>r.id===id);
    Object.assign(receipt,{status:next.status,updated:next.updated,currentRep:next.currentRep,reason:next.reason});
    if(["succeeded","reset-interrupted"].includes(next.status)) {
        receipt.finishedAt=next.updated;receipt.scope="faction-reputation-threshold";s.active=null;
    }else s.active=next;
    write(ns,s);return true;
}
