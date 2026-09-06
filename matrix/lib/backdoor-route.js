export const HACKING_ROUTES = Object.freeze([
    {target:"CSEC", faction:"CyberSec"},
    {target:"avmnite-02h", faction:"NiteSec"},
    {target:"I.I.I.I", faction:"The Black Hand"},
    {target:"run4theh111z", faction:"BitRunners"},
]);

export function routeStatus(server, level, durationMs, limitMs) {
    if (!server) return "not-discovered";
    if (server.backdoorInstalled === true) return "installed";
    if (!server.hasAdminRights) return "needs-root";
    if (!Number.isFinite(level) || !Number.isFinite(server.requiredHackingSkill) || level < server.requiredHackingSkill) return "needs-skill";
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > limitMs) return "waiting-faster-hacking";
    return "ready";
}
