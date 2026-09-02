/**
 * Augmentation knowledge - which implants matter, who sells them, what they cost.
 *
 * Enumerating augmentations needs ns.singularity.getAugmentationsFromFaction(),
 * which needs SF4. So before SF4 the player is flying blind through the single
 * most important decision in the game: which faction to grind and which implants
 * to buy first. This table removes that blindness without any Source-File.
 *
 * The rows below are GENERATED from the game's own Augmentations.ts and
 * Faction/Augmentation Enums.ts (names, repCost, moneyCost, factions verbatim).
 * `value` is MATRIX's own weighting, not the game's: money and speed multipliers
 * are worth more to a hacking autopilot than raw hacking level, which is only a
 * means to them, and faction reputation matters because rep gates the next tier.
 *
 * Pure data and pure functions - no ns.
 */

export const AUGMENTATIONS = [
    { name: "QLink", rep: 1875000, money: 25000000000000, value: 14.425, factions: ["Illuminati"] },
    { name: "ECorp HVMind Implant", rep: 1500000, money: 5500000000, value: 2, factions: ["ECorp"] },
    { name: "Cranial Signal Processors - Gen V", rep: 250000, money: 2250000000, value: 1.95, factions: ["BitRunners"] },
    { name: "Embedded Netburner Module Core V3 Upgrade", rep: 1750000, money: 7500000000, value: 1.795, factions: ["ECorp", "MegaCorp", "Fulcrum Secret Technologies", "NWO", "Daedalus", "The Covenant", "Illuminati"] },
    { name: "Embedded Netburner Module Direct Memory Access Upgrade", rep: 1000000, money: 7000000000, value: 1.44, factions: ["ECorp", "MegaCorp", "Fulcrum Secret Technologies", "NWO", "Daedalus", "The Covenant", "Illuminati"] },
    { name: "Embedded Netburner Module Core V2 Upgrade", rep: 1000000, money: 4500000000, value: 1.325, factions: ["BitRunners", "ECorp", "MegaCorp", "Fulcrum Secret Technologies", "NWO", "Blade Industries", "OmniTek Incorporated", "KuaiGong International"] },
    { name: "Cranial Signal Processors - Gen IV", rep: 125000, money: 1100000000, value: 0.9, factions: ["The Black Hand", "BitRunners"] },
    { name: "Neural Accelerator", rep: 200000, money: 1750000000, value: 0.87, factions: ["BitRunners"] },
    { name: "PC Direct-Neural Interface NeuroNet Injector", rep: 1500000, money: 7500000000, value: 0.775, factions: ["Fulcrum Secret Technologies"] },
    { name: "DataJack", rep: 112500, money: 450000000, value: 0.75, factions: ["BitRunners", "The Black Hand", "NiteSec", "Chongqing", "New Tokyo"] },
    { name: "Artificial Bio-neural Network Implant", rep: 275000, money: 3000000000, value: 0.705, factions: ["BitRunners", "Fulcrum Secret Technologies"] },
    { name: "Cranial Signal Processors - Gen III", rep: 50000, money: 550000000, value: 0.635, factions: ["NiteSec", "The Black Hand", "BitRunners"] },
    { name: "BitRunners Neurolink", rep: 875000, money: 4375000000, value: 0.63, factions: ["BitRunners"] },
    { name: "Embedded Netburner Module Core Implant", rep: 175000, money: 2500000000, value: 0.572, factions: ["BitRunners", "The Black Hand", "ECorp", "MegaCorp", "Fulcrum Secret Technologies", "NWO", "Blade Industries"] },
    { name: "PC Direct-Neural Interface Optimization Submodule", rep: 500000, money: 4500000000, value: 0.525, factions: ["Fulcrum Secret Technologies", "ECorp", "Blade Industries"] },
    { name: "OmniTek InfoLoad", rep: 625000, money: 2875000000, value: 0.5, factions: ["OmniTek Incorporated"] },
    { name: "The Black Hand", rep: 100000, money: 550000000, value: 0.5, factions: ["The Black Hand"] },
    { name: "SmartJaw", rep: 375000, money: 2750000000, value: 0.475, factions: ["Bachman & Associates"] },
    { name: "Xanipher", rep: 875000, money: 4250000000, value: 0.42, factions: ["NWO"] },
    { name: "ADR-V2 Pheromone Gene", rep: 62500, money: 550000000, value: 0.38, factions: ["Silhouette", "Four Sigma", "Bachman & Associates", "Clarke Incorporated"] },
    { name: "Neuronal Densification", rep: 187500, money: 1375000000, value: 0.38, factions: ["Clarke Incorporated"] },
    { name: "HyperSight Corneal Implant", rep: 150000, money: 2750000000, value: 0.375, factions: ["Blade Industries", "KuaiGong International"] },
    { name: "Neuregen Gene Modification", rep: 37500, money: 375000000, value: 0.32, factions: ["Chongqing"] },
    { name: "nextSENS Gene Modification", rep: 437500, money: 1925000000, value: 0.3, factions: ["Clarke Incorporated"] },
    { name: "Social Negotiation Assistant (S.N.A)", rep: 6250, money: 30000000, value: 0.285, factions: ["Tian Di Hui"] },
    { name: "The Shadow's Simulacrum", rep: 37500, money: 400000000, value: 0.285, factions: ["The Syndicate", "The Dark Army", "Speakers for the Dead"] },
    { name: "Enhanced Myelin Sheathing", rep: 100000, money: 1375000000, value: 0.275, factions: ["Fulcrum Secret Technologies", "BitRunners", "The Black Hand"] },
    { name: "PC Direct-Neural Interface", rep: 375000, money: 3750000000, value: 0.27, factions: ["Four Sigma", "OmniTek Incorporated", "ECorp", "Blade Industries"] },
    { name: "Neuralstimulator", rep: 50000, money: 3000000000, value: 0.266, factions: ["The Black Hand", "Chongqing", "Sector-12", "New Tokyo", "Aevum", "Ishima", "Volhaven", "Bachman & Associates", "Clarke Incorporated", "Four Sigma"] },
    { name: "Embedded Netburner Module Analyze Engine", rep: 625000, money: 6000000000, value: 0.25, factions: ["ECorp", "MegaCorp", "Fulcrum Secret Technologies", "NWO", "Daedalus", "The Covenant", "Illuminati"] },
    { name: "CRTX42-AA Gene Modification", rep: 45000, money: 225000000, value: 0.24, factions: ["NiteSec"] },
    { name: "SPTN-97 Gene Modification", rep: 1250000, money: 4875000000, value: 0.225, factions: ["The Covenant"] },
    { name: "Cranial Signal Processors - Gen II", rep: 18750, money: 125000000, value: 0.215, factions: ["CyberSec", "NiteSec"] },
    { name: "Neural-Retention Enhancement", rep: 20000, money: 250000000, value: 0.2, factions: ["NiteSec"] },
    { name: "ADR-V1 Pheromone Gene", rep: 3750, money: 17500000, value: 0.19, factions: ["Tian Di Hui", "The Syndicate", "NWO", "MegaCorp", "Four Sigma"] },
    { name: "Hacknet Node Core Direct-Neural Interface", rep: 12500, money: 60000000, value: 0.18, factions: ["Netburners"] },
    { name: "Neurotrainer III", rep: 25000, money: 130000000, value: 0.16, factions: ["NWO", "Four Sigma"] },
    { name: "Power Recirculation Core", rep: 25000, money: 180000000, value: 0.155, factions: ["Tetrads", "The Dark Army", "The Syndicate", "NWO"] },
    { name: "Artificial Synaptic Potentiation", rep: 6250, money: 80000000, value: 0.15, factions: ["The Black Hand", "NiteSec"] },
    { name: "Social Dynamics Processor", rep: 225000, money: 1200000000, value: 0.15, factions: ["MegaCorp", "ECorp", "OmniTek Incorporated"] },
    { name: "PCMatrix", rep: 100000, money: 2000000000, value: 0.148, factions: ["Aevum"] },
    { name: "Embedded Netburner Module", rep: 15000, money: 250000000, value: 0.12, factions: ["BitRunners", "The Black Hand", "NiteSec", "ECorp", "MegaCorp", "Fulcrum Secret Technologies", "NWO", "Blade Industries"] },
    { name: "Neurotrainer II", rep: 10000, money: 45000000, value: 0.12, factions: ["BitRunners", "NiteSec"] },
    { name: "Cranial Signal Processors - Gen I", rep: 10000, money: 70000000, value: 0.1, factions: ["CyberSec", "NiteSec"] },
    { name: "Hacknet Node Kernel Direct-Neural Interface", rep: 7500, money: 40000000, value: 0.1, factions: ["Netburners"] },
    { name: "Nuoptimal Nootropic Injector Implant", rep: 5000, money: 20000000, value: 0.1, factions: ["Tian Di Hui", "Volhaven", "New Tokyo", "Chongqing", "Clarke Incorporated", "Four Sigma", "Bachman & Associates"] },
    { name: "FocusWire", rep: 75000, money: 900000000, value: 0.09, factions: ["Bachman & Associates", "Clarke Incorporated", "Four Sigma", "KuaiGong International"] },
    { name: "Neurotrainer I", rep: 1000, money: 4000000, value: 0.08, factions: ["CyberSec", "Aevum"] },
    { name: "BitWire", rep: 3750, money: 10000000, value: 0.075, factions: ["CyberSec", "NiteSec"] },
    { name: "Synaptic Enhancement Implant", rep: 2000, money: 7500000, value: 0.075, factions: ["CyberSec", "Aevum"] },
    { name: "Hacknet Node CPU Architecture Neural-Upload", rep: 3750, money: 11000000, value: 0.06, factions: ["Netburners"] },
    { name: "Glibness Enhancement", rep: 40500, money: 2500000000, value: 0.05, factions: ["Tetrads", "Bladeburners"] },
    { name: "Magnetism Amplifier", rep: 15000, money: 250000000, value: 0.05, factions: ["The Black Hand", "The Dark Army"] },
    { name: "Speech Enhancement", rep: 2500, money: 12500000, value: 0.05, factions: ["Tian Di Hui", "Speakers for the Dead", "Four Sigma", "KuaiGong International", "Clarke Incorporated", "Bachman & Associates"] },
    { name: "Hacknet Node Cache Architecture Neural-Upload", rep: 2500, money: 5500000, value: 0.04, factions: ["Netburners"] },
    { name: "Hacknet Node NIC Architecture Neural-Upload", rep: 1875, money: 4500000, value: 0.04, factions: ["Netburners"] },
    { name: "Neural Wit Amplifier", rep: 5000, money: 10000000, value: 0.025, factions: ["Slum Snakes", "BitRunners"] },
];

// Bought repeatedly, each purchase raising the price and rep needed. It is the
// permanent sink for spare cash once the ranked list is exhausted.
export const NEUROFLUX = "NeuroFlux Governor";

/**
 * What to buy next, given what the player has and where they stand.
 *
 * `factionRep` maps faction -> current reputation. Without SF4 the player cannot
 * read it programmatically, so an absent entry is treated as zero rep and the
 * augmentation is reported as "needs rep" rather than being hidden - naming the
 * requirement is the whole point.
 */
export function augmentationPlan({
    owned = [],
    factions = [],
    factionRep = {},
    money = 0,
    limit = 6,
} = {}) {
    const have = new Set(Array.isArray(owned) ? owned : []);
    const joined = new Set(Array.isArray(factions) ? factions : []);
    const rep = factionRep && typeof factionRep === "object" ? factionRep : {};

    const rows = [];
    for (const aug of AUGMENTATIONS) {
        if (have.has(aug.name)) continue;
        // Only factions the player has actually joined can sell to them.
        const sources = aug.factions.filter(f => joined.has(f));
        if (!sources.length) continue;
        // Buy from whichever joined faction is closest to the rep requirement.
        const best = sources
            .map(f => ({ faction: f, rep: Number(rep[f] ?? 0) || 0 }))
            .sort((a, b) => b.rep - a.rep)[0];
        const repShort = Math.max(0, aug.rep - best.rep);
        const moneyShort = Math.max(0, aug.money - money);
        rows.push({
            ...aug,
            faction: best.faction,
            haveRep: best.rep,
            repShort,
            moneyShort,
            affordable: repShort === 0 && moneyShort === 0,
        });
    }

    // Buyable now, best value first; then the rest ordered by how close they are.
    const ready = rows.filter(r => r.affordable).sort((a, b) => b.value - a.value);
    const blocked = rows.filter(r => !r.affordable)
        .sort((a, b) => (b.value / (1 + b.repShort / 1e5)) - (a.value / (1 + a.repShort / 1e5)));
    return { ready: ready.slice(0, limit), blocked: blocked.slice(0, limit), total: rows.length };
}

/**
 * The faction worth grinding: the one whose unowned augmentations carry the most
 * total value the player cannot buy yet. Grinding rep is the long pole before
 * SF4, so pointing at the right faction is worth more than any single implant.
 */
export function bestFactionToGrind({ owned = [], factions = [], factionRep = {} } = {}) {
    const have = new Set(Array.isArray(owned) ? owned : []);
    const joined = new Set(Array.isArray(factions) ? factions : []);
    const totals = new Map();
    for (const aug of AUGMENTATIONS) {
        if (have.has(aug.name)) continue;
        for (const faction of aug.factions) {
            if (!joined.has(faction)) continue;
            const current = Number(factionRep?.[faction] ?? 0) || 0;
            if (aug.rep <= current) continue;
            const entry = totals.get(faction) ?? { faction, value: 0, augs: 0, repNeeded: 0 };
            entry.value += aug.value;
            entry.augs++;
            entry.repNeeded = Math.max(entry.repNeeded, aug.rep);
            totals.set(faction, entry);
        }
    }
    return [...totals.values()].sort((a, b) => b.value - a.value)[0] ?? null;
}

/** Directives for the transmission feed. */
export function augmentationDirectives(state = {}, { singularity = false, limit = 3 } = {}) {
    const plan = augmentationPlan({ ...state, limit });
    const out = [];
    for (const aug of plan.ready) {
        out.push({
            id: `AUG_${aug.name}`,
            tag: "AUGMENT",
            label: `Buy ${aug.name}`,
            detail: singularity
                ? `${aug.faction} - MATRIX purchases this on its next cycle`
                : `${aug.faction} - affordable now, open the faction's Augmentations tab`,
            urgent: !singularity,
            ready: true,
        });
    }
    const grind = bestFactionToGrind(state);
    if (grind && out.length < limit) {
        out.push({
            id: `GRIND_${grind.faction}`,
            tag: "REPUTATION",
            label: `Work for ${grind.faction}`,
            detail: `${grind.augs} augmentation(s) still locked there, up to ${Math.round(grind.repNeeded).toLocaleString()} rep`,
            urgent: false,
            ready: false,
        });
    }
    return out.slice(0, limit);
}
