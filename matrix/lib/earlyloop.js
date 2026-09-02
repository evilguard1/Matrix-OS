/**
 * The early worker's decision: weaken, grow, or hack.
 *
 * This one function is the whole early economy - every thread on every rooted
 * box runs it thousands of times - so getting it wrong is expensive in a way
 * that is invisible from the dashboard.
 *
 * The loop it replaces was wrong in both directions:
 *
 *   if (money <= max * 0.005) grow          // only below HALF A PERCENT
 *   else if (sec >= 95 && sec > min + 5) weaken
 *   else hack
 *
 * Security is capped at 100 and starts near its minimum, so `sec >= 95` almost
 * never fired: security drifted up on every hack and grow and was never brought
 * back down, and hack chance and speed both scale off it. Meanwhile money was
 * only regrown once the server was drained below 0.5% of maximum, so nearly
 * every hack landed on an almost-empty server and took a percentage of nothing.
 *
 * Correct order, and the standard one: keep security near minimum first,
 * because it multiplies everything else; then keep the balance near full,
 * because a hack takes a PERCENTAGE and a percentage of a full server is worth
 * far more; hack only when both are true.
 *
 * Pure function - no ns - so the policy is testable without a game.
 */

// Above minimum security, hack chance and timing degrade quickly. Small enough
// to keep the server sharp, large enough not to weaken on every single tick.
export const SECURITY_SLACK = 5;

// Hack when the balance is at least this share of maximum. Growth is
// multiplicative, so the last few percent are the slowest to regain - taking a
// cut at 90% is worth more per second than waiting for 100%.
export const MONEY_FLOOR = 0.9;

/**
 * "weaken" | "grow" | "hack" for the current state of a target.
 *
 * `slack` and `floor` are exposed so the caller can tune, but the defaults are
 * the ones that matter. A server with no money to take is always grown - hacking
 * it earns nothing and raises security for free.
 */
export function nextAction(state = {}, options = {}) {
    const { slack = SECURITY_SLACK, floor = MONEY_FLOOR } = options ?? {};
    // A parameter default only fires on undefined; the caller reads live server
    // state and an absent server yields null, which would land here intact.
    state = state ?? {};
    const security = Number(state.security ?? 0) || 0;
    const minSecurity = Number(state.minSecurity ?? 0) || 0;
    const money = Number(state.money ?? 0) || 0;
    const maxMoney = Number(state.maxMoney ?? 0) || 0;

    // Security first: it multiplies the value of every other action.
    if (security > minSecurity + slack) return "weaken";
    // A server that can hold nothing is not worth hacking, but growing it is
    // how a freshly rooted box becomes worth farming at all.
    if (maxMoney <= 0) return "grow";
    if (money < maxMoney * floor) return "grow";
    return "hack";
}
