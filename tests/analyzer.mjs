/**
 * The RAM analyzer's own correctness.
 *
 * Every stage budget in this project is derived from these numbers, so an
 * analyzer that under-reports ships a script the game will refuse to run, and
 * one that over-reports gates a module out of a stage it would have fitted.
 * The DOM charge is the expensive case: 25 GB, on a bare identifier.
 */
import assert from "node:assert/strict";
import { scriptRam, NAMESPACE_COST, DOM_COST } from "../tests/ram-budget.mjs";

const charged = code => scriptRam(code).used.includes("<dom>");

// Real references the game bills for. A trailing dot is NOT required: Bitburner
// charges for naming window or document at all.
for (const code of [
    `typeof document === "undefined" ? null : document;`,
    `const d = window;`,
    `document.querySelectorAll("button")`,
    `f(window)`,
    `window.innerWidth`,
    `const {body} = document;`,
    `return document`,
]) assert.equal(charged(code), true, `must charge DOM: ${code}`);

// Prose is not code. Comments and JSX text mentioning these words must not add
// 25 GB - that would have re-flagged the command deck, which touches neither.
for (const code of [
    `// killing a script leaves the window on screen`,
    `<div>a dead window behind</div>`,
    `const s = "check the document for details";`,
    `foo.document`,
    `windowSize()`,
    `documentation()`,
]) assert.equal(charged(code), false, `must NOT charge DOM: ${code}`);

assert.equal(DOM_COST, 25);

// The Go namespace: the free calls really are free, or an IPvGO module looks
// four times its true size.
for (const [fn, cost] of [["makeMove", 4], ["getBoardState", 4], ["getValidMoves", 8],
                          ["getChains", 16], ["getLiberties", 16],
                          ["passTurn", 0], ["getGameState", 0], ["getOpponent", 0],
                          ["getMoveHistory", 0], ["resetBoardState", 0], ["opponentNextTurn", 0]]) {
    assert.equal(NAMESPACE_COST.go(fn), cost, `go.${fn} should cost ${cost}`);
}

// Base cost sanity: an empty script is the 1.6 GB baseline, nothing more.
assert.equal(scriptRam("").ram, 1.6);

console.log("MATRIX-OS analyzer passed: DOM charged on identifiers and only identifiers, go costs exact.");
