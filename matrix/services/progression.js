import { config, event, plannedNextBitNode, writeState, readJson } from "/matrix/lib/common.js";
import { resetEpoch, freshState } from "/matrix/lib/state.js";
import { terminalLease } from "/matrix/lib/terminal-lease.js";
import { objectivePending } from "/matrix/lib/objective-state.js";

const WORLD_DAEMON = "w0r1d_d43m0n";

export function daemonReady(reset, state, rooted, level, required, now = Date.now()) {
    return Boolean(state?.schemaVersion === 1 && freshState(state, {epoch:resetEpoch(reset),now}) &&
        state.hasRedPill === true && rooted && Number.isFinite(required) && required > 0 && level >= required);
}

export async function main(ns) {
    ns.disableLog("ALL");
    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.progression === false) {
            await writeState(ns, "progression", { status: "paused" });
            await ns.sleep(5000);
            continue;
        }

        try {
            const reset = ns.getResetInfo();
            const nextNode = plannedNextBitNode(reset, cfg.progression?.bitNodePlan);
            const requiredLevel = ns.getServerRequiredHackingLevel(WORLD_DAEMON);
            const ready = daemonReady(reset, readJson(ns,"/matrix/state/singularity.txt",null),
                ns.hasRootAccess(WORLD_DAEMON), ns.getHackingLevel(), requiredLevel);
            const objectiveBlocked=objectivePending(ns);
            await writeState(ns, "progression", {
                status: objectiveBlocked ? "objective-active" : ready ? "ready" : "planning",
                objectiveBlocked,
                currentNode: reset.currentNode,
                nextNode,
                worldDaemonRooted: ns.hasRootAccess(WORLD_DAEMON),
                hackingLevel: ns.getHackingLevel(),
                requiredHackingLevel: requiredLevel,
                autoDestroy: cfg.progression?.autoDestroyWorldDaemon === true,
            });

            if (ready && cfg.progression?.autoDestroyWorldDaemon === true && !objectiveBlocked && !terminalLease(ns)) {
                await event(ns, "progression", `Entering BitNode ${nextNode}`, "success");
                if (terminalLease(ns) || objectivePending(ns) || config(ns).masterEnabled === false) continue;
                ns.singularity.destroyW0r1dD43m0n(nextNode, "/matrix/kernel.js");
                return;
            }
        } catch (error) {
            await writeState(ns, "progression", { status: "error", error: String(error) });
        }
        await ns.sleep(15000);
    }
}
