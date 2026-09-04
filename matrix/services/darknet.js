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

const DEFAULT_SEED_INTERVAL_MS = 120_000;
const LOOP_MS = 2_000;
const DEFAULT_MAX_DEPTH = 5;
// The current worker historically parsed numeric depth 0 through `value || -1`,
// which resets that legitimate first-hop value and can make a bounded walk
// effectively unbounded. The controller therefore uses a strictly-positive
// internal depth domain. Home starts at 1; Darknet server depth -1 maps to 2;
// game depth 0 maps to 3, so logical depth N maps to N+3. Worker maxDepth is
// capped at 12, therefore the public controller depth is conservatively capped
// at 9 until the worker parser itself is replaced.
const WORKER_DEPTH_OFFSET = 3;
const WORKER_SEED_DEPTH = 1;
const MAX_LOGICAL_DEPTH = 9;

function option(args, name, fallback) {
    const index = args.indexOf(name);
    return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
}

function boundedNumber(value, fallback, min, max) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

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

async function seed(ns, maxDepth) {
    const workerMaxDepth = maxDepth + WORKER_DEPTH_OFFSET;
    const pid = ns.run(
        DARKNET_WORKER,
        1,
        "--depth", WORKER_SEED_DEPTH,
        "--max-depth", workerMaxDepth,
        "--lineage", JSON.stringify(["home"]),
    );
    return pid || 0;
}

export async function main(ns) {
    ns.disableLog("ALL");
    const args = Array.from(ns.args ?? []).map(value => String(value));
    const maxDepth = Math.floor(boundedNumber(
        option(args, "--max-depth", DEFAULT_MAX_DEPTH),
        DEFAULT_MAX_DEPTH,
        0,
        MAX_LOGICAL_DEPTH,
    ));
    const seedIntervalMs = Math.floor(boundedNumber(
        option(args, "--seed-ms", DEFAULT_SEED_INTERVAL_MS),
        DEFAULT_SEED_INTERVAL_MS,
        30_000,
        3_600_000,
    ));

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
                maxDepth,
                workerDepthOffset: WORKER_DEPTH_OFFSET,
                seedIntervalMs,
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
                maxDepth,
                workerDepthOffset: WORKER_DEPTH_OFFSET,
                seedIntervalMs,
                error: "worker-missing",
            });
            await ns.sleep(15_000);
            continue;
        }

        const running = homeWorkerRunning(ns);
        if (!running && now - lastSeedAt >= seedIntervalMs) {
            try {
                lastSeedPid = await seed(ns, maxDepth);
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
            maxDepth,
            workerDepthOffset: WORKER_DEPTH_OFFSET,
            seedIntervalMs,
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
