import assert from "node:assert/strict";
import fs from "node:fs";
import {
    easyPasswordCandidates,
    mergeDarknetMessage,
    parseWorkerMessage,
    summarizeDetails,
} from "../matrix/lib/darknet.js";

assert.deepEqual(easyPasswordCandidates({ modelId: "ZeroLogon", passwordLength: 0 }), [""]);
assert.equal(easyPasswordCandidates({
    modelId: "DeskMemo_3.1",
    passwordHint: "The secret is 7319",
}).at(0), "7319");
assert.equal(easyPasswordCandidates({
    modelId: "CloudBlare(tm)",
    data: "1╬2/[]3-4",
}).at(0), "1234");
assert.equal(easyPasswordCandidates({
    modelId: "Pr0verFl0",
    passwordLength: 6,
}).at(0), "A".repeat(12));
assert.equal(easyPasswordCandidates({ modelId: "PrimeTime 2", data: "13195" }).at(0), "29");
assert.equal(easyPasswordCandidates({ modelId: "BellaCuore", data: "MCMXCIV" }).at(0), "1994");
assert.equal(easyPasswordCandidates({
    modelId: "110100100",
    data: "01001000 01101001",
}).at(0), "Hi");
assert.equal(easyPasswordCandidates({ modelId: "OctantVoxel", data: "16,FF" }).at(0), "255");
assert.equal(easyPasswordCandidates({ modelId: "MathML", data: "4+5*(6+7)/2" }).at(0), "36.5");
assert.equal(easyPasswordCandidates({
    modelId: "MathML",
    data: "(ns.exit(),4+5)",
}).length, 0, "code-like expression hints must never be evaluated automatically");

const encrypted = "ABC";
const masks = [1, 2, 3];
const encoded = encrypted.split("").map((char, i) => String.fromCharCode(char.charCodeAt(0) ^ masks[i])).join("");
assert.equal(easyPasswordCandidates({
    modelId: "OrdoXenos",
    data: `${encoded};${masks.map(value => value.toString(2).padStart(8, "0")).join(" ")}`,
}).at(0), encrypted);

assert.deepEqual(
    easyPasswordCandidates({ modelId: "FreshInstall_1.0" }).slice(0, 4),
    ["admin", "password", "0000", "12345"],
);
assert.deepEqual(
    easyPasswordCandidates({ modelId: "Laika4" }).slice(0, 4),
    ["fido", "spot", "rover", "max"],
);

const details = summarizeDetails("node", {
    modelId: "TopPass",
    passwordHint: "It's a common password",
    passwordLength: 8,
    difficulty: 3,
    depth: 2,
    isOnline: true,
});
assert.equal(details.host, "node");
assert.equal(details.modelId, "TopPass");
assert.equal(details.depth, 2);
assert.equal(details.isOnline, true);

assert.deepEqual(parseWorkerMessage(JSON.stringify({ type: "visit", host: "darkweb" })), {
    type: "visit", host: "darkweb",
});
assert.equal(parseWorkerMessage("garbage"), null);

let state = mergeDarknetMessage({}, { type: "discovered", host: "a", modelId: "ZeroLogon", at: 10 }, 10);
state = mergeDarknetMessage(state, { type: "auth-success", host: "a", password: "", at: 20 }, 20);
state = mergeDarknetMessage(state, { type: "cache-opened", host: "a", file: "vault.cache", at: 30 }, 30);
assert.equal(state.nodes.a.authenticated, true);
assert.equal(state.authenticated, 1);
assert.equal(state.cacheOpened, 1);
assert.equal(state.events.length, 3);

const workerSource = fs.readFileSync("matrix/workers/darknet-node.js", "utf8");
const serviceSource = fs.readFileSync("matrix/services/darknet.js", "utf8");
for (const dangerous of ["freezeServer(", "unleashStormSeed(", "setStasisLink(", "memoryReallocation("]) {
    assert.equal(workerSource.includes(dangerous), false, `worker must not use dangerous/expansion API ${dangerous}`);
    assert.equal(serviceSource.includes(dangerous), false, `controller must not use dangerous/expansion API ${dangerous}`);
}
assert.match(workerSource, /ns\.dnet\.probe\s*\(/);
assert.match(workerSource, /ns\.dnet\.authenticate\s*\(/);
assert.match(workerSource, /ns\.dnet\.openCache\s*\(/);
assert.match(workerSource, /ns\.dnet\.heartbleed\s*\(/);

console.log("MATRIX Darknet helpers passed: safe deterministic solvers, state merge, bounded explorer safety guards.");
