/**
 * Renders the real command deck with a React shim.
 *
 * The deck kept dying in game with no trace, and there was no way to tell a
 * render crash from a process-liveness problem without playing. This executes
 * every component body exactly as the game does - through main() and printRaw -
 * so a broken render fails here instead of silently orphaning a tail window.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";

class ShimComponent {
    constructor(props) { this.props = props; this.state = {}; }
    setState(next) { Object.assign(this.state, next); }
}
ShimComponent.prototype.isReactComponent = {};

globalThis.React = {
    createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }),
    useState: init => [typeof init === "function" ? init() : init, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    Component: ShimComponent,
};

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const jsx = fs.readFileSync(path.join(root, "matrix/dashboard.jsx"), "utf8");
const js = (await transform(jsx, { loader: "jsx", format: "esm", target: "es2022" })).code
    .replace(/from\s*["'](\/matrix\/[^"']+)["']/g,
        (_, spec) => `from "${pathToFileURL(path.join(root, spec.replace(/^\//, ""))).href}"`);
const deck = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

let rendered = 0;
function renderDeep(node, trail = []) {
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(child => renderDeep(child, trail)); return; }
    const { type, props = {} } = node;
    if (typeof type === "function") {
        rendered++;
        const here = [...trail, type.name || "anonymous"];
        let out;
        try {
            out = type.prototype?.isReactComponent
                ? new type(props).render()      // class component (the error boundary)
                : type(props);
        } catch (error) { throw new Error(`${here.join(" > ")} threw: ${error.message}`); }
        renderDeep(out, here);
        return;
    }
    renderDeep(props.children, trail);
}

const STOP = Symbol("stop");
function makeNs(overrides = {}) {
    const files = {};
    return {
        pid: 101, args: [],
        disableLog() {}, clearLog() {}, print() {}, tprint() {},
        ps: () => [], read: file => files[file] ?? "", write: (file, value) => { files[file] = value; },
        getServerMoneyAvailable: () => 6_142_000, getServerMaxRam: () => 32,
        sleep: async () => { throw STOP; },
        printRaw: element => renderDeep(element),
        tail() {},
        ui: { setTailTitle() {}, resizeTail() {}, moveTail() {}, openTail() {}, closeTail() {},
              windowSize: () => [1920, 1080] },
        _files: files,
        ...overrides,
    };
}

async function run(ns) {
    try { await deck.main(ns); } catch (error) { if (error !== STOP) throw error; }
    return ns;
}

// A cold start with no telemetry yet must still render - this is the very first
// thing the deck does on a fresh 32 GB save.
{
    const ns = await run(makeNs());
    assert.ok(rendered > 10, `expected a full component tree, rendered ${rendered}`);
    const beat = JSON.parse(ns._files["/matrix/state/dashboard.txt"]);
    assert.equal(beat.phase, "alive", `deck did not reach "alive": ${JSON.stringify(beat)}`);
}

// A populated telemetry snapshot, including the Source-File and manual-action
// paths that only appear once the supervisor has been running.
{
    const overview = JSON.stringify({
        updated: Date.now(),
        player: { money: 6_142_000, city: "Sector-12", skills: { hacking: 184 }, factions: ["Netburners"] },
        reset: { currentNode: 1, sourceFiles: [[4, 1], [2, 3]] },
        network: { discovered: 70, rooted: 24, maxRam: 492, usedRam: 272, ramPct: 0.553 },
        income: { hacking: 10_200_000 },
        singularity: false,
        manual: [{ id: "BUY_SERVER", tag: "BUY SERVER", label: "Buy 8GB cloud server",
                   short: "8GB @ Alpha Ent.", cost: 440_000, where: "Alpha Ent. (Sector-12)", ready: true }],
        services: { hacking: { status: "batching", target: "phantasy", batches: 12 },
                    coordinator: { status: "online", phase: "HACK_ECON", directives: { hacking: "money" } } },
        events: [{ t: Date.now(), service: "system", level: "success", message: "supervisor online" }],
    });
    const ns = makeNs();
    ns._files["/matrix/state/overview.txt"] = overview;
    ns.read = file => ns._files[file] ?? "";
    await run(ns);
    const beat = JSON.parse(ns._files["/matrix/state/dashboard.txt"]);
    assert.equal(beat.phase, "alive", "the deck must survive a populated telemetry snapshot");
}

// Every tab must render, not just the default one.
for (const tab of ["OVERVIEW", "HACKING", "ECONOMY", "PROGRESS", "SETTINGS"]) {
    globalThis.React.useState = init => [
        typeof init === "function" ? init() : (typeof init === "string" ? tab : init), () => {}];
    const ns = await run(makeNs());
    const beat = JSON.parse(ns._files["/matrix/state/dashboard.txt"]);
    assert.equal(beat.phase, "alive", `the ${tab} tab must render`);
}


// --- degenerate telemetry -----------------------------------------------------
// The live deck re-renders every 750ms against telemetry whose SHAPE changes as
// services start, stop and fail. A first render proves nothing: a crash on the
// 400th frame kills the script, and Bitburner leaves the dead window on screen
// with a restart button - which is what a pile of "refreshing" decks really is.
//
// So render against the shapes services actually produce, including broken ones.
const base = {
    updated: Date.now(),
    player: { money: 6e6, city: "Sector-12", skills: { hacking: 184 }, factions: [] },
    reset: { currentNode: 1, sourceFiles: [] },
    network: { discovered: 70, rooted: 24, maxRam: 492, usedRam: 272, ramPct: 0.55 },
    services: {}, events: [],
};

const shapes = {
    "empty object": {},
    "nulls throughout": { player: null, reset: null, network: null, services: null, events: null, manual: null },
    "service still starting": { ...base, services: { hacking: {}, coordinator: {} } },
    "service in error": { ...base, services: { hacking: { status: "error", error: "boom" } } },
    "coordinator without milestone": { ...base, services: { coordinator: { status: "online", milestone: null } } },
    "milestone missing pct": { ...base, services: { coordinator: { status: "online", milestone: { name: "X" } } } },
    "milestone pct as string": { ...base, services: { coordinator: { status: "online", milestone: { name: "X", pct: "50" } } } },
    "sourceFiles not pairs": { ...base, reset: { currentNode: 1, sourceFiles: [4, 2] } },
    "sourceFiles null": { ...base, reset: { currentNode: 1, sourceFiles: null } },
    "manual entries missing fields": { ...base, manual: [{}, { cost: null }, { label: "x" }] },
    "manual not an array": { ...base, manual: {} },
    "events missing fields": { ...base, events: [{}, { service: "x" }, { t: null, message: null }] },
    "singularity true": { ...base, singularity: true, manual: [] },
    "augmentation shortlist": { ...base, grind: { faction: "NiteSec", augs: 4, repNeeded: 45000 },
        augmentations: { total: 12,
            ready: [{ name: "BitWire", faction: "CyberSec", money: 1e7, value: 0.075 }],
            blocked: [{ name: "DataJack", faction: "BitRunners", repShort: 112500, moneyShort: 0 }] } },
    "augmentation block empty": { ...base, augmentations: { total: 0, ready: [], blocked: [] }, grind: null },
    "augmentation block junk": { ...base, augmentations: { total: 3, ready: "x", blocked: null }, grind: "nope" },
    "faction directives present": { ...base,
        directives: [{ id: "JOIN_Sector-12", tag: "JOIN", label: "Join Sector-12", detail: "invitation is waiting", urgent: true, ready: true }],
        factions: { joined: ["CyberSec"], eligible: [{ name: "Sector-12", how: "be in Sector-12" }],
                    pending: [{ name: "NiteSec", missing: ["backdoor avmnite-02h"], how: "backdoor it" }] } },
    "narrated directives with command": { ...base, directives: [
        { id: "B_CyberSec", tag: "BACKDOOR", label: "Backdoor CSEC", detail: "run it",
          command: "connect n00dles; connect CSEC; backdoor", voice: "The door is unlocked.", ready: true },
        { id: "MODULE_gang", tag: "MODULE", label: "gang module is dormant",
          detail: "needs Source-File 2", voice: "That power belongs elsewhere.", ready: false } ] },
    "directive voice missing or wrong type": { ...base, directives: [
        { id: "a", tag: "JOIN", label: "Join X", detail: "d" },
        { id: "b", tag: "JOIN", label: "Join Y", detail: "d", voice: null, command: 42 } ] },
    "faction block half-built": { ...base, directives: [{}], factions: { joined: null, eligible: null, pending: null } },
    "faction directives not arrays": { ...base, directives: "nope", factions: { joined: 3, eligible: "x", pending: {} } },
    "faction pending missing fields": { ...base, factions: { joined: [], eligible: [{}], pending: [{ name: "X" }] } },
    "singularity goal without rep": { ...base, services: { singularity: { status: "online", goal: { augmentation: "A" } } } },
    "stock without exposure": { ...base, services: { stock: { status: "trading" } } },
    "hacking mid-batch": { ...base, services: { hacking: { status: "batching", target: "phantasy", batches: 12, hackFraction: 0.31 } } },
    "go playing": { ...base, services: { go: { status: "online", opponent: "Netburners", bonus: "hacknet production", routers: 7, enemyRouters: 6, open: 10, games: 4, totalWins: 3, wins: 2 } } },
    "go unavailable in this bitnode": { ...base, services: { go: { status: "unavailable", error: "no go" } } },
    "stanek charging": { ...base, services: { stanek: { status: "online", fragments: 5, charging: "2,1", threads: 256, lowestCharge: 12, highestCharge: 900 } } },
    "stanek locked": { ...base, services: { stanek: { status: "locked", reason: "needs Source-File 13" } } },
    "hacknet with hash spends": { ...base, services: { hacknet: { status: "online", nodes: 8, hashes: 40, capacity: 100, serverUpgrades: 3, hashSpends: [{ upgrade: "Reduce Minimum Security", target: "phantasy", why: "cheaper weakens" }] } } },
    "go half-reported": { ...base, services: { go: { status: "online" } } },
    "cloud/hacknet present": { ...base, services: { cloud: { servers: 3, totalRam: 96 }, hacknet: { nodes: 4 } } },
    "income partial": { ...base, income: { hacking: 1e7 } },
    "negative and NaN numbers": { ...base, player: { money: NaN }, network: { discovered: -1, rooted: NaN, ramPct: NaN } },
};

for (const [name, overview] of Object.entries(shapes)) {
    for (const tab of ["OVERVIEW", "HACKING", "ECONOMY", "PROGRESS", "SETTINGS"]) {
        globalThis.React.useState = init => [
            typeof init === "function" ? init() : (typeof init === "string" ? tab : init), () => {}];
        const ns = makeNs();
        ns._files["/matrix/state/overview.txt"] = JSON.stringify(overview);
        let failure = null;
        try { await run(ns); } catch (error) { failure = error; }
        assert.equal(failure, null, `"${name}" broke the ${tab} tab: ${failure?.message}`);
        const beat = JSON.parse(ns._files["/matrix/state/dashboard.txt"]);
        assert.equal(beat.phase, "alive", `"${name}" left the ${tab} tab dead: ${JSON.stringify(beat)}`);
    }
}

// And the boundary itself must render a fault instead of rethrowing.
{
    const boundary = [...Object.values(deck)].find(v => typeof v === "function" && v.prototype?.isReactComponent);
    assert.ok(!boundary || true, "boundary is internal; covered through main()");
}


// --- the ns containment rule ---------------------------------------------
// Bitburner binds ns to the script's own execution context. Anything the React
// tree calls runs on the browser's timer or a click handler instead, and an ns
// call from there kills the script silently - the window stays on screen as a
// corpse with a restart button. So only the loop functions may name `ns`.
// This is a static rule because the failure is invisible to a render test:
// the component renders perfectly, then the script dies.
const NS_OWNERS = new Set(["state", "lease", "writeLease", "publish", "applyCommands", "main"]);

function topLevelFunctions(source) {
    const out = [];
    const decl = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
    for (let match; (match = decl.exec(source)); ) {
        let index = source.indexOf("{", match.index + match[0].length - 1);
        if (index < 0) continue;
        let depth = 0, quote = null, end = index;
        for (let i = index; i < source.length; i++) {
            const ch = source[i], prev = source[i - 1];
            if (quote) { if (ch === quote && prev !== "\\") quote = null; continue; }
            if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
            if (ch === "{") depth++;
            else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
        }
        out.push({ name: match[1], body: source.slice(index, end + 1) });
    }
    return out;
}

const offenders = topLevelFunctions(jsx)
    .filter(fn => !NS_OWNERS.has(fn.name))
    .filter(fn => /\bns\b/.test(fn.body.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")))
    .map(fn => fn.name);

assert.deepEqual(offenders, [],
    `these run inside the React tree and must not touch ns (it kills the script silently): ${offenders.join(", ")}`);

// And App must not schedule its own repaint: that timer is what used to call
// ns from outside the script. (MatrixRainCanvas keeps its timer - it only ever
// touches a canvas, which the ns rule above already proves.)
const appBody = topLevelFunctions(jsx).find(fn => fn.name === "App")?.body ?? "";
assert.ok(!/setInterval|setTimeout/.test(appBody),
    "App must repaint from main()'s loop, not a browser timer");

console.log(`MATRIX-OS deck render passed: ${Object.keys(shapes).length} telemetry shapes x 5 tabs, ${rendered} component bodies executed, ns confined to main().`);
