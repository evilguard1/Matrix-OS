/**
 * Concurrency simulation.
 *
 * Seven fixes for "multiple overlapping command decks" all passed their tests
 * and all failed in game, because every test asserted about ONE process at ONE
 * moment. Bugs of this kind only exist as relations between processes over time.
 *
 * HONEST LIMIT: this model does NOT reproduce the in-game failure. Replaying the
 * older rules through it also converges, so the real cause is something this
 * simulation does not capture - most likely an external kill, or interleaving
 * the model does not represent. It proves the lease is sound; it does not prove
 * the lease is sufficient. Do not read a passing run as "the deck bug is fixed".
 *
 * Rules previously shipped and their known real-world outcome:
 *
 *   0.8.2  the owner killed duplicates, and a killed script cannot close its
 *          own tail window -> orphans
 *   0.9.0  ownership was symmetric -> A stands down for B while B stands down
 *          for A -> both die
 *   pre-0.9.1  every instance wrote the shared lock every 2s -> whoever wrote
 *          last won the next read -> ownership thrashed forever
 *
 * So this runs real decision logic across several simulated processes and many
 * ticks, and asserts on the emergent behaviour.
 */
import assert from "node:assert/strict";
import { leaseDecision } from "../matrix/lib/singleton.js";

const TICK_MS = 2000;
const LEASE_MS = 6000;
const SUPERVISOR_EVERY = 5000;
const SUPERVISOR_LEASE_MS = 8000;   // start.js deckAlive() window

function simulate({ decks = 1, ticks = 200, killHolderAt = null } = {}) {
    let now = 0;
    let nextPid = 100;
    let file = null;
    let deaths = 0;
    let spawns = 0;
    const live = new Map();

    const spawn = () => { live.set(nextPid, { ticks: 0 }); nextPid += 1; spawns += 1; };
    for (let i = 0; i < decks; i++) spawn();

    let lastSupervisor = 0;
    for (let step = 0; step < ticks; step++) {
        now += TICK_MS;

        if (killHolderAt !== null && step === killHolderAt && file) {
            live.delete(file.pid);   // holder vanishes without releasing
        }

        // Each live deck evaluates the real rule, in PID order.
        for (const pid of [...live.keys()].sort((a, b) => a - b)) {
            const decision = leaseDecision(file, pid, now, LEASE_MS);
            if (decision === "stand-down") { live.delete(pid); deaths += 1; continue; }
            file = { pid, phase: "alive", updated: now };   // claim or renew
            live.get(pid).ticks += 1;
        }

        // The supervisor respawns only when the lease looks dead. It cannot check
        // process liveness - that is the ns.ps blind spot this whole design works
        // around - so it judges by lease freshness alone, exactly like deckAlive()
        // in start.js. Its window is deliberately LONGER than the deck's, so the
        // holder releases before the supervisor decides to replace it.
        if (now - lastSupervisor >= SUPERVISOR_EVERY) {
            lastSupervisor = now;
            const held = file && file.phase === "alive" && now - file.updated < SUPERVISOR_LEASE_MS;
            if (!held) spawn();
        }
    }
    return { live: [...live.keys()], deaths, spawns, holder: file?.pid ?? null };
}

// One deck, left alone, must simply live.
{
    const r = simulate({ decks: 1 });
    assert.equal(r.live.length, 1, "a lone deck must survive");
    assert.equal(r.deaths, 0, "a lone deck must never stand down");
    assert.equal(r.spawns, 1, "the supervisor must not respawn a healthy deck");
}

// Several decks racing at once must collapse to one and then STAY there.
for (const decks of [2, 3, 6, 12]) {
    const r = simulate({ decks });
    assert.equal(r.live.length, 1, `${decks} racing decks must converge to one, got ${r.live.length}`);
    assert.equal(r.live[0], r.holder, "the survivor must be the lease holder");
    assert.equal(r.deaths, decks - 1, `exactly ${decks - 1} must stand down, got ${r.deaths}`);
    assert.equal(r.spawns, decks, "no respawns once a holder exists");
}

// The failure the user actually saw: a deck dying on a fixed cadence forever.
// Over 200 ticks (~6.5 simulated minutes) a stable system loses nobody.
{
    const r = simulate({ decks: 4, ticks: 400 });
    assert.ok(r.deaths <= 3, `ownership must not thrash: ${r.deaths} deaths over 400 ticks`);
    assert.equal(r.live.length, 1);
}

// If the holder vanishes, exactly one replacement takes over once the lease
// expires - the UI must not be locked out by a dead process.
{
    const r = simulate({ decks: 3, ticks: 100, killHolderAt: 20 });
    assert.equal(r.live.length, 1, "a replacement must take over after the lease expires");
    assert.ok(r.spawns <= 4, `recovery must not spawn repeatedly, got ${r.spawns}`);
    assert.ok(r.deaths <= 3, `recovery must not thrash, got ${r.deaths} deaths`);
}

// Antisymmetry, stated directly: two processes must never both stand down.
{
    const now = 1000;
    const held = { pid: 100, phase: "alive", updated: now };
    const a = leaseDecision(held, 100, now, LEASE_MS);
    const b = leaseDecision(held, 105, now, LEASE_MS);
    assert.equal(a, "renew", "the holder renews");
    assert.equal(b, "stand-down", "the challenger stands down");
    assert.ok(!(a === "stand-down" && b === "stand-down"), "both must never stand down");
}

// A challenger must never write. That is the property that was violated for
// seven releases, and it is what makes the lease stable.
{
    const held = { pid: 100, phase: "alive", updated: 1000 };
    assert.equal(leaseDecision(held, 999, 1000, LEASE_MS), "stand-down",
        "a challenger must stand down, not claim, while the lease is fresh");
    assert.equal(leaseDecision(held, 999, 1000 + LEASE_MS, LEASE_MS), "claim",
        "and may only claim once the lease has expired");
}

console.log("MATRIX-OS concurrency passed: decks converge to one and stay there.");
