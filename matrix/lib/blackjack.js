/**
 * Blackjack basic strategy - the casino's decision layer, as pure functions.
 *
 * The casino is the largest sum of money in the game reachable with no
 * Source-File at all, and the only part of it that is real logic is which
 * action to take. Everything else is clicking. So the logic lives here, tested
 * against the standard strategy table, and the service stays a thin driver.
 *
 * Bitburner deals from a shoe with the dealer standing on all 17s and offers
 * hit / stay / double, with no splitting - so pair strategy is deliberately
 * absent and pairs are played on their hard or soft total instead.
 */

const RANK_VALUE = {
    A: 11, K: 10, Q: 10, J: 10, T: 10, "10": 10,
    "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
};

const WORD_RANK = { ACE: "A", KING: "K", QUEEN: "Q", JACK: "J", TEN: "10" };

/**
 * Rank of a card given as "A", "10", "K", 7, "King", or "7 of Hearts".
 *
 * Matches whole tokens only. Taking the first character instead would score
 * every string beginning with A, K, Q or J as a face card - "junk" read as a
 * Jack, and a real bet placed on it.
 */
export function cardValue(card) {
    if (typeof card === "number") return Number.isFinite(card) ? Math.min(Math.max(card, 1), 11) : 0;
    let text = String(card ?? "").trim().toUpperCase();
    if (!text) return 0;
    const of = text.indexOf(" OF ");
    if (of > 0) text = text.slice(0, of).trim();
    if (WORD_RANK[text]) text = WORD_RANK[text];
    return RANK_VALUE[text] ?? 0;
}

/**
 * Best total for a hand, and whether an ace is still counted as 11. A soft hand
 * cannot bust on the next card, which is what changes the correct play.
 */
export function handValue(cards = []) {
    const list = Array.isArray(cards) ? cards : [];
    let total = 0;
    let aces = 0;
    for (const card of list) {
        const value = cardValue(card);
        if (value === 11) aces++;
        total += value;
    }
    // Demote aces from 11 to 1 only as far as needed to stay under 22.
    let soft = aces > 0;
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    if (aces === 0) soft = false;
    return { total, soft, busted: total > 21, blackjack: list.length === 2 && total === 21 };
}

/**
 * The correct action: "hit", "stay" or "double".
 *
 * `canDouble` is false once a hand has more than two cards, so a doubling
 * recommendation degrades to the action it would have been otherwise - never to
 * an illegal click.
 */
export function decide(playerCards = [], dealerCard = null, { canDouble = true } = {}) {
    const hand = handValue(playerCards);
    const dealer = cardValue(dealerCard);
    if (hand.busted || hand.total >= 21) return "stay";
    // With no readable dealer card, play the safe threshold rather than guess.
    if (!dealer) return hand.total >= 17 ? "stay" : "hit";

    const double = fallback => (canDouble ? "double" : fallback);

    if (hand.soft) {
        // Soft hands: an ace counted as 11 means the next card cannot bust us.
        if (hand.total >= 19) return "stay";
        if (hand.total === 18) {
            if (dealer >= 3 && dealer <= 6) return double("stay");
            if (dealer === 2 || dealer === 7 || dealer === 8) return "stay";
            return "hit";
        }
        if (hand.total === 17) return dealer >= 3 && dealer <= 6 ? double("hit") : "hit";
        if (hand.total === 16 || hand.total === 15) return dealer >= 4 && dealer <= 6 ? double("hit") : "hit";
        if (hand.total === 14 || hand.total === 13) return dealer >= 5 && dealer <= 6 ? double("hit") : "hit";
        return "hit";
    }

    if (hand.total >= 17) return "stay";
    if (hand.total >= 13) return dealer >= 2 && dealer <= 6 ? "stay" : "hit";
    if (hand.total === 12) return dealer >= 4 && dealer <= 6 ? "stay" : "hit";
    if (hand.total === 11) return dealer === 11 ? "hit" : double("hit");
    if (hand.total === 10) return dealer <= 9 ? double("hit") : "hit";
    if (hand.total === 9) return dealer >= 3 && dealer <= 6 ? double("hit") : "hit";
    return "hit";
}

/**
 * Pulls card ranks out of casino text like "2 of Hearts  King of Spades".
 * Deliberately conservative: it returns only what it is sure of, because a
 * misread hand is a wrong bet with real money behind it.
 */
export function readCards(text) {
    const source = String(text ?? "");
    // Accept both "K of Spades" and "King of Spades": the exact wording the
    // casino renders is not something this repo can verify, so read both rather
    // than silently dropping half a hand and betting on the remainder.
    const matches = source.match(
        /\b(10|[2-9]|Ace|King|Queen|Jack|[AKQJ])\s+of\s+(?:Hearts|Diamonds|Clubs|Spades)\b/gi);
    if (!matches) return [];
    return matches.map(match => {
        const rank = match.trim().split(/\s+of\s+/i)[0].toUpperCase();
        return rank === "10" ? "10" : rank[0];
    });
}

/**
 * Whether a round is safe to act on. Both hands must have parsed, and the
 * player must hold at least two cards - anything less means the UI was read
 * mid-render and no click should be made.
 */
export function readable(playerCards, dealerCards) {
    return Array.isArray(playerCards) && Array.isArray(dealerCards)
        && playerCards.length >= 2 && dealerCards.length >= 1
        && playerCards.every(card => cardValue(card) > 0)
        && cardValue(dealerCards[0]) > 0;
}
