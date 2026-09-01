/**
 * Compatibility entry point for the original MATRIX-OS instructions.
 * The maintained launcher is /matrix/start.js.
 */
export async function main(ns) {
    ns.disableLog("ALL");
    const args = [...ns.args];
    const pid = ns.run("/matrix/start.js", { threads: 1, preventDuplicates: true }, ...args);
    if (pid) {
        ns.tprint("MATRIX-OS // STARTED /matrix/start.js");
        return;
    }

    const bootstrapPid = ns.run("/matrix/bootstrap.js", { threads: 1, preventDuplicates: true });
    if (bootstrapPid) {
        ns.tprint("MATRIX-OS // STARTED LOW-RAM MODE /matrix/bootstrap.js");
        return;
    }

    ns.tprint("MATRIX-OS // COULD NOT START: HOME has insufficient free RAM.");
    ns.tprint("MATRIX-OS // Try again with: run /matrix/start.js");
}
