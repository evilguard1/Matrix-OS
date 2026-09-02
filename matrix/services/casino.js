/**
 * The casino - the largest sum of money in the game that needs no Source-File.
 *
 * There is no casino API. The only way in is the DOM, which Bitburner charges
 * 25 GB for, so this module exists only above 256 GB of home RAM and does
 * nothing else with that budget.
 *
 * Two deliberate limits, because this is the one module in MATRIX that cannot
 * be verified against the game from this repo:
 *
 *  1. It does NOT navigate. Travelling to Aevum needs Singularity, and clicking
 *     through the city UI blind is how a DOM script silently does the wrong
 *     thing. The player opens the blackjack table; MATRIX plays it. When the
 *     table is not on screen, it says exactly what to do instead.
 *  2. It refuses to act on a table it cannot fully read. A misparsed hand is a
 *     real bet placed on a guess, so an unreadable round is skipped, not
 *     played - see `readable()` in /matrix/lib/blackjack.js.
 *
 * All the judgement lives in that library and is tested against the standard
 * strategy table. What is here is clicking.
 */
import { config, writeState, event } from "/matrix/lib/common.js";
import { decide, readCards, readable, handValue } from "/matrix/lib/blackjack.js";

const IDLE = 5000;
const BEAT = 350;
// The casino stops taking bets once winnings reach $10b; past that every click
// is wasted, so the module retires itself.
const HOUSE_LIMIT = 10e9;
// If the table cannot be found or read this many times in a row, something has
// changed and blind clicking is the worst possible response.
const CONFUSION_LIMIT = 20;

// Written as a bare `document` on purpose. Reaching it through globalThis would
// hide it from Bitburner's static analysis and run this module for 1.7 GB
// instead of 26.7 - which is not a saving, it is cheating the cost model this
// whole project is built on. The 25 GB is real and is budgeted for.
function dom() {
    return typeof document === "undefined" ? null : document;
}

/** Every button on screen, by trimmed label. */
function buttons() {
    const doc = dom();
    if (!doc) return [];
    return [...doc.querySelectorAll("button")]
        .map(node => ({ node, label: (node.textContent ?? "").trim() }))
        .filter(entry => entry.label);
}

function findButton(label) {
    const wanted = String(label).toLowerCase();
    return buttons().find(entry => entry.label.toLowerCase() === wanted)
        ?? buttons().find(entry => entry.label.toLowerCase().startsWith(wanted));
}

function click(entry) {
    if (!entry?.node || entry.node.disabled) return false;
    entry.node.click();
    return true;
}

/**
 * The blackjack table, if it is on screen. Player and dealer hands are read
 * from the two labelled blocks rather than from the page as a whole, so one
 * hand can never be mistaken for the other.
 */
function readTable() {
    const doc = dom();
    if (!doc) return null;
    const text = doc.body?.innerText ?? "";
    if (!/blackjack/i.test(text)) return null;
    // The two hands are introduced by these labels; split on them so cards are
    // attributed to the right side even when the layout changes around them.
    const playerAt = text.search(/your\s+hand/i);
    const dealerAt = text.search(/(opponent|dealer)'?s?\s+hand/i);
    if (playerAt < 0 || dealerAt < 0) return null;
    const first = Math.min(playerAt, dealerAt);
    const second = Math.max(playerAt, dealerAt);
    const blockA = text.slice(first, second);
    const blockB = text.slice(second);
    const playerText = playerAt < dealerAt ? blockA : blockB;
    const dealerText = playerAt < dealerAt ? blockB : blockA;
    return { player: readCards(playerText), dealer: readCards(dealerText), text };
}

export async function main(ns) {
    ns.disableLog("ALL");
    if (!dom()) {
        await writeState(ns, "casino", { status: "unavailable", reason: "no DOM access" });
        return;
    }

    let confusion = 0;
    let hands = 0;
    const opened = ns.getServerMoneyAvailable("home");

    while (true) {
        try {
            const cfg = config(ns);
            if (cfg.masterEnabled === false || cfg.automation?.casino === false) {
                await writeState(ns, "casino", { status: "paused" });
                await ns.sleep(IDLE);
                continue;
            }

            const won = ns.getServerMoneyAvailable("home") - opened;
            if (won >= HOUSE_LIMIT) {
                await event(ns, "casino", "House limit reached - the casino is done with us", "success");
                await writeState(ns, "casino", { status: "complete", won, hands });
                return;
            }

            const table = readTable();
            if (!table) {
                confusion++;
                await writeState(ns, "casino", {
                    status: "waiting", hands, won, confusion,
                    reason: "blackjack table not on screen - travel to Aevum, enter the Iker Molina Casino and open Blackjack",
                });
                await ns.sleep(IDLE);
                continue;
            }

            // Between hands the table offers a fresh deal rather than actions.
            const start = findButton("start") ?? findButton("play");
            if (!readable(table.player, table.dealer)) {
                if (start && click(start)) { confusion = 0; hands++; await ns.sleep(BEAT); continue; }
                confusion++;
                // Never guess at a half-read table: that is a real bet on a
                // hand we cannot see.
                if (confusion >= CONFUSION_LIMIT) {
                    await event(ns, "casino", "Cannot read the table - standing down rather than clicking blind", "warn");
                    await writeState(ns, "casino", { status: "confused", hands, won, confusion });
                    return;
                }
                await writeState(ns, "casino", { status: "reading", hands, won, confusion });
                await ns.sleep(BEAT);
                continue;
            }

            confusion = 0;
            const hand = handValue(table.player);
            const action = decide(table.player, table.dealer[0], { canDouble: table.player.length === 2 });
            const button = findButton(action === "stay" ? "stay" : action);
            if (!click(button)) {
                // The recommended action is not offered - fall back to the one
                // that always is rather than stalling the table.
                click(findButton("stay")) || click(start);
            }

            await writeState(ns, "casino", {
                status: "playing", hands, won,
                hand: hand.total, soft: hand.soft, showing: table.dealer[0] ?? "?", action,
            });
            await ns.sleep(BEAT);
        } catch (error) {
            await writeState(ns, "casino", { status: "error", error: String(error), hands });
            await ns.sleep(IDLE);
        }
    }
}
