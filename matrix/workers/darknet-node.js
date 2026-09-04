import {
    DARKNET_PORT,
    DARKNET_WORKER,
    easyPasswordCandidates,
    summarizeDetails,
} from "/matrix/lib/darknet.js";

const DARKNET_LIB = "/matrix/lib/darknet.js";

function option(args, name, fallback = null) {
    const index = args.indexOf(name);
    return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
}

function safeLineage(raw, current) {
    try {
        const value = JSON.parse(String(raw ?? "[]"));
        const list = Array.isArray(value) ? value.map(String) : [];
        if (!list.includes(current)) list.push(current);
        return list.slice(-16);
    } catch {
        return [current];
    }
}

function compactResult(result) {
    if (!result || typeof result !== "object") return result ?? null;
    return {
        success: Boolean(result.success),
        code: result.code ?? null,
        message: result.message ?? null,
        data: result.data ?? null,
    };
}

function emit(ns, message) {
    const payload = {
        ...message,
        at: Date.now(),
        workerPid: ns.pid,
        workerHost: ns.getHostname(),
    };
    try { ns.writePort(DARKNET_PORT, JSON.stringify(payload)); } catch {}
}

async function openLocalCaches(ns, host) {
    if (host === "home") return;
    let files = [];
    try { files = ns.ls(host, ".cache"); } catch { return; }
    for (const file of files) {
        try {
            const result = ns.dnet.openCache(file, true);
            emit(ns, {
                type: "cache-opened",
                host,
                file,
                cache: result && typeof result === "object"
                    ? { success: result.success ?? true, message: result.message ?? null }
                    : result,
            });
        } catch (error) {
            emit(ns, { type: "cache-error", host, file, error: String(error) });
        }
    }
}

async function deployChild(ns, child, depth, maxDepth, lineage) {
    const source = ns.getHostname();
    try {
        const copied = await ns.scp([DARKNET_WORKER, DARKNET_LIB], child, source);
        if (!copied) return 0;
    } catch {
        return 0;
    }
    try {
        return ns.exec(
            DARKNET_WORKER,
            child,
            1,
            "--depth", depth,
            "--max-depth", maxDepth,
            "--lineage", JSON.stringify(lineage),
        );
    } catch {
        return 0;
    }
}

export async function main(ns) {
    ns.disableLog("ALL");
    const args = Array.from(ns.args ?? []).map(value => String(value));
    const current = ns.getHostname();
    const hopDepth = Math.max(-1, Math.floor(Number(option(args, "--depth", -1)) || -1));
    const maxDepth = Math.max(0, Math.min(12, Math.floor(Number(option(args, "--max-depth", 5)) || 5)));
    const lineage = safeLineage(option(args, "--lineage", "[]"), current);

    emit(ns, { type: "visit", host: current, hopDepth, lineage });
    await openLocalCaches(ns, current);

    let neighbors;
    try {
        neighbors = ns.dnet.probe();
    } catch (error) {
        emit(ns, { type: "probe-error", host: current, error: String(error) });
        return;
    }

    emit(ns, { type: "probe", host: current, hopDepth, neighbors });
    if (hopDepth >= maxDepth) return;

    for (const child of neighbors) {
        if (!child || lineage.includes(child)) continue;

        let details;
        try {
            details = ns.dnet.getServerDetails(child);
        } catch (error) {
            emit(ns, { type: "details-error", host: child, parent: current, error: String(error) });
            continue;
        }
        const summary = summarizeDetails(child, details);
        emit(ns, { type: "discovered", host: child, parent: current, ...summary });
        if (details?.isOnline === false) continue;

        let authenticated = child === "darkweb";
        let password = child === "darkweb" ? "" : null;
        let attempted = 0;

        if (!authenticated) {
            const candidates = easyPasswordCandidates(details);
            if (!candidates.length) {
                emit(ns, {
                    type: "solver-needed",
                    host: child,
                    parent: current,
                    modelId: details?.modelId ?? null,
                    passwordLength: details?.passwordLength ?? null,
                    passwordHint: details?.passwordHint ?? null,
                    data: details?.data ?? null,
                });
                continue;
            }

            for (const candidate of candidates) {
                attempted += 1;
                let result;
                try {
                    result = await ns.dnet.authenticate(child, candidate);
                } catch (error) {
                    emit(ns, { type: "auth-error", host: child, parent: current, candidate, error: String(error) });
                    break;
                }
                if (result?.success) {
                    authenticated = true;
                    password = candidate;
                    emit(ns, {
                        type: "auth-success",
                        host: child,
                        parent: current,
                        modelId: details?.modelId ?? null,
                        password,
                        attempts: attempted,
                        result: compactResult(result),
                    });
                    break;
                }
            }

            if (!authenticated) {
                let logs = [];
                try {
                    const bleed = await ns.dnet.heartbleed(child, { logsToCapture: 3, peek: true });
                    logs = Array.isArray(bleed?.logs) ? bleed.logs : [];
                } catch {}
                emit(ns, {
                    type: "auth-pending",
                    host: child,
                    parent: current,
                    modelId: details?.modelId ?? null,
                    attempts: attempted,
                    logs,
                });
                continue;
            }
        }

        const childLineage = [...lineage, child].slice(-16);
        const pid = await deployChild(ns, child, hopDepth + 1, maxDepth, childLineage);
        emit(ns, {
            type: pid ? "worker-spawned" : "worker-spawn-failed",
            host: child,
            parent: current,
            authenticated,
            password,
            childPid: pid || 0,
            hopDepth: hopDepth + 1,
        });
    }
}
