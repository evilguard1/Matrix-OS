/**
 * The operator's voice.
 *
 * Flavour is allowed to be flavour, but it must never cost the player the
 * actual instruction, and it must never change between frames - a line that
 * re-rolls every 750ms makes the deck flicker and the panel unreadable.
 */
import assert from "node:assert/strict";
import { speak, narrate, moduleDirectives, MODULE_LOCKS } from "../matrix/lib/voice.js";

// --- deterministic -----------------------------------------------------------
const sample = { id: "JOIN_Sector-12", tag: "JOIN", label: "Join Sector-12", ready: true };
assert.equal(speak(sample), speak(sample), "the same directive must say the same thing");
assert.equal(speak(sample), speak({ ...sample }), "identity must come from the id, not the object");

// Different directives should not all say the same thing.
const voices = new Set(["JOIN_Sector-12", "JOIN_Netburners", "JOIN_CyberSec", "JOIN_Daedalus"]
    .map(id => speak({ id, tag: "JOIN" })));
assert.ok(voices.size > 1, "the same tag on different targets should vary");

// --- a ready action and a blocked one must not sound the same ----------------
const ready = speak({ id: "BACKDOOR_CyberSec", tag: "BACKDOOR", ready: true });
const locked = speak({ id: "BACKDOOR_CyberSec", tag: "BACKDOOR", ready: false });
assert.notEqual(ready, locked, "'do this now' and 'here is why you cannot' are different messages");

// --- every tag the system emits has a voice ----------------------------------
for (const tag of ["JOIN", "BACKDOOR", "UNLOCK", "CREATE", "PROGRAM", "BUY SERVER", "HOME RAM", "MODULE", "TOR", "AUGMENT", "REPUTATION"]) {
    const line = speak({ id: `x_${tag}`, tag });
    assert.ok(line && line.length > 10, `${tag} has no voice`);
}
// An unknown tag still says something rather than rendering blank.
assert.ok(speak({ id: "?", tag: "NOT_A_TAG" }).length > 0);
assert.ok(speak({}).length > 0, "a directive with no tag at all must not produce an empty line");

// --- narrate must not destroy the instruction --------------------------------
// This is the whole contract: the flavour is added, never substituted.
const input = [{ id: "BACKDOOR_CyberSec", tag: "BACKDOOR", label: "Backdoor CSEC",
                 detail: "run: connect CSEC; backdoor", command: "connect CSEC; backdoor", ready: true }];
const [out] = narrate(input);
assert.equal(out.label, "Backdoor CSEC", "label preserved");
assert.equal(out.detail, "run: connect CSEC; backdoor", "the concrete detail must survive");
assert.equal(out.command, "connect CSEC; backdoor", "the command must survive");
assert.ok(out.voice.length > 0, "and the voice is added alongside it");
assert.deepEqual(narrate([]), []);
assert.deepEqual(narrate(null), [], "junk in must not throw");
assert.deepEqual(narrate([null, undefined]), [], "empty entries are dropped, not narrated");

// --- dormant modules ---------------------------------------------------------
// With no Source-Files, everything MATRIX is holding back should be explained.
const none = moduleDirectives([], { limit: 99 });
assert.equal(none.length, Object.keys(MODULE_LOCKS).length, "every locked module must be reported");
for (const directive of none) {
    assert.match(directive.detail, /Source-File \d+/, "each must name the Source-File it needs");
    assert.match(directive.detail, /BitNode \d+/, "and how to earn it");
    assert.equal(directive.ready, false);
}
// Owning SF4 must silence both modules that depend on it, and nothing else.
const withSF4 = moduleDirectives([[4, 1]], { limit: 99 }).map(d => d.id);
assert.ok(!withSF4.includes("MODULE_singularity"), "SF4 releases singularity");
assert.ok(!withSF4.includes("MODULE_progression"), "SF4 releases progression too");
assert.ok(withSF4.includes("MODULE_gang"), "but not gang, which needs SF2");
// Accept the {n, lvl} shape and bare numbers as well as [n, lvl] pairs.
assert.ok(!moduleDirectives([{ n: 2, lvl: 1 }], { limit: 99 }).map(d => d.id).includes("MODULE_gang"));
assert.ok(!moduleDirectives([2], { limit: 99 }).map(d => d.id).includes("MODULE_gang"));
for (const junk of [null, "nope", [null], [{}], [NaN]]) {
    assert.doesNotThrow(() => moduleDirectives(junk), `moduleDirectives threw on ${JSON.stringify(junk)}`);
}

console.log(`MATRIX-OS voice passed: ${Object.keys(MODULE_LOCKS).length} dormant modules explained, every line deterministic.`);
