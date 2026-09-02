/**
 * Faction requirements, as knowledge rather than as API calls.
 *
 * Joining a faction needs the Singularity API, which needs SF4. Before that the
 * game simply will not let a script do it - but nothing stops us from KNOWING
 * what every faction wants and telling the player exactly which move unlocks
 * the next one. Every requirement here is checked against the free player
 * snapshot telemetry already publishes, so this costs no extra RAM.
 *
 * Pure functions on plain data: no ns, so the whole table is unit-testable.
 */

export const CITY_FACTIONS = ["Sector-12", "Aevum", "Chongqing", "New Tokyo", "Ishima", "Volhaven"];

// Backdooring these servers is what triggers the hacking-faction invitations.
// The root/backdoor step is a terminal action, not a Singularity one, so the
// player can always do it by hand - and MATRIX can always tell them to.
export const BACKDOOR_FACTIONS = {
    "CSEC": "CyberSec",
    "avmnite-02h": "NiteSec",
    "I.I.I.I": "The Black Hand",
    "run4theh111z": "BitRunners",
    "fulcrumassets": "Fulcrum Secret Technologies",
};

// Megacorp factions are unlocked by company reputation, which cannot be read
// without Singularity. They are listed so the deck can still name the path.
export const MEGACORP_FACTIONS = [
    "ECorp", "MegaCorp", "KuaiGong International", "Four Sigma", "NWO",
    "Blade Industries", "OmniTek Incorporated", "Bachman & Associates", "Clarke Incorporated",
];

/**
 * `priority` orders the guidance feed: lower is more urgent. It encodes the
 * usual progression - hacking factions first because they are free and gate the
 * best early augmentations, then a city, then the rest.
 */
export const FACTIONS = [
    { name: "CyberSec", kind: "hacking", priority: 1, req: { backdoor: "CSEC" },
      how: "connect to CSEC and run backdoor" },
    { name: "NiteSec", kind: "hacking", priority: 2, req: { backdoor: "avmnite-02h" },
      how: "connect to avmnite-02h and run backdoor" },
    { name: "The Black Hand", kind: "hacking", priority: 3, req: { backdoor: "I.I.I.I" },
      how: "connect to I.I.I.I and run backdoor" },
    { name: "BitRunners", kind: "hacking", priority: 4, req: { backdoor: "run4theh111z" },
      how: "connect to run4theh111z and run backdoor" },

    { name: "Netburners", kind: "hacking", priority: 5,
      req: { hacking: 80, hacknetLevels: 100, hacknetRam: 8, hacknetCores: 4 },
      how: "keep buying hacknet upgrades - MATRIX does this automatically" },

    { name: "Tian Di Hui", kind: "misc", priority: 6,
      req: { money: 1e6, hacking: 50, city: ["Chongqing", "New Tokyo", "Ishima"] },
      how: "travel to Chongqing, New Tokyo or Ishima" },

    { name: "Sector-12", kind: "city", priority: 7, req: { city: ["Sector-12"], money: 15e6 }, how: "be in Sector-12" },
    { name: "Chongqing", kind: "city", priority: 8, req: { city: ["Chongqing"], money: 20e6 }, how: "travel to Chongqing" },
    { name: "New Tokyo", kind: "city", priority: 8, req: { city: ["New Tokyo"], money: 20e6 }, how: "travel to New Tokyo" },
    { name: "Ishima", kind: "city", priority: 8, req: { city: ["Ishima"], money: 30e6 }, how: "travel to Ishima" },
    { name: "Aevum", kind: "city", priority: 8, req: { city: ["Aevum"], money: 40e6 }, how: "travel to Aevum" },
    { name: "Volhaven", kind: "city", priority: 8, req: { city: ["Volhaven"], money: 50e6 }, how: "travel to Volhaven" },

    { name: "Slum Snakes", kind: "crime", priority: 9, req: { combat: 30, karma: -9, money: 1e6 },
      how: "commit crimes and train combat stats at a gym" },
    { name: "Tetrads", kind: "crime", priority: 10,
      req: { city: ["Chongqing", "New Tokyo", "Ishima"], combat: 75, karma: -18 },
      how: "train combat, commit crimes, travel to Chongqing / New Tokyo / Ishima" },
    { name: "Silhouette", kind: "crime", priority: 10,
      req: { money: 15e6, karma: -22, jobTitle: ["CTO", "CFO", "CEO"] },
      how: "reach CTO, CFO or CEO at any company, then commit crimes for karma" },
    { name: "The Syndicate", kind: "crime", priority: 11,
      req: { hacking: 200, combat: 200, city: ["Aevum", "Sector-12"], money: 10e6, karma: -90 },
      how: "train combat to 200 and commit crimes for karma" },
    { name: "The Dark Army", kind: "crime", priority: 12,
      req: { hacking: 300, combat: 300, city: ["Chongqing"], karma: -45, kills: 5 },
      how: "train combat to 300, homicide for karma and kills, travel to Chongqing" },
    { name: "Speakers for the Dead", kind: "crime", priority: 13,
      req: { hacking: 100, combat: 300, karma: -45, kills: 30 },
      how: "homicide until 30 kills, train combat to 300" },

    { name: "The Covenant", kind: "endgame", priority: 20, req: { augs: 20, money: 75e9, hacking: 850, combat: 850 },
      how: "install 20 augmentations, then build hacking and combat to 850" },
    { name: "Illuminati", kind: "endgame", priority: 21, req: { augs: 30, money: 150e9, hacking: 1500, combat: 1200 },
      how: "install 30 augmentations" },
    { name: "Daedalus", kind: "endgame", priority: 22, req: { augs: 30, money: 100e9, hackingOrCombat: [2500, 1500] },
      how: "install 30 augmentations, then reach Hacking 2500" },
];

// The exact terminal command, ready to paste. A path of hops beats "go find it".
export function terminalRoute(info) {
    const path = Array.isArray(info?.path) ? info.path.filter(Boolean) : [];
    if (!path.length) return null;
    return `${path.map(hop => `connect ${hop}`).join("; ")}; backdoor`;
}

// Names the single requirement actually blocking this backdoor, rather than the
// useless "not rooted or out of range".
export function backdoorHelp(host, info, ready) {
    if (ready) return `run: ${terminalRoute(info) ?? `connect ${host}; backdoor`}`;
    if (!info) return "route not mapped yet";
    const level = Number(info.level ?? 0), have = Number(info.have ?? 0);
    if (have < level) return `needs Hacking ${level}, you have ${have}`;
    const ports = Number(info.ports ?? 0), crackers = Number(info.crackers ?? 0);
    if (crackers < ports) return `needs ${ports} port crackers, you have ${crackers}`;
    if (!info.rooted) return "root it first - MATRIX does this automatically";
    return "not reachable yet";
}

function money(value) {
    if (!Number.isFinite(value)) return "$?";
    const units = [["q", 1e15], ["t", 1e12], ["b", 1e9], ["m", 1e6], ["k", 1e3]];
    for (const [suffix, size] of units) {
        if (Math.abs(value) >= size) return `$${(value / size).toFixed(value / size >= 100 ? 0 : 1)}${suffix}`;
    }
    return `$${Math.round(value)}`;
}

/**
 * Normalises the telemetry player snapshot into the flat shape the checks want.
 * Every field degrades to a harmless default, because a missing field must
 * never make the guidance panel throw.
 */
export function playerSnapshot(raw = {}) {
    raw = raw ?? {};
    const skills = raw.skills ?? {};
    return {
        hacking: Number(skills.hacking ?? 0) || 0,
        str: Number(skills.strength ?? 0) || 0,
        def: Number(skills.defense ?? 0) || 0,
        dex: Number(skills.dexterity ?? 0) || 0,
        agi: Number(skills.agility ?? 0) || 0,
        cha: Number(skills.charisma ?? 0) || 0,
        money: Number(raw.money ?? 0) || 0,
        city: String(raw.city ?? ""),
        // Karma is negative and gets MORE negative as you commit crimes.
        karma: Number(raw.karma ?? 0) || 0,
        kills: Number(raw.kills ?? raw.numPeopleKilled ?? 0) || 0,
        augs: Number(raw.augs ?? 0) || 0,
        factions: new Set(Array.isArray(raw.factions) ? raw.factions : []),
        // Hosts whose backdoor is effectively done. Reading the real flag costs
        // 2 GB of ns.getServer, which does not fit the 32 GB stage, so callers
        // may instead pass the hosts whose faction is already joined - a
        // backdoor produces the invitation immediately, so the two agree.
        backdoors: new Set(Array.isArray(raw.backdoors) ? raw.backdoors : []),
        // Hosts that are rooted and within hacking range: the backdoor is
        // actionable right now rather than something to work toward.
        reachable: new Set(Array.isArray(raw.reachable) ? raw.reachable : []),
        // Company positions held, as title strings. Silhouette is the only
        // faction that asks for one.
        titles: new Set(Object.values(raw.jobs && typeof raw.jobs === "object" ? raw.jobs : {})
            .map(title => String(title ?? ""))),
        // Per-host detail so a blocked backdoor can say WHICH requirement is
        // blocking it, and a ready one can hand over the exact terminal command.
        // installBackdoor() is Singularity, so until SF4 this is the whole help
        // MATRIX can give - it should therefore be precise.
        backdoorInfo: raw.backdoorInfo && typeof raw.backdoorInfo === "object" ? raw.backdoorInfo : {},
        hacknet: {
            levels: Number(raw.hacknet?.levels ?? 0) || 0,
            ram: Number(raw.hacknet?.ram ?? 0) || 0,
            cores: Number(raw.hacknet?.cores ?? 0) || 0,
        },
    };
}

const COMBAT = [["str", "STR"], ["def", "DEF"], ["dex", "DEX"], ["agi", "AGI"]];

/** Requirements this player does NOT yet meet, as short human strings. */
export function unmetRequirements(req = {}, p) {
    req = req ?? {}; p = p ?? playerSnapshot({});
    const missing = [];
    if (req.hacking && p.hacking < req.hacking) missing.push(`Hacking ${p.hacking}/${req.hacking}`);
    if (req.combat) {
        for (const [key, label] of COMBAT) {
            if (p[key] < req.combat) missing.push(`${label} ${p[key]}/${req.combat}`);
        }
    }
    // Daedalus takes EITHER a hacking level or all combat stats.
    if (req.hackingOrCombat) {
        const [hack, combat] = req.hackingOrCombat;
        if (p.hacking < hack && COMBAT.some(([key]) => p[key] < combat)) {
            missing.push(`Hacking ${p.hacking}/${hack} (or all combat ${combat})`);
        }
    }
    if (req.money && p.money < req.money) missing.push(`${money(req.money)} (have ${money(p.money)})`);
    if (req.city && !req.city.includes(p.city)) missing.push(`be in ${req.city.join(" or ")}`);
    // Karma is negative: -90 is "worse" than -9, so the test is >, not <.
    if (req.karma != null && p.karma > req.karma) missing.push(`karma ${Math.round(p.karma)}/${req.karma}`);
    if (req.kills && p.kills < req.kills) missing.push(`${p.kills}/${req.kills} people killed`);
    if (req.augs && p.augs < req.augs) missing.push(`${p.augs}/${req.augs} augmentations`);
    if (req.backdoor && !p.backdoors.has(req.backdoor)) missing.push(`backdoor ${req.backdoor}`);
    // Job titles come from getPlayer().jobs, which is free; an empty map simply
    // means the player holds no position yet.
    if (req.jobTitle && !req.jobTitle.some(title => p.titles.has(title))) {
        missing.push(`be ${req.jobTitle.join(", ")} at a company`);
    }
    if (req.hacknetLevels && p.hacknet.levels < req.hacknetLevels) missing.push(`hacknet levels ${p.hacknet.levels}/${req.hacknetLevels}`);
    if (req.hacknetRam && p.hacknet.ram < req.hacknetRam) missing.push(`hacknet RAM ${p.hacknet.ram}/${req.hacknetRam}`);
    if (req.hacknetCores && p.hacknet.cores < req.hacknetCores) missing.push(`hacknet cores ${p.hacknet.cores}/${req.hacknetCores}`);
    return missing;
}

/**
 * Full faction picture: what is joined, what can be joined RIGHT NOW, and what
 * is closest. `eligible` factions are the actionable ones - in game they show
 * up as a pending invitation.
 */
export function factionPlan(rawPlayer, options = {}) {
    const { singularity = false } = options ?? {};
    const p = playerSnapshot(rawPlayer);
    const rows = FACTIONS.map(faction => {
        const joined = p.factions.has(faction.name);
        const missing = joined ? [] : unmetRequirements(faction.req, p);
        return { ...faction, joined, missing, eligible: !joined && missing.length === 0 };
    });
    return {
        player: p,
        joined: rows.filter(row => row.joined),
        // Sorted so the fewest-blockers faction leads: that is the next real move.
        eligible: rows.filter(row => row.eligible).sort((a, b) => a.priority - b.priority),
        pending: rows.filter(row => !row.joined && !row.eligible)
            .sort((a, b) => a.missing.length - b.missing.length || a.priority - b.priority),
        // Without Singularity the player must click Join themselves.
        autoJoins: singularity,
    };
}

/**
 * The guidance feed: concrete, ordered instructions the player can act on now.
 * Only emits what is actually actionable - a faction blocked behind six stats
 * is not an instruction, it is noise.
 */
export function factionDirectives(rawPlayer, options = {}) {
    const { singularity = false, limit = 4 } = options ?? {};
    const plan = factionPlan(rawPlayer, { singularity });
    const reachable = plan.player.reachable;
    const out = [];

    for (const faction of plan.eligible) {
        out.push({
            id: `JOIN_${faction.name}`,
            tag: "JOIN",
            label: `Join ${faction.name}`,
            // With Singularity, MATRIX takes this itself - say so rather than
            // telling the player to do something the system already did.
            detail: singularity
                ? "MATRIX joins this automatically on its next cycle"
                : "invitation is waiting - open the Factions tab and click Join",
            urgent: !singularity,
            ready: true,
        });
    }

    // A backdoor is always worth naming: it is free, permanent, and the whole
    // early faction tree hangs off it.
    for (const faction of plan.pending) {
        if (out.length >= limit) break;
        const backdoorOnly = faction.missing.length === 1 && faction.missing[0].startsWith("backdoor");
        if (!backdoorOnly) continue;
        // Only call it an instruction when the player can actually do it now.
        const host = faction.req.backdoor;
        const now = reachable.has(host);
        out.push({
            id: `BACKDOOR_${faction.name}`,
            tag: "BACKDOOR",
            label: `Backdoor ${host}`,
            detail: `unlocks ${faction.name} - ${backdoorHelp(host, plan.player.backdoorInfo[host], now)}`,
            command: now ? terminalRoute(plan.player.backdoorInfo[host]) : null,
            urgent: false,
            ready: now,
        });
    }

    for (const faction of plan.pending) {
        if (out.length >= limit) break;
        if (out.some(item => item.id.endsWith(faction.name))) continue;
        out.push({
            id: `WORK_${faction.name}`,
            tag: "UNLOCK",
            label: `${faction.name}: ${faction.missing.slice(0, 2).join(", ")}`,
            detail: faction.how,
            urgent: false,
            ready: false,
        });
    }

    return out.slice(0, limit);
}
