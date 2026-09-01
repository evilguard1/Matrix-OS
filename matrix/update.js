/**
 * MATRIX-OS self-updater.
 * Downloads the latest GitHub installer then hands control to it.
 */
const INSTALLER_URL = "https://raw.githubusercontent.com/evilguard1/Matrix-OS/main/install.js";
const LOCAL_INSTALLER = "/matrix/remote-install.js";

export async function main(ns) {
    ns.disableLog("ALL");
    ns.tprint("MATRIX-OS // FETCHING LATEST INSTALLER FROM GITHUB");
    const ok = await ns.wget(INSTALLER_URL, LOCAL_INSTALLER, "home");
    if (!ok) {
        ns.tprint("MATRIX-OS // UPDATE FAILED: could not download installer.");
        return;
    }
    ns.spawn(LOCAL_INSTALLER, 1);
}
