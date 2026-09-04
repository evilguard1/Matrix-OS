import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("matrix/services/darknet.js", "utf8");

assert.match(source, /const WORKER_DEPTH_OFFSET = 3;/,
    "controller must keep Darknet worker depths strictly positive");
assert.match(source, /const WORKER_SEED_DEPTH = 1;/,
    "controller seed must never pass numeric depth zero to the current worker");
assert.match(source, /const MAX_LOGICAL_DEPTH = 9;/,
    "logical depth must stay within the worker's internal maxDepth=12 after offsetting");
assert.match(source, /const workerMaxDepth = maxDepth \+ WORKER_DEPTH_OFFSET;/,
    "logical max depth must be translated into the positive worker depth domain");
assert.match(source, /"--depth", WORKER_SEED_DEPTH/,
    "seed launch must use the nonzero encoded depth");
assert.match(source, /"--max-depth", workerMaxDepth/,
    "seed launch must pass the offset max depth");
assert.doesNotMatch(source, /"--depth",\s*-1/,
    "controller must not reintroduce the zero-depth parser path through a -1 seed");

console.log("MATRIX Darknet depth controller passed: logical bounds map to a strictly-positive worker depth domain.");
