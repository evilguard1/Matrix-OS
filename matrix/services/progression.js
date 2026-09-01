import { config, event, plannedNextBitNode, writeState } from "/matrix/lib/common.js";

const WORLD_DAEMON = "w0r1d_d43m0n";

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
            const ready = ns.hasRootAccess(WORLD_DAEMON) && ns.getHackingLevel() >= requiredLevel;
            await writeState(ns, "progression", {
                status: ready ? "ready" : "planning",
                currentNode: reset.currentNode,
                nextNode,
                worldDaemonRooted: ns.hasRootAccess(WORLD_DAEMON),
                hackingLevel: ns.getHackingLevel(),
                requiredHackingLevel: requiredLevel,
                autoDestroy: cfg.progression?.autoDestroyWorldDaemon === true,
            });

            if (ready && cfg.progression?.autoDestroyWorldDaemon === true) {
                await event(ns, "progression", `Entering BitNode ${nextNode}`, "success");
                ns.singularity.destroyW0r1dD43m0n(nextNode, "/matrix/kernel.js");
                return;
            }
        } catch (error) {
            await writeState(ns, "progression", { status: "error", error: String(error) });
        }
        await ns.sleep(15000);
    }
}
