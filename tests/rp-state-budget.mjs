import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resetEpoch, freshState, stateEnvelope } from "../matrix/lib/state.js";
import { spendMoney, spendingAllowance, BUDGET_LEDGER } from "../matrix/lib/budget-ledger.js";
import { reserveMoney, getDirectives, getCoordinatorState } from "../matrix/lib/common.js";

async function load(file) {
    const source = fs.readFileSync(file, "utf8").replace(/from\s*["'](\/matrix\/[^"']+)["']/g,
        (_, p) => `from "${pathToFileURL(path.resolve(p.slice(1))).href}"`);
    return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}
const coordinator = await load("matrix/services/coordinator.js");
const stock = await load("matrix/services/stock.js");
const reset = { currentNode: 4, lastNodeReset: 1, lastAugReset: 2, ownedSF: new Map([[2, 1]]) };
function fixture(cash = 100) {
    const files = new Map([["/matrix/config.json", JSON.stringify({ economy: { cashReserve: 0, reserveFraction: 0 } })]]);
    let balance = cash, homeRam = 32, currentReset = { ...reset }, calls = 0;
    const ns = { pid: 10, read: p => files.get(p) ?? "", write(p, text, mode) { files.set(p, mode === "a" ? (files.get(p) ?? "") + text : text); },
        getHostname: () => "home", getServerMaxRam: () => homeRam, getServerMoneyAvailable: () => balance,
        getResetInfo: () => currentReset };
    return { ns, files, cash: () => balance, calls: () => calls,
        purchase: price => { calls++; balance -= price; return true; },
        setRam: n => homeRam = n, setReset: r => currentReset = r };
}
const buy = (f, cost, more = {}) => spendMoney(f.ns, { owner: "programs", quote: () => cost, execute: () => f.purchase(cost), ...more });

assert.equal(resetEpoch(reset), "4:1:2");
for (const corrupt of [{ revision: -1 }, { keyed: [null] }, { keyed: {} }, { revision: Number.MAX_SAFE_INTEGER }]) {
    const f = fixture();
    f.files.set(BUDGET_LEDGER, JSON.stringify({ schemaVersion: 1, resetEpoch: "4:1:2", revision: 0, receipts: [], ...corrupt }));
    assert.equal(buy(f, 1).reason, "invalid-ledger");
    assert.equal(f.calls(), 0);
}
assert.equal(resetEpoch({ currentNode: 4 }), null);
const now = Date.now();
assert.equal(freshState({ updated: now + 1 }, { now }), false);
assert.equal(freshState({ updated: now - 31_000 }, { now }), false);
assert.equal(freshState({ ...stateEnvelope(reset, 1, now) }, { now, epoch: "4:1:3" }), false);

// All calls use the same actual cash and ledger, including separate managers.
{
    const f = fixture();
    const receipts = await Promise.all([Promise.resolve().then(() => buy(f, 60)), Promise.resolve().then(() => buy(f, 60, { owner: "homeRam" }))]);
    assert.deepEqual(receipts.map(x => x.status), ["spent", "deferred"]);
    assert.equal(f.cash(), 40); assert.equal(f.calls(), 1);
}
{
    const f = fixture();
    assert.equal(buy(f, 70, { limit: 50 }).status, "rejected");
    assert.equal(f.calls(), 0);
    assert.equal(buy(f, 10, { execute: async () => f.purchase(10) }).reason, "invalid-purchase");
    assert.equal(f.calls(), 0);
    f.files.set(BUDGET_LEDGER, "{");
    assert.equal(buy(f, 10).reason, "invalid-ledger"); assert.equal(f.calls(), 0);
}
{
    const f = fixture();
    const receipt = buy(f, 10, { key: "one" });
    assert.equal(receipt.status, "spent");
    assert.equal(buy(f, 10, { key: "one" }).replay, true);
    assert.equal(buy(f, 10, { key: "one", owner: "homeRam" }).reason, "key-conflict");
    assert.equal(f.calls(), 1);
}
{
    const f = fixture(10_000);
    buy(f, 1, { key: "survives-compaction" });
    for (let i = 0; i < 150; i++) assert.equal(buy(f, 1).status, "spent");
    assert.equal(buy(f, 1, { key: "survives-compaction" }).replay, true);
    assert.equal(f.calls(), 151);
}
{
    const f = fixture();
    const first = buy(f, 20, { execute: () => { f.purchase(20); throw Error("lost result"); } });
    assert.equal(first.status, "outcome-unknown");
    assert.equal(buy(f, 10).reason, "outcome-unknown");
    assert.equal(f.calls(), 1);
    f.setReset({ ...reset, lastAugReset: 3 });
    assert.equal(buy(f, 10).status, "spent", "new epoch must not replay an old grant");
}
{
    const f = fixture();
    assert.equal(buy(f, 10, { execute: () => false }).status, "failed");
    assert.equal(buy(f, 10).status, "spent");
    const other = fixture();
    other.ns.write = () => undefined;
    assert.equal(buy(other, 10).reason, "intent-write-failed");
    assert.equal(other.calls(), 0);
}
{
    const f = fixture(1e20);
    assert.equal(buy(f, 200_000).status, "spent", "floating-point cash resolution cannot deadlock a rich save");
}
{
    const f = fixture(60e9); f.setRam(64);
    assert.equal(spendingAllowance(f.ns, "cloud"), 0, "missing full-stage policy blocks spending");
    const record = { ...stateEnvelope(reset, 1), status: "online", id: "RESERVE_MILESTONE", budgets: { milestoneReserve: 100e9 }, spendOwner: null };
    f.files.set("/matrix/state/coordinator.txt", JSON.stringify(record));
    assert.equal(reserveMoney(f.ns), 100e9);
    assert.equal(spendingAllowance(f.ns, "cloud"), 0);
    assert.equal(spendingAllowance(f.ns, "augmentations", "unrelated"), 0);
    record.spendOwner = "homeRam"; record.id = "EXPAND_RAM";
    f.files.set("/matrix/state/coordinator.txt", JSON.stringify(record));
    assert.equal(spendingAllowance(f.ns, "homeRam"), 60e9, "the objective owner may spend its own reserve");
    f.files.set("/matrix/state/directives.txt", JSON.stringify({ ...record, revision: 2, directives: { stock: "trade" } }));
    assert.equal(getDirectives(f.ns), null, "mismatched publications are not a coherent policy");
    record.updated -= 31_000;
    f.files.set("/matrix/state/coordinator.txt", JSON.stringify(record));
    assert.equal(getCoordinatorState(f.ns), null);
    assert.equal(spendingAllowance(f.ns, "homeRam"), 0);
    assert.equal(reserveMoney(f.ns), 60e9, "stale canonical policy does not reopen discretionary spending");
}
{
    const f = fixture(60e9); f.setRam(64);
    const stop = Symbol("stop");
    Object.assign(f.ns, { disableLog() {}, getPlayer: () => ({ factions: [], karma: 0 }), getHackingLevel: () => 1600,
        hasTorRouter: () => true, fileExists: () => true, hasRootAccess: () => false, getServerRequiredHackingLevel: () => 3000,
        sleep: async () => { throw stop; } });
    try { await coordinator.main(f.ns); } catch (error) { if (error !== stop) throw error; }
    const value = JSON.parse(f.files.get("/matrix/state/coordinator.txt"));
    assert.equal(value.status, "online"); assert.equal(value.budgets.milestoneReserve, 100e9);
    assert.equal(reserveMoney(f.ns), 100e9); assert.equal(spendingAllowance(f.ns, "cloud"), 0);
    assert.equal(getDirectives(f.ns).revision, value.revision);
}
for (const karma of [-100, -53999]) assert.equal(coordinator.evaluateObjective({ karma, resetInfo: reset }).id, "GANG_KARMA");
for (const resetInfo of [{ ...reset, currentNode: 2 }, { ...reset, bitNodeOptions: { disableGang: true } }])
    assert.notEqual(coordinator.evaluateObjective({ karma: -100, resetInfo }).id, "GANG_KARMA");
assert.notEqual(coordinator.evaluateObjective({ karma: -54000, resetInfo: reset }).id, "GANG_KARMA");

// A long and a short position can be observed and closed without forecasts.
{
    let long = 10, short = 5, refuse = true;
    const ns = { stock: { getSymbols: () => ["AAA"], getPosition: () => [long, 100, short, 110],
        getBidPrice: () => 100, getAskPrice: () => 101,
        getSaleGain: (_, shares, type) => shares * (type === "Long" ? 100 : 119) - 1,
        sellStock: () => { long = 0; return 100; }, sellShort: () => { if (!refuse) short = 0; return refuse ? 0 : 101; } } };
    const first = stock.liquidatePortfolio(ns);
    assert.equal(first.positions, 1); assert.equal(first.closedPositions, 1);
    assert.ok(first.exposure > 0, "refused short sale remains in portfolio");
    refuse = false;
    assert.equal(stock.liquidatePortfolio(ns).positions, 0);
}
console.log("RP state/budget passed: canonical reserve, epoch/freshness, owner grants, competing spenders, prices, retained keys, crash/failed writes, BN2 exemption and pre-4S liquidation.");
