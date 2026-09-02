/**
 * Every pure library function must degrade, not throw.
 *
 * The same bug has now been found five separate times in this project, always
 * the same shape:
 *
 *     function f(state = {}) { return state.x; }   //  f(null) throws
 *
 * A parameter default fires only on `undefined`. Every one of these functions is
 * called with data read from a state file that another service wrote, and a
 * stale, half-written or older-version file supplies `null` and empty objects
 * routinely. In game the throw lands inside a service loop or a React render,
 * where it kills the script rather than printing anything useful.
 *
 * `Number(null)` being `0` - and `0` being finite - is the same trap wearing a
 * different hat, and it silently zeroed every spending budget.
 *
 * So: call everything exported from every pure lib with hostile arguments and
 * require that it returns rather than throws.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const libDir = path.join(root, "matrix/lib");

// Libraries that take an `ns` and therefore cannot be called without a game.
const NEEDS_NS = new Set(["common.js", "network.js", "dispatch.js", "hud.js", "singleton.js", "solvers.js"]);

const HOSTILE = [
    [], [null], [undefined], [{}], [null, null], [{}, {}],
    [[]], [""], [0], [NaN], [{ x: null }, { y: null }],
    [null, { limit: 1 }], [{ factions: null, owned: null, skills: null }],
];

let checked = 0;
const files = fs.readdirSync(libDir).filter(f => f.endsWith(".js") && !NEEDS_NS.has(f));
assert.ok(files.length >= 5, `expected several pure libs, found ${files.length}`);

for (const file of files) {
    const module = await import(pathToFileURL(path.join(libDir, file)).href);
    for (const [name, value] of Object.entries(module)) {
        if (typeof value !== "function") continue;
        // Class components and constructors are not called this way.
        if (/^[A-Z]/.test(name)) continue;
        for (const args of HOSTILE) {
            let threw = null;
            try { value(...args); } catch (error) { threw = error; }
            assert.equal(threw, null,
                `${file} -> ${name}(${args.map(a => JSON.stringify(a)).join(", ")}) threw: ${threw?.message}\n` +
                `   a parameter default only fires on undefined - guard with (x ?? {}) instead`);
            checked++;
        }
    }
}

console.log(`MATRIX-OS robustness passed: ${checked} hostile calls across ${files.length} pure libraries, none threw.`);
