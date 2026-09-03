export const HOME_RAM_TIERS = Object.freeze({
    bootstrap: 8,
    early: 16,
    full: 64,
    operations: 128,
    advanced: 256,
});

export const FULL_ENGINE_HOME_RAM = HOME_RAM_TIERS.full;

export function stageScriptForRam(homeRam) {
    const ram = Math.max(0, Number(homeRam) || 0);
    if (ram < HOME_RAM_TIERS.early) return "/matrix/bootstrap.js";
    if (ram < HOME_RAM_TIERS.full) return "/matrix/early.js";
    return "/matrix/start.js";
}

export function stageIdForRam(homeRam) {
    const ram = Math.max(0, Number(homeRam) || 0);
    if (ram < HOME_RAM_TIERS.early) return "bootstrap";
    if (ram < HOME_RAM_TIERS.full) return "early";
    if (ram < HOME_RAM_TIERS.operations) return "full";
    if (ram < HOME_RAM_TIERS.advanced) return "operations";
    return "advanced";
}

export function fullEngineReady(homeRam) {
    return Math.max(0, Number(homeRam) || 0) >= FULL_ENGINE_HOME_RAM;
}
