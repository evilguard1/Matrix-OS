import { config, reserveMoney, baselineReserveMoney, managerBudget, getCoordinatorState } from "./common.js";
import { resetEpoch } from "./state.js";

export const BUDGET_LEDGER = "/matrix/state/budget-ledger.txt";
const JOURNAL = "/matrix/state/budget-journal.txt";
const MANAGERS = new Set(["cloud", "hacknet", "stock", "sleeveAugs"]);
const OWNERS = new Set([...MANAGERS, "programs", "homeRam", "augmentations", "donations", "corporation"]);

function parse(text) { try { return text ? JSON.parse(text) : null; } catch { return false; } }
function persist(ns, path, value) {
    const text = JSON.stringify(value);
    // Bitburner 3.0.1 write() is synchronous and returns void. There must be no
    // await between permission, grant, native purchase and its receipt.
    const result = ns.write(path, text, "w");
    if (result?.then || ns.read(path) !== text) throw new Error("budget-write-not-verified");
}

export function spendingAllowance(ns, owner, target = null, cfg = config(ns)) {
    if (!OWNERS.has(owner) || cfg.masterEnabled === false) return 0;
    const service = { programs: "singularity", homeRam: "singularity", augmentations: "singularity", donations: "singularity", sleeveAugs: "sleeves" }[owner] ?? owner;
    if (cfg.automation?.[service] === false) return 0;
    const cash = ns.getServerMoneyAvailable("home");
    if (!Number.isFinite(cash) || cash < 0) return 0;
    const coord = getCoordinatorState(ns);
    // Before full stage no coordinator is required. At full stage, spenders
    // wait for a healthy canonical policy instead of guessing after a crash.
    if (ns.getServerMaxRam("home") >= 64 && (!coord || coord.status !== "online" || !coord.budgets)) return 0;
    if (coord?.schemaVersion === 1 && coord.spendOwner === owner &&
        (!coord.spendTarget || coord.spendTarget === target)) {
        return Math.max(0, cash - baselineReserveMoney(ns, cfg));
    }
    if (MANAGERS.has(owner)) return managerBudget(ns, owner, cfg);
    return Math.max(0, cash - reserveMoney(ns, cfg));
}

/** Execute one synchronous cash purchase with a durable intent and receipt.
 * All participating managers share this ledger; it is not a lock on manual
 * purchases or scripts outside MatrixOS. Long jobs reserve at each purchase.
 * An unresolved interrupted intent blocks spending until explicit recovery.
 */
export function spendMoney(ns, options) {
    const { owner, target = null, quote, execute, limit = Infinity, key = null } = options ?? {};
    if (!ns || !OWNERS.has(owner) || typeof quote !== "function" || typeof execute !== "function" ||
        quote.constructor.name === "AsyncFunction" || execute.constructor.name === "AsyncFunction") return { status: "rejected", reason: "invalid-purchase" };
    if (ns.getHostname() !== "home") return { status: "rejected", reason: "home-only" };
    const epoch = resetEpoch(ns.getResetInfo());
    if (!epoch) return { status: "blocked", reason: "unknown-epoch" };
    let ledger = parse(ns.read(BUDGET_LEDGER));
    if (ledger === false || (ledger && (ledger.schemaVersion !== 1 || !Array.isArray(ledger.receipts) ||
        !Number.isSafeInteger(ledger.revision) || ledger.revision < 0 || ledger.revision >= Number.MAX_SAFE_INTEGER ||
        typeof ledger.resetEpoch !== "string" || (ledger.keyed !== undefined &&
            (!Array.isArray(ledger.keyed) || ledger.keyed.some(x => !x || typeof x.key !== "string" || !OWNERS.has(x.owner)))))))
        return { status: "blocked", reason: "invalid-ledger" };
    if (!ledger || ledger.resetEpoch !== epoch) ledger = { schemaVersion: 1, resetEpoch: epoch, revision: 0, active: null, receipts: [], keyed: [] };
    if (!Array.isArray(ledger.keyed)) ledger.keyed = [];
    if (key != null) {
        if (typeof key !== "string" || !key.length || key.length > 160) return { status: "rejected", reason: "invalid-key" };
        const previous = ledger.keyed.find(x => x.key === key);
        if (previous) return previous.owner === owner && previous.target === target ? { ...previous, replay: true } : { status: "rejected", reason: "key-conflict" };
        if (ledger.keyed.length >= 1024) return { status: "blocked", reason: "key-retention-full" };
    }
    if (ledger.active) return { status: "blocked", reason: "outcome-unknown", grant: ledger.active };
    let cost;
    try { cost = quote(); } catch (error) { return { status: "rejected", reason: "quote-failed", error: String(error) }; }
    if (!Number.isFinite(cost) || cost <= 0 || !(limit >= 0) || cost > limit) return { status: "rejected", reason: "invalid-or-over-limit-price" };
    const allowance = spendingAllowance(ns, owner, target);
    if (cost > allowance) return { status: "deferred", reason: "budget", cost, allowance };
    const before = ns.getServerMoneyAvailable("home");
    const grant = { id: `${epoch}:${++ledger.revision}`, key, owner, target, cost, before, pid: ns.pid, updated: Date.now(), phase: "executing" };
    ledger.active = grant;
    try { persist(ns, BUDGET_LEDGER, ledger); }
    catch (error) { return { status: "blocked", reason: "intent-write-failed", error: String(error) }; }
    let result, error = null;
    try { result = execute(); } catch (e) { error = String(e); }
    const after = ns.getServerMoneyAvailable("home");
    const debit = before - after;
    const tolerance = Math.max(1e-6, cost * 1e-10, Number.EPSILON * Math.max(Math.abs(before), Math.abs(after)) * 4);
    // A true native return plus the immediate cash delta is evidence of this
    // purchase. A control plan still verifies its own higher-level postcondition.
    const status = !error && !result?.then && Boolean(result) && Math.abs(debit - cost) <= tolerance ? "spent"
        : !result?.then && Math.abs(debit) <= tolerance ? "failed" : "outcome-unknown";
    const receipt = { ...grant, phase: undefined, status, after, debit, error };
    if (status === "outcome-unknown") ledger.active = { ...grant, status, after, error };
    else ledger.active = null;
    ledger.receipts = [...ledger.receipts, receipt].slice(-128);
    if (key != null) ledger.keyed.push(receipt);
    try {
        persist(ns, BUDGET_LEDGER, ledger);
        ns.write(JOURNAL, `${JSON.stringify(receipt)}\n`, "a");
    } catch (e) { return { ...receipt, status: "outcome-unknown", reason: "receipt-write-failed", error: String(e) }; }
    return receipt;
}
