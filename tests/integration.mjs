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
// "Multiple overlapping dashboard tails" is a documented prior failure mode.
// A startup-only check cannot prevent it, so the rule is enforced continuously.
{
    const { claimSingleton } = await import("../matrix/lib/singleton.js");
    const DECK = "/matrix/dashboard.jsx";
    const ns = createMockNs();

    // Three supervisors restarting a second apart each launched a deck.
    for (const pid of [30, 10, 20]) ns._spawnFake("home", DECK, pid);
    assert.equal(ns._servers.get("home").procs.filter(p => p.file === DECK).length, 3);

    // The oldest claims ownership and evicts the rest.
    assert.equal(claimSingleton(ns._asPid(10), DECK), true, "the lowest PID owns the deck");
    const survivors = ns._servers.get("home").procs.filter(p => p.file === DECK);
    assert.equal(survivors.length, 1, "the owner must evict every duplicate");
    assert.equal(survivors[0].pid, 10);

    // Losers stand down rather than fighting back, so this cannot oscillate.
    ns._spawnFake("home", DECK, 40);
    assert.equal(claimSingleton(ns._asPid(40), DECK), false, "a newer deck must stand down");
    assert.equal(claimSingleton(ns._asPid(10), DECK), true, "the owner keeps ownership");
    assert.equal(ns._servers.get("home").procs.filter(p => p.file === DECK).length, 1,
        "the network converges to exactly one deck");

    // A deck that is genuinely alone keeps running.
    assert.equal(claimSingleton(ns._asPid(10), DECK), true);
}

// The kernel must sweep the deck, or a relaunch leaves the old one on screen.
{
    const fs = await import("node:fs");
    const kernel = fs.readFileSync("matrix/kernel.js", "utf8");
    assert.match(kernel, /STAGE_SCRIPTS = \[[^\]]*dashboard\.jsx/,
        "kernel.js must kill the dashboard alongside the stage scripts");
    const deck = fs.readFileSync("matrix/dashboard.jsx", "utf8");
    assert.match(deck, /claimSingleton/, "the deck must enforce its own singleton");
    assert.ok(
        (deck.match(/claimSingleton/g) ?? []).length >= 3,
        "the deck must re-claim ownership in its loop, not only at startup",
    );
}

console.log("MATRIX-OS integration passed: exactly one command deck survives.");
