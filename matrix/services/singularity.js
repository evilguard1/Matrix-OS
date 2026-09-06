import { config, readJson, writeState } from "/matrix/lib/common.js";
import { resetEpoch } from "/matrix/lib/state.js";
import { holdSingleton } from "/matrix/lib/singleton.js";
import { SINGULARITY_TASKS, singularityWorker } from "/matrix/lib/progression-ram.js";

const RECEIPT = "/matrix/state/singularity-receipt.txt";
const normal = name => String(name).replace(/^\/+/, "");

export async function runCycle(ns, cycle) {
    for (const name of SINGULARITY_TASKS) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.singularity === false) return { status: "paused" };
        const file = singularityWorker(name);
        const childRam = name === "backdoors" ? ns.getScriptRam("/matrix/workers/backdoor-install.js", "home") : 0;
        const need = ns.getScriptRam(file, "home") + childRam;
        if (name === "backdoors" && !(childRam > 0)) return {status:"not-installed",task:"backdoor-install"};
        if (!(need > 0)) return { status: "not-installed", task: name };
        if (ns.ps("home").some(p => normal(p.filename).startsWith("matrix/workers/singularity/"))) return { status: "waiting-worker" };
        const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
        if (free < need + 1.6) return { status: "ram-blocked", task: name, need, free };
        const pid = ns.run(file, { threads: 1, preventDuplicates: true }, cycle);
        if (!pid) return { status: "launch-failed", task: name };
        while (ns.ps("home").some(p => p.pid === pid && normal(p.filename) === normal(file))) await ns.sleep(50);
        const result = readJson(ns, RECEIPT, null);
        if (result?.cycle !== cycle || result?.task !== name || result?.resetEpoch !== resetEpoch(ns.getResetInfo()))
            return { status: "missing-receipt", task: name, pid };
        if (result.status !== "done") return { status: result.status, task: name, error: result.error };
    }
    return { status: "online" };
}

export async function main(ns) {
    ns.disableLog("ALL");
    if (!holdSingleton(ns, "/matrix/services/singularity.js")) return;
    while (holdSingleton(ns, "/matrix/services/singularity.js")) {
        let result;
        const cycle = `${resetEpoch(ns.getResetInfo())}:${ns.pid}:${Date.now()}`;
        try { result = await runCycle(ns, cycle); }
        catch (error) { result = { status: "error", error: String(error) }; }
        await writeState(ns, "singularity-dispatch", { ...result, cycle });
        await ns.sleep(10000);
    }
}
