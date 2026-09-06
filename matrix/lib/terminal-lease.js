import { resetEpoch } from "./state.js";

const FILE = "/matrix/state/terminal-lease.txt";
const normal = value => String(value).replace(/^\/+/, "");
function write(ns, value) {
    const text = JSON.stringify(value);
    const result = ns.write(FILE, text, "w");
    if (result?.then || ns.read(FILE) !== text) throw new Error("terminal-lease-write-failed");
}
export function terminalLease(ns, now = Date.now()) {
    const raw = ns.read(FILE);
    if (!raw) return null;
    let lease;
    try { lease = JSON.parse(raw); } catch { throw new Error("corrupt-terminal-lease"); }
    if (lease?.schemaVersion !== 1 || typeof lease.resetEpoch !== "string" ||
        !Number.isSafeInteger(lease.pid) || lease.pid <= 0 || typeof lease.script !== "string" ||
        typeof lease.token !== "string" || !Number.isFinite(lease.expires) || typeof lease.target !== "string" ||
        (lease.childPid !== undefined && (!Number.isSafeInteger(lease.childPid) || lease.childPid <= 0)))
        throw new Error("invalid-terminal-lease");
    if (lease.resetEpoch !== resetEpoch(ns.getResetInfo()) || lease.released === true) return null;
    // A delayed native operation retains ownership while its exact PID is alive,
    // even when its estimated duration has passed. Never steal from that worker.
    const alive = ns.ps("home").some(p => (p.pid === lease.pid && normal(p.filename) === normal(lease.script)) ||
        (p.pid === lease.childPid && normal(p.filename) === "matrix/workers/backdoor-install.js"));
    return alive || now < lease.expires ? lease : null;
}
export function attachTerminalChild(ns, lease, childPid) {
    const current = terminalLease(ns);
    if (current?.token !== lease.token || !Number.isSafeInteger(childPid) || childPid <= 0) throw new Error("terminal-child-not-owned");
    write(ns, {...current, childPid});
}
export function markTerminalReturned(ns, lease) {
    const current = terminalLease(ns);
    if (current?.token !== lease.token) throw new Error("terminal-no-longer-owned");
    write(ns, {...current, returnedHome:true});
}
export function claimTerminal(ns, target, durationMs, now = Date.now()) {
    if (terminalLease(ns, now)) return null;
    const epoch = resetEpoch(ns.getResetInfo());
    if (!epoch || !Number.isFinite(durationMs) || durationMs < 0 || durationMs > 120000) return null;
    const lease = {schemaVersion:1, resetEpoch:epoch, pid:ns.pid, script:"matrix/workers/singularity/backdoors.js",
        token:`${epoch}:${ns.pid}:${now}`, target, expires:now + durationMs + 30000};
    write(ns, lease);
    return lease;
}
export function releaseTerminal(ns, lease) {
    let current; try { current = JSON.parse(ns.read(FILE)); } catch { return false; }
    if (!lease || current?.token !== lease.token || current?.resetEpoch !== resetEpoch(ns.getResetInfo())) return false;
    write(ns, {...current, released:true});
    return true;
}
