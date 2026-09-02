/**
 * Blackjack basic strategy, checked against the standard table.
 *
 * There is real money behind every one of these decisions, so each case below
 * is a hand with a known correct play rather than a spot check.
 */
import assert from "node:assert/strict";
import { cardValue, handValue, decide, readCards, readable } from "../matrix/lib/blackjack.js";

// --- card values -------------------------------------------------------------
assert.equal(cardValue("A"), 11);
assert.equal(cardValue("K"), 10);
assert.equal(cardValue("10"), 10);
assert.equal(cardValue("10 of Hearts"), 10, "10 must not be read as a 1");
assert.equal(cardValue("7 of Spades"), 7);
assert.equal(cardValue("King"), 10, "spelled-out ranks parse");
assert.equal(cardValue("garbage"), 0, "an unreadable card scores nothing rather than guessing");
// Matching on the first character alone would make every one of these a face
// card, and MATRIX would bet real money on the misread.
for (const junk of ["junk", "Jitter", "Queue", "Alpha", "Kilo", ""]) {
    assert.equal(cardValue(junk), 0, `"${junk}" must not read as a card`);
}
assert.equal(cardValue(null), 0);

// --- ace demotion ------------------------------------------------------------
assert.deepEqual(pick(handValue(["A", "7"])), { total: 18, soft: true });
assert.deepEqual(pick(handValue(["A", "7", "5"])), { total: 13, soft: false },
    "the ace drops to 1 once 11 would bust");
assert.deepEqual(pick(handValue(["A", "A", "9"])), { total: 21, soft: true },
    "only as many aces are demoted as necessary");
assert.equal(handValue(["K", "Q", "5"]).busted, true);
assert.equal(handValue(["A", "K"]).blackjack, true);
assert.equal(handValue(["A", "5", "5"]).blackjack, false, "21 on three cards is not a blackjack");
assert.equal(handValue([]).total, 0);
function pick({ total, soft }) { return { total, soft }; }

// --- hard totals -------------------------------------------------------------
assert.equal(decide(["K", "7"], "9"), "stay", "hard 17 always stands");
assert.equal(decide(["K", "6"], "5"), "stay", "hard 16 stands against a bust card");
assert.equal(decide(["K", "6"], "10"), "hit", "hard 16 hits against a ten");
assert.equal(decide(["10", "2"], "4"), "stay", "12 stands against 4-6 only");
assert.equal(decide(["10", "2"], "3"), "hit", "12 hits against 3");
assert.equal(decide(["10", "2"], "10"), "hit");
assert.equal(decide(["5", "4"], "5"), "double", "9 doubles against 3-6");
assert.equal(decide(["5", "4"], "2"), "hit", "9 hits against 2");
assert.equal(decide(["6", "4"], "9"), "double", "10 doubles against 2-9");
assert.equal(decide(["6", "4"], "10"), "hit", "10 hits against a ten");
assert.equal(decide(["6", "5"], "10"), "double", "11 doubles against everything but an ace");
assert.equal(decide(["6", "5"], "A"), "hit", "11 hits against an ace");
assert.equal(decide(["2", "3"], "6"), "hit", "5-8 always hits");

// --- soft totals -------------------------------------------------------------
assert.equal(decide(["A", "8"], "6"), "stay", "soft 19 stands");
assert.equal(decide(["A", "7"], "5"), "double", "soft 18 doubles against 3-6");
assert.equal(decide(["A", "7"], "8"), "stay", "soft 18 stands against 2, 7 and 8");
assert.equal(decide(["A", "7"], "10"), "hit", "soft 18 hits against 9, 10 and A");
assert.equal(decide(["A", "6"], "4"), "double", "soft 17 doubles against 3-6");
assert.equal(decide(["A", "2"], "5"), "double", "soft 13 doubles against 5-6");
assert.equal(decide(["A", "2"], "4"), "hit", "soft 13 hits against 4");

// --- a double that is not allowed must degrade, never become an illegal click -
assert.equal(decide(["6", "5"], "9", { canDouble: false }), "hit", "11 with no double hits");
assert.equal(decide(["A", "7"], "5", { canDouble: false }), "stay", "soft 18 with no double stands");

// --- degenerate input --------------------------------------------------------
assert.equal(decide(["K", "Q", "5"], "9"), "stay", "a busted hand never asks for another card");
assert.equal(decide(["A", "K"], "9"), "stay", "21 never hits");
assert.equal(decide(["K", "7"], null), "stay", "with no dealer card, fall back to the safe threshold");
assert.equal(decide(["5", "4"], null), "hit");
for (const junk of [null, undefined, "x", [null], [{}]]) {
    assert.doesNotThrow(() => decide(junk, junk), `decide threw on ${JSON.stringify(junk)}`);
}

// --- reading the table -------------------------------------------------------
assert.deepEqual(readCards("2 of Hearts King of Spades"), ["2", "K"]);
assert.deepEqual(readCards("10 of Diamonds  Ace of Clubs"), ["10", "A"],
    "spelled-out ranks must parse too - the exact casino wording is unverified");
assert.deepEqual(readCards("Jack of Clubs Queen of Hearts"), ["J", "Q"]);
assert.deepEqual(readCards("nothing here"), []);
assert.deepEqual(readCards(null), []);

// A half-rendered table must never be acted on - that is a real bet on a guess.
assert.equal(readable(["K", "7"], ["9"]), true);
assert.equal(readable(["K"], ["9"]), false, "one player card means the deal is still rendering");
assert.equal(readable(["K", "7"], []), false, "no dealer card means no decision");
assert.equal(readable(["K", "junk"], ["9"]), false, "an unreadable card blocks the round");
assert.equal(readable(null, null), false);

console.log("MATRIX-OS blackjack passed: basic strategy table, ace demotion, and a hard refusal to act on a half-read table.");
