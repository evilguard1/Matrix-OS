import { readJson, writeJson, writeState } from "/matrix/lib/common.js";
import {
    BOOST_MODE_MAX,
    BOOST_MODE_NORMAL,
    BOOST_REQUEST_STATE,
    makeBoostRequest,
    makeCancelRequest,
    parseDuration,
} from "/matrix/lib/reputation-boost.js";

function usage(ns) {
    ns.tprint("MATRIX reputation boost usage:");
    ns.tprint("  run /matrix/boost.js rep 10m");
    ns.tprint("  run /matrix/boost.js max 20m");
    ns.tprint("  run /matrix/boost.js cancel");
}

export async function main(ns) {
    const command = String(ns.args?.[0] ?? "").trim().toLowerCase();
    const now = Date.now();

    if (command === "cancel" || command === "stop") {
        const previous = readJson(ns, BOOST_REQUEST_STATE, null);
        const cancelled = makeCancelRequest(previous, now);
        await writeJson(ns, BOOST_REQUEST_STATE, cancelled);
        await writeState(ns, "boost", {
            status: "cancel-requested",
            mode: previous?.mode ?? null,
            boostId: previous?.boostId ?? null,
            cancelledAt: now,
            phase: "restore-pending",
            admissionPaused: false,
            restoreState: "pending",
            error: null,
        });
        ns.tprint("[MATRIX] Reputation boost cancellation requested.");
        return;
    }

    const mode = command === "rep" || command === "normal"
        ? BOOST_MODE_NORMAL
        : command === "max" || command === "maxrep" || command === "max-rep"
            ? BOOST_MODE_MAX
            : null;
    const durationMs = parseDuration((ns.args ?? []).slice(1));
    if (!mode || !durationMs) {
        usage(ns);
        return;
    }

    const boostId = `boost-${now.toString(36)}-${Math.floor(Math.random() * 0x100000).toString(36)}`;
    const request = makeBoostRequest(mode, durationMs, now, boostId);
    if (!request) {
        usage(ns);
        return;
    }

    await writeJson(ns, BOOST_REQUEST_STATE, request);
    await writeState(ns, "boost", {
        status: "requested",
        mode,
        boostId,
        durationMs,
        requestedAt: request.requestedAt,
        startedAt: request.startedAt,
        endsAt: request.endsAt,
        remainingMs: durationMs,
        phase: mode === BOOST_MODE_MAX ? "drain-pending" : "share-pending",
        admissionPaused: mode === BOOST_MODE_MAX,
        restoreState: "pending",
        error: null,
    });
    if (mode === BOOST_MODE_MAX) {
        ns.tprint(`[MATRIX] BOOST MAX REP requested (${boostId}): drain HWGW, then share at maximum safe capacity for ${Math.ceil(durationMs / 1000)}s.`);
    } else {
        ns.tprint(`[MATRIX] BOOST REP active for ${Math.ceil(durationMs / 1000)}s (${boostId}).`);
    }
}
