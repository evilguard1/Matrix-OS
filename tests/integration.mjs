/**
 * Integration tests: run real MATRIX scripts against a fake Netscript.
 *
 * These cover what pure-function tests structurally cannot - a script that
 * parses, has a legal RAM budget, and still does the wrong thing at runtime.
 */
import assert from "node:assert/strict";
import { createMockNs, run } from "./mock-ns.mjs";

const seed = await import("../matrix/worm/seed.js");
const spread = await import("../matrix/worm/spread.js");

// --- the seeder plants the worm on the biggest host it can root --------------
{
    const ns = createMockNs();
    await run(seed.main, ns);

    const planted = ns._log.find(e => e.event === "exec" && e.file.includes("spread.js"));
    assert.ok(planted, "seed.js must plant the worm somewhere");
    // Rooting needs open PORTS, not hacking level - so a 1-port 32 GB server is a
    // better seed than a 0-port 16 GB one even at low hacking skill.
    assert.equal(ns._servers.get(planted.host).ram, 32, "seed must pick the largest rootable host");
    assert.ok(ns._servers.get(planted.host).files.has("/matrix/worm/drone.js"),
        "the drone must be copied alongside the worm, or the worm has nothing to deploy");
    assert.ok(ns._log.some(e => e.event === "spawn"), "seed.js must hand control back to the stage and exit");
}

// --- the worm infects the network without over-subscribing any server --------
{
    const ns = createMockNs({ maxSleeps: 3 });
    await run(seed.main, ns);
    const host = ns._log.find(e => e.event === "exec" && e.file.includes("spread.js")).host;
    await run(spread.main, ns._as(host));

    for (const [name, server] of ns._servers) {
        assert.ok(ns._used(name) <= server.ram + 1e-9,
            `${name} is over-subscribed: ${ns._used(name)} GB used of ${server.ram} GB`);
    }
    assert.deepEqual(ns._log.filter(e => e.event === "ram-refused"), [],
        "the worm must never ask a server for more RAM than it has");

    // A relay node must keep the worm's own footprint free, or the next wave has
    // nowhere to land and propagation stalls after one hop.
    const SPREAD_RAM = Number(/const SPREAD_RAM = ([\d.]+);/.exec(
        (await import("node:fs")).readFileSync("matrix/worm/spread.js", "utf8"))[1]);
    for (const [name, server] of ns._servers) {
        // The origin already has its own worm resident, so its used RAM covers
        // the footprint - only remote relays need landing space kept clear.
        if (name === "home" || name === host || !server.rooted || server.ram < 16) continue;
        assert.ok(ns._free(name) >= SPREAD_RAM - 1e-9,
            `relay ${name} has only ${ns._free(name)} GB free; the worm needs ${SPREAD_RAM} GB to land again`);
    }

    const droneHosts = [...ns._servers.values()].filter(s => s.procs.some(p => p.file.includes("drone.js")));
    assert.ok(droneHosts.length >= 3, `expected drones on several hosts, got ${droneHosts.length}`);
    assert.ok(!droneHosts.some(s => s.name === "home"), "the worm must never consume home RAM");

    // n00dles is 4 GB: too small to host the 5.05 GB worm, big enough for one drone.
    const noodles = ns._servers.get("n00dles");
    assert.ok(noodles.procs.some(p => p.file.includes("drone.js")), "a 4 GB host must still earn");
    assert.ok(!noodles.procs.some(p => p.file.includes("spread.js")), "a 4 GB host must not host the worm");

    // The botnet must report home over the free netscript port.
    const report = JSON.parse(ns.peek(1));
    assert.ok(report.infected > 0, "the worm must report infected hosts");
    assert.ok(report.drones > 0, "the worm must report its drone count");
    assert.equal(report.origin, host);
    assert.ok(report.target, "the worm must publish the target it chose");
}

// --- unrooted hosts stay untouched -------------------------------------------
{
    const ns = createMockNs({ maxSleeps: 3, crackers: [] });
    await run(seed.main, ns);
    await run(spread.main, ns._as("foodnstuff"));
    for (const name of ["zer0", "max-hardware", "iron-gym", "phantasy"]) {
        assert.equal(ns._servers.get(name).rooted, false, `${name} needs a port cracker and must stay unrooted`);
        assert.equal(ns._servers.get(name).procs.length, 0, `${name} is unrooted and must run nothing`);
    }
}

console.log("MATRIX-OS integration passed: worm seeds, spreads, respects RAM, and reports home.");

// --- contracts are dispatched to the network, never solved on home -----------
{
    const { dispatchContracts } = await import("../matrix/lib/dispatch.js");
    const ns = createMockNs();
    // Root the network first so there are hosts with room for the 21.6 GB solver.
    await run(seed.main, ns);
    const origin = ns._log.find(e => e.event === "exec" && e.file.includes("spread.js")).host;
    await run(spread.main, ns._as(origin));

    ns._addContract("phantasy", "contract-1.cct");
    ns._addContract("n00dles", "contract-2.cct");

    const hosts = [...ns._servers.keys()];
    const dispatched = new Set();
    const first = dispatchContracts(ns, hosts, dispatched);
    assert.equal(first.found, 2, "both contracts must be found wherever they sit");

    const solverRuns = ns._log.filter(e => e.event === "exec" && e.file.includes("workers/contract.js"));
    assert.ok(solverRuns.length > 0, "a solver must actually be dispatched");
    assert.ok(!solverRuns.some(e => e.host === "home"), "the 21.6 GB solver must never run on home");
    for (const runEntry of solverRuns) {
        assert.ok(ns._servers.get(runEntry.host).files.has("/matrix/lib/solvers.js"),
            "the solver's imported library must be copied with it or it cannot start");
    }

    // Running again must not re-attempt the same contract: attempts are finite.
    const before = solverRuns.length;
    dispatchContracts(ns, hosts, dispatched);
    const after = ns._log.filter(e => e.event === "exec" && e.file.includes("workers/contract.js")).length;
    assert.equal(after, before, "a contract must never be dispatched twice");

    // A contract that disappears is forgotten, so the set cannot grow forever.
    ns._servers.get("phantasy").files.delete("contract-1.cct");
    dispatchContracts(ns, hosts, dispatched);
    assert.ok(![...dispatched].some(k => k.includes("contract-1")), "solved contracts must be forgotten");
}

console.log("MATRIX-OS integration passed: contracts dispatch off-home, once each.");

// --- exactly one command deck, however many supervisors race -----------------
// "Multiple overlapping dashboard tails" is a documented prior failure mode. The
// first attempt at a fix had the owner KILL duplicates, which made it worse: a
// killed script never runs its own closeTail(), so it leaves an orphan window.
// Duplicates must therefore stand down voluntarily.
{
    const { isSingletonOwner, holdSingleton } = await import("../matrix/lib/singleton.js");
    const DECK = "/matrix/dashboard.jsx";
    const ns = createMockNs();

    for (const pid of [30, 10, 20]) ns._spawnFake("home", DECK, pid);

    assert.equal(isSingletonOwner(ns._asPid(10), DECK), true, "the lowest PID owns the deck");
    assert.equal(isSingletonOwner(ns._asPid(20), DECK), false, "a newer deck does not own it");
    assert.equal(isSingletonOwner(ns._asPid(30), DECK), false);

    // Nobody is killed - each loser closes its own window and returns.
    assert.equal(holdSingleton(ns._asPid(20), DECK), false, "a duplicate must stand down");
    assert.equal(ns._servers.get("home").procs.filter(p => p.file === DECK).length, 3,
        "standing down must not kill anyone: a killed script cannot close its own tail");

    // The rule is total and stable, so it converges and cannot oscillate.
    assert.equal(holdSingleton(ns._asPid(10), DECK), true, "the owner keeps running");
    assert.equal(holdSingleton(ns._asPid(10), DECK), true, "and stays the owner");

    // A deck that is genuinely alone survives.
    const solo = createMockNs();
    solo._spawnFake("home", DECK, 7);
    assert.equal(holdSingleton(solo._asPid(7), DECK), true);
}

// Guards that keep the failure from returning.
{
    const fs = await import("node:fs");
    const deck = fs.readFileSync("matrix/dashboard.jsx", "utf8");
    assert.match(deck, /holdSingleton/, "the deck must enforce its own singleton");
    // The deck must re-check ownership inside its main loop, not only at startup:
    // a startup-only check is exactly what let racing supervisors leave decks behind.
    const deckLoop = deck.slice(deck.lastIndexOf("while (true)"));
    assert.ok(deckLoop.includes("holdSingleton"),
        "the deck must re-check ownership inside its loop, not only at startup");

    // A stage transition restarts everything, so the installer spawn must sit
    // behind a time gate. Unthrottled, it is an infinite restart loop that leaves
    // a new command deck behind every cycle.
    const start = fs.readFileSync("matrix/start.js", "utf8");
    assert.ok(start.includes("Date.now() - lastAttempt > STAGE_RETRY_MS"),
        "the stage transition must be time-gated");
    const stageBlock = start.slice(start.indexOf("const wantStage"), start.indexOf("const reset ="));
    assert.ok(stageBlock.includes("STAGE_ATTEMPT"), "the attempt time must be persisted across restarts");
    assert.ok(stageBlock.indexOf("lastAttempt") < stageBlock.indexOf("ns.spawn(INSTALLER"),
        "the time gate must be checked before spawning the installer");
}

console.log("MATRIX-OS integration passed: exactly one command deck survives.");

// --- the stage transition must not be able to loop ---------------------------
// A stage change restarts everything, so a transition that never "takes" is an
// infinite restart loop that leaves a new command deck behind on every cycle.
// That is exactly what happened: install.js derived its marker from
// stageLimit() while the supervisor compared against expectedStage(), and any
// disagreement between the two looped forever. Completeness is now decided by
// asking whether the stage's files actually exist.
{
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    const root = process.cwd();
    const src = fs.readFileSync("matrix/start.js", "utf8").replace(
        /from\s+["'](\/matrix\/[^"']+)["']/g,
        (_, spec) => `from "${pathToFileURL(path.join(root, spec.replace(/^\//, ""))).href}"`);
    const { expectedStage, stageInstalled } = await import(
        `data:text/javascript;base64,${Buffer.from(src).toString("base64")}`);

    assert.equal(expectedStage(32), "full");
    assert.equal(expectedStage(64), "operations");
    assert.equal(expectedStage(128), "advanced");

    const ns = createMockNs();
    // The installer has already placed the full stage.
    assert.equal(stageInstalled(ns, "full"), true, "dashboard.jsx present means the full stage is installed");
    // ...so no transition is attempted, whatever the marker file happens to say.
    assert.equal(stageInstalled(ns, "operations"), true, "cloud.js ships in the manifest the mock mirrors");

    // Remove the probe file and the transition becomes necessary again.
    ns._servers.get("home").files.delete("/matrix/dashboard.jsx");
    assert.equal(stageInstalled(ns, "full"), false, "a missing stage file must trigger exactly one fetch");

    // The decision must not consult the marker file, which is the thing that
    // disagreed with expectedStage() and caused the loop.
    const start = fs.readFileSync("matrix/start.js", "utf8");
    assert.ok(start.includes("if (!stageInstalled(ns, wantStage))"),
        "stage completeness must come from the filesystem, not the marker");
    assert.ok(!start.includes("if (haveStage !== wantStage)"),
        "comparing the marker against expectedStage() is what looped forever");
}

console.log("MATRIX-OS integration passed: stage transitions cannot loop.");

// --- the deck must not depend on ns.ps alone ---------------------------------
// Evidence from a real save: hacking/telemetry/coordinator stayed "running" on
// their original PIDs while the deck was reported "started" with a fresh PID
// every 5s cycle. Either it dies instantly, or ns.ps does not report it. A
// heartbeat file settles which, and guards against both.
{
    const fs = await import("node:fs");
    const deck = fs.readFileSync("matrix/dashboard.jsx", "utf8");

    // Must be CALLED, not merely defined: definition + both guard sites.
    assert.ok((deck.match(/anotherDeckAlive/g) ?? []).length >= 3,
        "the deck must actually consult its heartbeat guard at startup and in its loop");
    const deckLoopBody = deck.slice(deck.lastIndexOf("while (true)"));
    assert.ok(deckLoopBody.includes("anotherDeckAlive"),
        "the heartbeat guard must be re-checked in the loop, not only at startup");
    assert.match(deck, /dashboard\.txt/, "the deck must publish a heartbeat");

    // The heartbeat must be written before rendering and refreshed in the loop,
    // or a stale file would lock every future deck out permanently.
    const beats = deck.match(/beat\(ns, "[a-z-]+"/g) ?? [];
    assert.ok(beats.includes('beat(ns, "rendering"'), "the deck must record that it reached rendering");
    assert.ok(beats.includes('beat(ns, "alive"'), "the deck must record that it is alive");
    assert.ok(beats.length >= 3, "the heartbeat must be refreshed, not written once");

    // Ownership MUST be antisymmetric. Every deck writes the same heartbeat file,
    // so an unordered "someone else is beating" test makes A stand down for B and
    // B stand down for A - both die. That killed a deck every 10 seconds in game
    // ("Recently Killed: dashboard.jsx died 0/10/20 seconds ago").
    const { heartbeatOwner } = await import("../matrix/lib/singleton.js");
    const now = 1_000_000;
    const alive = pid => ({ pid, phase: "alive", updated: now });

    for (const [a, b] of [[100, 105], [1, 2], [7, 99], [40, 41]]) {
        const aOwns = heartbeatOwner(alive(b), a, now);
        const bOwns = heartbeatOwner(alive(a), b, now);
        assert.ok(aOwns !== bOwns, `ownership between ${a} and ${b} must not be symmetric`);
        assert.equal(aOwns, true, "the lower PID keeps the window");
        assert.equal(bOwns, false, "the higher PID stands down");
    }

    // Nobody may be locked out by a heartbeat that is absent, stale, or unfinished.
    assert.equal(heartbeatOwner(null, 50, now), true, "no heartbeat means the window is free");
    assert.equal(heartbeatOwner(alive(10), 50, now + 60_000), true, "a stale heartbeat must expire");
    assert.equal(heartbeatOwner({ pid: 10, phase: "rendering", updated: now }, 50, now), true,
        "a deck that never reached alive does not own the window");
    assert.equal(heartbeatOwner(alive(50), 50, now), true, "our own heartbeat is not a rival");

    // And it must converge: from any set of live PIDs, exactly one survives.
    const pids = [88, 12, 45, 103, 7];
    const owners = pids.filter(pid =>
        pids.every(other => other === pid || heartbeatOwner(alive(other), pid, now)));
    assert.deepEqual(owners, [7], "exactly the lowest PID may survive");

    // The supervisor must stop respawning something that will not stay up.
    const start = fs.readFileSync("matrix/start.js", "utf8");
    assert.match(start, /DECK_RESTART_LIMIT/, "a deck that dies on start must not be respawned forever");
    assert.ok(start.includes('state: "restart-loop"'), "a restart loop must be reported, not hidden");
    assert.ok(start.indexOf("deckRestarts++") > 0 && start.includes('=== "running") deckRestarts = 0'),
        "the restart counter must reset once the deck stays up");

    // The supervisor must decide the deck is alive from the heartbeat, not ns.ps.
    // This project already learned that lesson once: bootstrap.js moved to a lock
    // file (8cb272a) and preventDuplicates was found to silently no-op (90f757a).
    assert.match(start, /function deckAlive/, "the supervisor needs heartbeat-based liveness for the deck");
    assert.ok(start.includes("if (service.ui && deckAlive(ns))"),
        "the supervisor must consult the heartbeat before respawning the deck");
    const uiGuard = start.indexOf("service.ui && deckAlive(ns)");
    const uiSpawn = start.indexOf("ensureOne(ns, service.file, report)");
    assert.ok(uiGuard > 0 && uiGuard < uiSpawn,
        "the heartbeat check must come before the respawn, or it spawns one every cycle anyway");
    assert.ok(start.includes('via: "heartbeat"'), "heartbeat-sourced liveness must be visible in the report");
}

console.log("MATRIX-OS integration passed: deck ownership survives an unreliable ns.ps.");
