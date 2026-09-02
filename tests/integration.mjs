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
