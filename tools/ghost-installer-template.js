// Offline installer. The release builder replaces GHOST_SOURCE and EXPECTED_BASE.
const GHOST_SOURCE = "__GHOST_SOURCE__";
const EXPECTED_BASE = "__EXPECTED_BASE__";
const TARGET = "/matrix/dashboard.jsx";
const BACKUP = "/matrix/backups/dashboard.pre-ghost-01.jsx";
const CANDIDATE = "/matrix/state/ghost-candidate.jsx";
const LEASE = "/matrix/state/dashboard.txt";
function fingerprint(source) {
    const text = source.replace(/\r\n/g, "\n");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
    return `${text.length}:${hash.toString(16)}`;
}
function isDeck(process) { return process.filename.replace(/^\/+/, "") === TARGET.slice(1); }
export async function main(ns) {
    ns.disableLog("ALL");
    if (ns.getHostname() !== "home") { ns.tprint("GHOST : exécuter cet installateur sur home."); return; }
    const restore = ns.args.includes("--restore");
    const original = ns.read(TARGET);
    if (!original) { ns.tprint("GHOST : MatrixOS doit être installé avant cette interface."); return; }
    if (!ns.fileExists("/matrix/lib/common.js", "home") || !ns.fileExists("/matrix/lib/singleton.js", "home")) {
        ns.tprint("GHOST : dépendances MatrixOS manquantes ; aucun changement."); return;
    }
    const proposed = restore ? ns.read(BACKUP) : GHOST_SOURCE;
    if (original === proposed) { ns.tprint("GHOST : cette version est déjà en place."); return; }
    if (restore && (fingerprint(proposed) !== EXPECTED_BASE || fingerprint(original) !== fingerprint(GHOST_SOURCE))) {
        ns.tprint("GHOST : restauration refusée, sauvegarde absente ou interface modifiée depuis. Fichiers conservés."); return;
    }
    if (!restore && fingerprint(original) !== EXPECTED_BASE) {
        ns.tprint("GHOST : interface différente de la base vérifiée 1.10.2. Aucun fichier écrasé. Comparer le code avant installation."); return;
    }
    const backup = ns.read(BACKUP);
    if (!restore && backup && fingerprint(backup) !== EXPECTED_BASE) {
        ns.tprint("GHOST : une autre sauvegarde occupe le chemin prévu. Elle a été conservée."); return;
    }
    if (ns.fileExists(CANDIDATE, "home")) {
        ns.tprint(`GHOST : le chemin temporaire ${CANDIDATE} est déjà occupé. Aucun fichier modifié.`); return;
    }
    let modified = false;
    try {
        await ns.write(CANDIDATE, proposed, "w");
        if (ns.read(CANDIDATE) !== proposed) throw new Error("Copie candidate non confirmée.");
        const needed = ns.getScriptRam(CANDIDATE, "home");
        if (!(needed > 0)) throw new Error("Le jeu n’a pas pu calculer la RAM du candidat.");
        const running = ns.ps("home").filter(isDeck);
        const released = running.reduce((sum, p) => sum + ns.getScriptRam(TARGET, "home") * p.threads, 0);
        const available = ns.getServerMaxRam("home") - ns.getServerUsedRam("home") + released;
        if (available + 1e-7 < needed) throw new Error(`RAM insuffisante pendant le remplacement : ${needed} Go requis, ${available.toFixed(2)} disponibles. Fermer seulement l’ancienne interface puis réessayer.`);
        if (!restore && !backup) {
            await ns.write(BACKUP, original, "w");
            if (ns.read(BACKUP) !== original) throw new Error("Sauvegarde non confirmée.");
        }
        modified = true;
        await ns.write(TARGET, proposed, "w");
        if (ns.read(TARGET) !== proposed) throw new Error("Écriture finale non confirmée.");
        for (const process of running) {
            try { ns.ui.closeTail(process.pid); } catch {}
            ns.kill(process.pid);
        }
        ns.rm(LEASE, "home");
        const already = ns.ps("home").find(isDeck);
        const pid = already?.pid ?? ns.run(TARGET, 1);
        if (!pid) throw new Error("Le jeu a refusé le démarrage de l’interface.");
        ns.tprint(`GHOST : ${restore ? "ancienne interface restaurée" : "dashboard installé"}. PID ${pid}, RAM calculée par le jeu ${needed} Go. Les services de jeu n’ont pas été redémarrés.`);
        ns.tprint("Vérifier la fenêtre et /matrix/state/dashboard.txt : un PID lancé ne garantit pas un rendu réussi.");
    } catch (error) {
        ns.tprint(`GHOST : ${String(error?.message ?? error)}`);
        if (modified) {
            await ns.write(TARGET, original, "w");
            if (ns.read(TARGET) !== original) { ns.tprint(`GHOST : restauration automatique non confirmée. Sauvegarde : ${BACKUP}`); return; }
            ns.rm(LEASE, "home");
            if (!ns.ps("home").some(isDeck)) ns.run(TARGET, 1);
            ns.tprint("GHOST : fichier précédent restauré après l’échec ; vérifier sa fenêtre.");
        }
    } finally { ns.rm(CANDIDATE, "home"); }
}
