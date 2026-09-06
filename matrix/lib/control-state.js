export const CONTROL_FILE = "/matrix/state/control-journal.txt";
export const CONTROL_PORT = 20;
export const PAUSE_SIGNAL = "MATRIX:PAUSED";
const ACTIONS = new Set(["pause", "resume"]);
const validId = id => typeof id==="string" && /^[A-Za-z0-9_.:-]{1,96}$/.test(id);

export function readControl(ns) {
    const raw = ns.read(CONTROL_FILE);
    if (!raw) return {schemaVersion:1, revision:0, desired:"running", active:null, receipts:[]};
    const state = JSON.parse(raw);
    if (state?.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 ||
        !["running","paused"].includes(state.desired) || !Array.isArray(state.receipts) || state.receipts.length > 1024 ||
        state.receipts.some(r=>!r || !validId(r.id) || !ACTIONS.has(r.action) || !["succeeded","cancelled","expired"].includes(r.status)) ||
        new Set(state.receipts.map(r=>r.id)).size!==state.receipts.length ||
        (state.active && (!validId(state.active.id) || state.receipts.some(r=>r.id===state.active.id) || !ACTIONS.has(state.active.action) ||
            !["queued","starting"].includes(state.active.phase) || !Number.isFinite(state.active.requestedAt) || state.active.requestedAt>Date.now()+1000)))
        throw new Error("invalid-control-journal");
    return state;
}
export function writeControl(ns, state) {
    if (state.revision >= Number.MAX_SAFE_INTEGER) throw new Error("control-revision-exhausted");
    const text = JSON.stringify({...state, revision:state.revision+1, updated:Date.now()});
    const result = ns.write(CONTROL_FILE, text, "w");
    if (result?.then || ns.read(CONTROL_FILE)!==text) throw new Error("control-write-failed");
}
export function controlPaused(ns) {
    try { return readControl(ns).desired === "paused"; } catch { return true; }
}
export function submitControl(ns, action, id, now=Date.now()) {
    if (!ACTIONS.has(action) || !validId(id) || !Number.isFinite(now) || now>Date.now()+1000) throw new Error("invalid-control-command");
    const state = readControl(ns);
    const prior = state.receipts.find(r=>r.id===id) ?? (state.active?.id===id ? state.active : null);
    if (prior) {
        if (prior.action!==action) throw new Error("control-id-conflict");
        return {...prior, replay:true};
    }
    if (state.receipts.length>=1022) throw new Error("control-retention-full");
    if (state.active) {
        if (action!=="resume" || state.active.action!=="pause") throw new Error("control-busy");
        state.receipts.push({...state.active,status:"cancelled",finishedAt:now});
    }
    state.desired="paused";
    state.active={id,action,requestedAt:now,status:"accepted",phase:"queued"};
    // One durable write both closes admission and registers the command.
    writeControl(ns,state);
    ns.clearPort(CONTROL_PORT);ns.writePort(CONTROL_PORT,PAUSE_SIGNAL);
    return state.active;
}
export function finishControl(ns, id, status, detail={}) {
    const state=readControl(ns);
    if(state.active?.id!==id)return false;
    state.receipts.push({...state.active,...detail,status,finishedAt:Date.now()});state.active=null;
    writeControl(ns,state);return true;
}
// Stages acknowledge only that their owner has started, not complete service health.
export function controlCheckpoint(ns, stage) {
    let state; try {state=readControl(ns);} catch {state={desired:"paused"};}
    if(state.desired==="paused") {
        ns.ui?.closeTail?.();ns.spawn("/matrix/control-engine.js",{threads:1,spawnDelay:0});return true;
    }
    if(stage && state.active?.action==="resume" && state.active.phase==="starting")
        finishControl(ns,state.active.id,"succeeded",{scope:"stage-started",stage,pid:ns.pid});
    return false;
}
