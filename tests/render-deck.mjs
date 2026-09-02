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

globalThis.React = {
    createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }),
    useState: init => [typeof init === "function" ? init() : init, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
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
        try { out = type(props); }
        catch (error) { throw new Error(`${here.join(" > ")} threw: ${error.message}`); }
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

console.log(`MATRIX-OS deck render passed: every tab renders, ${rendered} component bodies executed.`);
