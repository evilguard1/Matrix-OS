import { config, writeState, event } from "/matrix/lib/common.js";
import { scanAll } from "/matrix/lib/network.js";
import { dispatchContracts } from "/matrix/lib/dispatch.js";

export async function main(ns) {
    ns.disableLog("ALL");
    const dispatched = new Set();

    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.contracts === false) {
            await writeState(ns, "contracts", { status: "paused" });
            await ns.sleep(20000);
            continue;
        }
        try {
            const { hosts } = scanAll(ns);
            const result = dispatchContracts(ns, hosts, dispatched);
            if (result.sent) await event(ns, "contracts", `Dispatched ${result.sent} contract solver(s)`, "success");
            await writeState(ns, "contracts", {
                status: "online", found: result.found, dispatched: result.sent,
                pending: dispatched.size, waitingForRam: result.waiting, solverRam: result.need,
            });
        } catch (e) {
            await writeState(ns, "contracts", { status: "error", error: String(e) });
        }
        await ns.sleep(30000);
    }
}
