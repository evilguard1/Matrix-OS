/**
 * The operator's voice.
 *
 * MATRIX automates everything the game permits. What it cannot reach - anything
 * behind Singularity, a Source-File, or a terminal keystroke - still has to be
 * communicated, and a locked module with no explanation is worse than no module
 * at all. So every directive gets a line in the system's own register: a message
 * arriving on the screen of someone who did not ask for it.
 *
 * Rules this file obeys:
 *  - the flavour NEVER replaces the instruction, it introduces it. The concrete
 *    detail (level, cost, command) is rendered underneath, always.
 *  - deterministic. The same directive says the same thing every frame, or the
 *    deck flickers and the line becomes untestable.
 *  - original prose in the setting's vocabulary, not quoted dialogue.
 */

// Stable index from a directive id, so different factions get different lines
// without any randomness. Same id, same line, every render.
function pick(lines, seed) {
    if (!lines.length) return "";
    let hash = 0;
    for (const char of String(seed ?? "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return lines[hash % lines.length];
}

const LINES = {
    JOIN: [
        "A line is being held open for you. Answer it.",
        "Someone on the inside has vouched for you. Accept the handshake.",
        "They have been watching your traffic. They like what they see.",
    ],
    BACKDOOR_READY: [
        "The door is unlocked. Walk through it.",
        "That subnet has been listening for you. Announce yourself.",
        "No alarms on this one. Go quietly.",
    ],
    BACKDOOR_LOCKED: [
        "That door reads you before it opens, and it is not convinced yet.",
        "The lock is real. Come back heavier.",
        "You are not yet the shape this door expects.",
    ],
    UNLOCK: [
        "There is a way in. It is simply not this one, and not today.",
        "This path stays closed until you change what you are.",
        "The requirement is not negotiable. It is arithmetic.",
    ],
    PROGRAM: [
        "You cannot pick a lock you hold no key for.",
        "Tools first. The network will still be here.",
    ],
    CREATE: [
        "You can write this one yourself. It costs nothing but time.",
        "No need to buy what you already know how to build.",
    ],
    BUY_SERVER: [
        "More machines mean more of you running at once.",
        "Rent the hardware. It pays for itself before you notice.",
    ],
    HOME_RAM: [
        "Your own machine is the bottleneck now. Widen it.",
        "Every doubling here doubles what runs on home.",
    ],
    MODULE: [
        "That power belongs to a version of you who has already left this world.",
        "This module is written and waiting. It cannot run in this reality yet.",
        "The capability is real. The permission is not - not in this BitNode.",
    ],
    TOR: [
        "There is a market below the surface. You will need an address.",
        "The darkweb does not advertise. Buy the router and it will find you.",
    ],
    AUGMENT: [
        "This one changes what you are, not what you own. Take it.",
        "The implant is on the shelf and the credits are in your account.",
    ],
    REPUTATION: [
        "They will not sell to a stranger. Become someone they trust.",
        "Reputation is the only currency this faction accepts.",
    ],
    DEFAULT: [
        "Something here needs a hand that is not mine.",
    ],
};

/**
 * The themed line for a directive. `tag` picks the register; `ready` separates
 * "do this now" from "this is why you cannot".
 */
export function speak(directive = {}) {
    directive = directive ?? {};
    const tag = String(directive.tag ?? "").toUpperCase();
    const id = directive.id ?? directive.label ?? tag;
    let key = "DEFAULT";
    if (tag === "JOIN") key = "JOIN";
    else if (tag === "BACKDOOR") key = directive.ready ? "BACKDOOR_READY" : "BACKDOOR_LOCKED";
    else if (tag === "UNLOCK") key = "UNLOCK";
    else if (tag === "CREATE") key = "CREATE";
    else if (tag === "PROGRAM") key = "PROGRAM";
    else if (tag === "BUY SERVER" || tag === "BUY_SERVER") key = "BUY_SERVER";
    else if (tag === "HOME RAM" || tag === "HOME_RAM") key = "HOME_RAM";
    else if (tag === "MODULE") key = "MODULE";
    else if (tag === "TOR") key = "TOR";
    else if (tag === "AUGMENT") key = "AUGMENT";
    else if (tag === "REPUTATION") key = "REPUTATION";
    return pick(LINES[key], id);
}

/** Attaches the voice without disturbing anything the deck already reads. */
export function narrate(directives = []) {
    directives = directives ?? [];
    if (!Array.isArray(directives)) return [];
    return directives.filter(Boolean).map(directive => ({ ...directive, voice: speak(directive) }));
}

/**
 * Modules MATRIX has written and cannot run here. Naming the Source-File and
 * how it is earned turns a dead row in the service list into a goal.
 */
export const MODULE_LOCKS = {
    singularity: { sf: 4, what: "faction work, augmentation buying and backdoors" },
    progression: { sf: 4, what: "automatic augmentation installs and BitNode exits" },
    gang: { sf: 2, what: "gang recruitment, ascension and territory" },
    corporation: { sf: 3, what: "running a corporation" },
    bladeburner: { sf: 6, what: "Bladeburner contracts and black operations" },
    sleeves: { sf: 10, what: "duplicate sleeve tasking" },
    stanek: { sf: 13, what: "keeping Stanek's Gift fragments charged" },
};

/**
 * One directive per locked module, so the player can see what MATRIX is holding
 * in reserve and exactly which BitNode releases it. Only emitted for modules
 * whose Source-File is genuinely absent.
 */
export function moduleDirectives(ownedSF = [], options = {}) {
    const { limit = 3 } = options ?? {};
    const owned = new Set();
    for (const entry of Array.isArray(ownedSF) ? ownedSF : []) {
        const n = Number(Array.isArray(entry) ? entry[0] : entry?.n ?? entry);
        if (Number.isFinite(n)) owned.add(n);
    }
    const out = [];
    for (const [name, lock] of Object.entries(MODULE_LOCKS)) {
        if (owned.has(lock.sf)) continue;
        out.push({
            id: `MODULE_${name}`,
            tag: "MODULE",
            label: `${name} module is dormant`,
            detail: `${lock.what} - needs Source-File ${lock.sf}, earned by completing BitNode ${lock.sf}`,
            urgent: false,
            ready: false,
        });
    }
    return out.slice(0, limit);
}
