/**
 * Stanek's Gift - charging the fragments MATRIX was never using.
 *
 * The Gift (SF13, or BitNode 13) is a grid of fragments that grant permanent
 * multipliers, but only while they are charged. Charging is the whole job: a
 * placed fragment with no charge does nothing at all, and charge decays in
 * value as it grows, so the correct policy is to keep every fragment topped up
 * evenly rather than pouring everything into one.
 *
 * charge() scales with the number of threads running it, so this dispatches the
 * work to a worker rather than charging from home at one thread.
 */
import { config, writeState, event, hasSF } from "/matrix/lib/common.js";
import { scanAll } from "/matrix/lib/network.js";
import { weakestFragment, chargeHosts } from "/matrix/lib/gift.js";

const CHARGER = "/matrix/workers/stanek-charge.js";
const IDLE = 5000;

export async function main(ns) {
    ns.disableLog("ALL");
    const reset = ns.getResetInfo();
    if (!hasSF(reset, 13)) {
        await writeState(ns, "stanek", { status: "locked", reason: "needs Source-File 13" });
        return;
    }

    // Accepting the Gift is irreversible within a BitNode and costs augmentation
    // slots, so it is only taken when the player has left it enabled.
    try {
        if (!ns.stanek.activeFragments().length) {
            const cfg = config(ns);
            if (cfg.automation?.stanek === false) {
                await writeState(ns, "stanek", { status: "paused", reason: "gift not accepted" });
                return;
            }
        }
    } catch (error) {
        await writeState(ns, "stanek", { status: "unavailable", error: String(error) });
        return;
    }

    while (true) {
        try {
            const cfg = config(ns);
            if (cfg.masterEnabled === false || cfg.automation?.stanek === false) {
                await writeState(ns, "stanek", { status: "paused" });
                await ns.sleep(IDLE);
                continue;
            }

            const fragments = ns.stanek.activeFragments();
            if (!fragments.length) {
                // Placement is a layout problem the player may want to own, and
                // a bad automatic layout is worse than none.
                await writeState(ns, "stanek", {
                    status: "idle", fragments: 0,
                    reason: "no fragments placed - arrange the Gift in the Stanek tab and MATRIX will keep them charged",
                });
                await ns.sleep(IDLE);
                continue;
            }

            const weakest = weakestFragment(fragments);
            const ram = ns.getScriptRam(CHARGER, "home");
            const { hosts } = scanAll(ns);
            const free = hosts
                .filter(h => ns.hasRootAccess(h))
                .map(h => ({
                    host: h,
                    free: ns.getServerMaxRam(h) - ns.getServerUsedRam(h)
                        - (h === "home" ? (cfg.hacking?.homeReserveGb ?? 24) : 0),
                }));

            let dispatched = 0;
            for (const { host, threads } of chargeHosts(free, ram)) {
                if (dispatched > 0) break;
                if (host !== "home" && !ns.fileExists(CHARGER, host)) {
                    try { await ns.scp(CHARGER, host, "home"); } catch { continue; }
                }
                if (ns.exec(CHARGER, host, threads, weakest.x, weakest.y, Date.now())) dispatched = threads;
            }

            const charges = fragments.map(f => Number(f.numCharge ?? 0));
            await writeState(ns, "stanek", {
                status: "online",
                fragments: fragments.length,
                charging: `${weakest.x},${weakest.y}`,
                threads: dispatched,
                lowestCharge: Math.min(...charges),
                highestCharge: Math.max(...charges),
            });
            if (!dispatched) await event(ns, "stanek", "No free RAM for a charge pass", "warn");
            await ns.sleep(IDLE);
        } catch (error) {
            await writeState(ns, "stanek", { status: "error", error: String(error) });
            await ns.sleep(IDLE);
        }
    }
}
