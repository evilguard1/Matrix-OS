/** Reset-scoped state metadata. Pure: importing it has no Netscript RAM cost. */
export function resetEpoch(reset) {
    if (!reset || !Number.isInteger(reset.currentNode) || reset.currentNode < 1) return null;
    if (![reset.lastNodeReset, reset.lastAugReset].every(x => Number.isFinite(x) && x >= 0)) return null;
    return `${reset.currentNode}:${reset.lastNodeReset}:${reset.lastAugReset}`;
}

export function freshState(value, options) {
    const { now = Date.now(), epoch = null, ttl = 30_000, legacy = true } = options ?? {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (!Number.isFinite(value.updated) || value.updated <= 0 || value.updated > now || now - value.updated > ttl) return false;
    if (value.schemaVersion != null && value.schemaVersion !== 1) return false;
    if (value.schemaVersion === 1) return Boolean(epoch && value.resetEpoch === epoch);
    return legacy;
}

export function stateEnvelope(reset, revision, now = Date.now()) {
    return { schemaVersion: 1, resetEpoch: resetEpoch(reset), revision, updated: now };
}

export function spendOwner(objective) {
    const id = objective?.id ?? objective?.objective;
    if (["BUY_TOR", "BUY_PROGRAMS"].includes(id)) return "programs";
    if (id === "EXPAND_RAM") return "homeRam";
    if (["FACTION_REP", "LIQUIDATE_STOCKS", "THE_RED_PILL", "INSTALL_AUGMENTATIONS"].includes(id)) return "augmentations";
    if (id === "RESERVE_MILESTONE" && objective?.title === "Corporation Bootstrap ($150B)") return "corporation";
    return null;
}
