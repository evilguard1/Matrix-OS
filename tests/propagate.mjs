/**
 * Keeping the network's copy of MATRIX current.
 *
 * Every deploy site used to copy a worker only when it was missing, so a server
 * kept whatever version it first received - forever. After an update home ran
 * new code and the rest of the network ran old code, with nothing to show for
 * it on any dashboard. These tests pin the detection that fixes it.
 */
import assert from "node:assert/strict";
import { stampFile, staleHosts, sweepNeeded, residentScripts, REMOTE_FILES } from "../matrix/lib/propagate.js";

// --- the stamp is the whole detection mechanism ------------------------------
// There is no way to read a remote file's CONTENTS, so the version has to live
// in the filename for a single fileExists to answer the question.
assert.equal(stampFile("1.4.0"), "/matrix/build-1.4.0.txt");
assert.notEqual(stampFile("1.4.0"), stampFile("1.4.1"), "different builds must not collide");
// A stamp is a filename, so anything path-like in a version string is stripped.
assert.equal(stampFile("../../evil"), "/matrix/build-....evil.txt");
// Check the version segment itself, not the whole path - "/matrix/build-" of
// course contains a slash.
const segment = name => name.replace("/matrix/build-", "").replace(".txt", "");
assert.ok(!segment(stampFile("a/b")).includes("/"), "a slash must never survive into the version segment");
assert.equal(segment(stampFile("a/b")), "ab");
assert.ok(!segment(stampFile("../../evil")).includes("/"));
assert.equal(stampFile(""), "/matrix/build-unknown.txt");
assert.equal(stampFile(null), "/matrix/build-unknown.txt");
assert.equal(stampFile(undefined), "/matrix/build-unknown.txt");

// --- which hosts need refreshing ---------------------------------------------
const network = ["home", "n00dles", "foodnstuff", "sigma-cosmetics", "joesguns", "phantasy"];
{
    const behind = new Set(["foodnstuff", "phantasy"]);
    const stale = staleHosts(network, host => !behind.has(host));
    assert.deepEqual(stale, ["foodnstuff", "phantasy"], "only hosts without the stamp are refreshed");
}
// Home is never swept - it is where the files come from.
assert.deepEqual(staleHosts(network, () => false, { limit: 99 }).includes("home"), false);
// A fully current network costs nothing.
assert.deepEqual(staleHosts(network, () => true), []);

// The sweep is bounded, so one cycle cannot stall the supervisor: a host that
// waits a cycle is simply current a few seconds later.
{
    const many = Array.from({ length: 200 }, (_, i) => `srv-${i}`);
    assert.equal(staleHosts(many, () => false, { limit: 12 }).length, 12);
    assert.equal(staleHosts(many, () => false, { limit: 1 }).length, 1);
    assert.equal(staleHosts(many, () => false, { limit: 0 }).length, 1, "a zero limit still makes progress");
}

// A failing check must not strand the sweep - treat an unreadable host as
// current and move on rather than throwing inside the supervisor loop.
assert.doesNotThrow(() => staleHosts(network, () => { throw new Error("no such server"); }));
assert.deepEqual(staleHosts(network, () => { throw new Error("boom"); }), []);
assert.deepEqual(staleHosts(network, null), [], "no checker means no sweep, not a crash");
for (const junk of [null, undefined, "nope", [null, 5, ""], [{}]]) {
    assert.doesNotThrow(() => staleHosts(junk, () => false));
}
assert.doesNotThrow(() => staleHosts(network, () => false, null));

// --- skip the sweep entirely when nothing changed ----------------------------
assert.equal(sweepNeeded("1.4.0", "1.3.0"), true, "a new build must sweep");
assert.equal(sweepNeeded("1.4.0", "1.4.0"), false, "an unchanged build must not");
assert.equal(sweepNeeded("1.4.0", null), true, "never swept means sweep");
assert.equal(sweepNeeded("", "1.4.0"), false, "an unknown current version must not trigger a sweep");
assert.equal(sweepNeeded(null, null), false);
assert.equal(sweepNeeded(" 1.4.0 ", "1.4.0"), false, "whitespace is not a version change");

// --- what actually gets copied -----------------------------------------------
const paths = REMOTE_FILES.map(f => f.path);
assert.equal(new Set(paths).size, paths.length, "no duplicate files in the payload");
for (const file of REMOTE_FILES) {
    assert.ok(file.path.startsWith("/matrix/"), `${file.path} is not a MATRIX path`);
    assert.equal(typeof file.resident, "boolean", `${file.path} must declare whether it is long-running`);
}
// The distinction matters: a running script keeps the code it started with, so
// copying over a long-running worker changes nothing until it is restarted.
const resident = residentScripts();
assert.ok(resident.includes("/matrix/worm/drone.js"), "drones run forever and must be restarted on update");
assert.ok(resident.includes("/matrix/workers/share.js"));
assert.ok(!resident.includes("/matrix/workers/hack.js"),
    "one-shot workers exit on their own - killing them would waste the batch in flight");
assert.ok(!resident.includes("/matrix/lib/earlyloop.js"), "a library is not a process");

console.log(`MATRIX-OS propagate passed: ${REMOTE_FILES.length} remote files, ${resident.length} of them resident, staleness detected by stamped filename.`);
