import { config, writeState, event } from "/matrix/lib/common.js";
import { scanAll } from "/matrix/lib/network.js";
import { solvers } from "/matrix/lib/solvers.js";

export async function main(ns) {
    ns.disableLog("ALL");
    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.contracts === false) {
            await writeState(ns, "contracts", { status: "paused" });
            await ns.sleep(10000);
            continue;
        }
        let solved = 0, skipped = 0, found = 0, failed = 0;
        try {
            const { hosts } = scanAll(ns);
            for (const host of hosts) {
                for (const file of ns.ls(host, ".cct")) {
                    found++;
                    const type = ns.codingcontract.getContractType(file, host);
                    const solver = solvers[type];
                    // A contract has limited attempts. An unknown type, or a solver
                    // that throws, must never consume one.
                    if (!solver) { skipped++; continue; }
                    let answer;
                    try { answer = solver(ns.codingcontract.getData(file, host)); }
                    catch { skipped++; continue; }
                    if (answer === undefined || answer === null) { skipped++; continue; }
                    const reward = ns.codingcontract.attempt(answer, file, host);
                    if (reward) { solved++; await event(ns, "contracts", `${type}: ${reward}`, "success"); }
                    else { failed++; await event(ns, "contracts", `FAILED ${type} on ${host}`, "warn"); }
                }
            }
            await writeState(ns, "contracts", {
                status: "online", found, solved, skipped, failed,
                solverCount: Object.keys(solvers).length,
            });
        } catch (e) {
            await writeState(ns, "contracts", { status: "error", error: String(e) });
        }
        await ns.sleep(60000);
    }
}
