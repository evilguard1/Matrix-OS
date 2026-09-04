import { readJson, writeJson, writeState } from "/matrix/lib/common.js";
import {
    DARKNET_KNOWLEDGE_STATE,
    DARKNET_NAVIGATOR,
    DARKNET_PORT,
    DARKNET_WORKER,
    hasDarknetAccess,
    mergeDarknetMessage,
    parseWorkerMessage,
} from "/matrix/lib/darknet.js";

const SEED_INTERVAL_MS = 120_000;
const LOOP_MS = 2_000;
const MAX_DEPTH = 5;

function sameScript(a, b) {
    return String(a ?? "").replace(/^\/+/, "") === String(b ?? "").replace(/^\/+/, "");
}

function homeWorkerRunning(ns) {
    try {
        return ns.ps("home").some(proc => sameScript(proc.filename, DARKNET_WORKER));
    } catch {
        return false;
    }
}

function drainMessages(ns, knowledge) {
    let state = knowledge;
    let drained = 0;
    while (drained < 250) {
        const raw = ns.readPort(DARKNET_PORT);
        if (raw === "NULL PORT DATA") break;
        drained += 1;
        const message = parseWorkerMessage(raw);
        if (message) state = mergeDarknetMessage(state, message);
    }
    return { state, drained };
}

function nodeStats(knowledge) {
    const nodes = Object.values(knowledge?.nodes ?? {});
    return {
        discovered: nodes.length,
        authenticated: nodes.filter(node => node?.authenticated).length,
        solverNeeded: nodes.filter(node => node?.type === "solver-needed" || node?.type === "auth-pending").length,
        maxDepthSeen: nodes.reduce((max, node) => Math.max(max, Number(node?.depth ?? -1)), -1),
        blockedRam: nodes.reduce((sum, node) => sum + Math.max(0, Number(node?.blockedRam ?? 0)), 0),
    };
}

async function seed(ns) {
    const pid = ns.run(
        DARKNET_WORKER,
        1,
        "--depth", -1,
        "--max-depth", MAX_DEPTH,
        "--lineage", JSON.stringify(["home"]),
    );
    return pid || 0;
}

export async function main(ns) {
    ns.disableLog("ALL");
    let knowledge = readJson(ns, DARKNET_KNOWLEDGE_STATE, {
        nodes: {},
        events: [],
        cacheOpened: 0,
        authenticated: 0,
        updated: Date.now(),
    });
    let lastSeedAt = 0;
    let lastSeedPid = 0;
    let lastError = null;

    while (true) {
        const now = Date.now();
        const unlocked = hasDarknetAccess(ns);
        const { state, drained } = drainMessages(ns, knowledge);
        knowledge = state;

        if (drained > 0) {
            try { await writeJson(ns, DARKNET_KNOWLEDGE_STATE, knowledge); } catch {}
        }

        if (!unlocked) {
            await writeState(ns, "darknet", {
                status: "locked",
                navigator: DARKNET_NAVIGATOR,
                discovered: Object.keys(knowledge?.nodes ?? {}).length,
                activeSeedPid: 0,
                lastSeedAt,
                error: null,
            });
            await ns.sleep(15_000);
            continue;
        }

        if (!ns.fileExists(DARKNET_WORKER, "home")) {
            await writeState(ns, "darknet", {
                status: "not-installed",
                navigator: DARKNET_NAVIGATOR,
                discovered: Object.keys(knowledge?.nodes ?? {}).length,
                activeSeedPid: 0,
                lastSeedAt,
                error: "worker-missing",
            });
            await ns.sleep(15_000);
            continue;
        }

        const running = homeWorkerRunning(ns);
        if (!running && now - lastSeedAt >= SEED_INTERVAL_MS) {
            try {
                lastSeedPid = await seed(ns);
                lastSeedAt = now;
                lastError = lastSeedPid ? null : "seed-launch-failed";
            } catch (error) {
                lastSeedPid = 0;
                lastSeedAt = now;
                lastError = String(error);
            }
        }

        const stats = nodeStats(knowledge);
        await writeState(ns, "darknet", {
            status: "online",
            navigator: DARKNET_NAVIGATOR,
            port: DARKNET_PORT,
            maxDepth: MAX_DEPTH,
            ...stats,
            cacheOpened: Number(knowledge?.cacheOpened ?? 0),
            activeSeedPid: homeWorkerRunning(ns) ? lastSeedPid : 0,
            lastSeedAt,
            lastKnowledgeUpdate: Number(knowledge?.updated ?? 0),
            messagesDrained: drained,
            error: lastError,
            safety: {
                usesFreezeServer: false,
                usesStormSeed: false,
                usesDarknetRamForHWGW: false,
                usesStasisLinks: false,
                usesMemoryReallocation: false,
            },
        });

        await ns.sleep(LOOP_MS);
    }
}
