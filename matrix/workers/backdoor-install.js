import { resetEpoch } from "/matrix/lib/state.js";
import { config } from "/matrix/lib/common.js";

export async function main(ns) {
    const [target, token, epoch] = ns.args;
    const lease = JSON.parse(ns.read("/matrix/state/terminal-lease.txt") || "null");
    const cfg = config(ns);
    if (cfg.masterEnabled === false || cfg.automation?.singularity === false || cfg.progression?.autoBackdoors === false) return;
    if (!lease || lease.released === true || lease.token !== token || lease.childPid !== ns.pid || lease.target !== target ||
        resetEpoch(ns.getResetInfo()) !== epoch || lease.resetEpoch !== epoch ||
        !["CSEC","avmnite-02h","I.I.I.I","run4theh111z"].includes(target)) throw new Error("unowned-backdoor-child");
    const file = "/matrix/state/backdoor-install.txt";
    const publish = (status, error = null) => {
        const text = JSON.stringify({schemaVersion:1, resetEpoch:epoch, token, target, pid:ns.pid, updated:Date.now(), status, error});
        const result = ns.write(file, text, "w");
        if (result?.then || ns.read(file) !== text) throw new Error("backdoor-child-write-failed");
    };
    if (ns.singularity.getCurrentServer() !== target) throw new Error("backdoor-target-changed");
    publish("installing");
    try {
        await ns.singularity.installBackdoor();
        if (resetEpoch(ns.getResetInfo()) !== epoch || !ns.getServer(target).backdoorInstalled) throw new Error("backdoor-postcondition-failed");
        publish("succeeded");
    } catch (error) { publish("failed", String(error)); }
    finally {
        let current; try { current = JSON.parse(ns.read("/matrix/state/terminal-lease.txt")); } catch {}
        if (current?.token === token && current.returnedHome !== true && resetEpoch(ns.getResetInfo()) === epoch &&
            ns.singularity.getCurrentServer() === target) ns.singularity.connect("home");
    }
}
