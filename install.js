/**
 * MATRIX-OS GitHub installer/updater.
 * Bitburner 3.0.1+
 *
 * First install:
 *   wget https://raw.githubusercontent.com/evilguard1/Matrix-OS/main/install.js install.js
 *   run install.js --fresh
 *
 * Updates after that:
 *   run /matrix/update.js
 */
const BASE = "https://raw.githubusercontent.com/evilguard1/Matrix-OS/main";
const FILES = [
    [
        "matrix/VERSION.txt",
        "/matrix/VERSION.txt"
    ],
    [
        "matrix/bootstrap.js",
        "/matrix/bootstrap.js"
    ],
    [
        "matrix/config.txt",
        "/matrix/config.txt"
    ],
    [
        "matrix/dashboard.jsx",
        "/matrix/dashboard.jsx"
    ],
    [
        "matrix/lib/common.js",
        "/matrix/lib/common.js"
    ],
    [
        "matrix/lib/network.js",
        "/matrix/lib/network.js"
    ],
    [
        "matrix/services/bladeburner.js",
        "/matrix/services/bladeburner.js"
    ],
    [
        "matrix/services/cloud.js",
        "/matrix/services/cloud.js"
    ],
    [
        "matrix/services/contracts.js",
        "/matrix/services/contracts.js"
    ],
    [
        "matrix/services/corporation.js",
        "/matrix/services/corporation.js"
    ],
    [
        "matrix/services/gang.js",
        "/matrix/services/gang.js"
    ],
    [
        "matrix/services/hacking.js",
        "/matrix/services/hacking.js"
    ],
    [
        "matrix/services/hacknet.js",
        "/matrix/services/hacknet.js"
    ],
    [
        "matrix/services/root.js",
        "/matrix/services/root.js"
    ],
    [
        "matrix/services/singularity.js",
        "/matrix/services/singularity.js"
    ],
    [
        "matrix/services/sleeves.js",
        "/matrix/services/sleeves.js"
    ],
    [
        "matrix/services/stock.js",
        "/matrix/services/stock.js"
    ],
    [
        "matrix/services/telemetry.js",
        "/matrix/services/telemetry.js"
    ],
    [
        "matrix/start.js",
        "/matrix/start.js"
    ],
    [
        "matrix/kernel.js",
        "/matrix/kernel.js"
    ],
    [
        "matrix/update.js",
        "/matrix/update.js"
    ],
    [
        "matrix/workers/early.js",
        "/matrix/workers/early.js"
    ],
    [
        "matrix/workers/grow.js",
        "/matrix/workers/grow.js"
    ],
    [
        "matrix/workers/hack.js",
        "/matrix/workers/hack.js"
    ],
    [
        "matrix/workers/weaken.js",
        "/matrix/workers/weaken.js"
    ]
];
const RUNTIME = [
    "/matrix/start.js",
    "/matrix/kernel.js",
    "/matrix/bootstrap.js",
    "/matrix/dashboard.jsx",
    "/matrix/services/root.js",
    "/matrix/services/hacking.js",
    "/matrix/services/cloud.js",
    "/matrix/services/hacknet.js",
    "/matrix/services/contracts.js",
    "/matrix/services/telemetry.js",
    "/matrix/services/stock.js",
    "/matrix/services/singularity.js",
    "/matrix/services/gang.js",
    "/matrix/services/sleeves.js",
    "/matrix/services/bladeburner.js",
    "/matrix/services/corporation.js",
];
const WORKERS = [
    "/matrix/workers/early.js",
    "/matrix/workers/hack.js",
    "/matrix/workers/grow.js",
    "/matrix/workers/weaken.js",
];

function allHosts(ns) {
    const seen = new Set(["home"]);
    const q = ["home"];
    while (q.length) {
        const h = q.shift();
        for (const n of ns.scan(h)) {
            if (seen.has(n)) continue;
            seen.add(n); q.push(n);
        }
    }
    return [...seen];
}

function stopMatrix(ns) {
    for (const f of RUNTIME) {
        try { ns.scriptKill(f, "home"); } catch {}
    }
    for (const host of allHosts(ns)) {
        for (const f of WORKERS) {
            try { ns.scriptKill(f, host); } catch {}
        }
        try {
            for (const p of ns.ps(host)) {
                const name = String(p.filename).replace(/^\/+/, "");
                if (RUNTIME.some(f => f.replace(/^\/+/, "") === name) ||
                    WORKERS.some(f => f.replace(/^\/+/, "") === name)) {
                    ns.kill(p.pid, host);
                }
            }
        } catch {}
    }
}

export async function main(ns) {
    ns.disableLog("ALL");
    const fresh = ns.args.includes("--fresh");
    const noStart = ns.args.includes("--no-start");

    ns.tprint("MATRIX-OS // GITHUB INSTALLER ONLINE");
    ns.tprint(fresh ? "MATRIX-OS // MODE: FRESH INSTALL" : "MATRIX-OS // MODE: UPDATE (config preserved)");

    stopMatrix(ns);
    await ns.sleep(100);

    let ok = 0;
    const failed = [];
    for (const [remote, local] of FILES) {
        if (!fresh && local === "/matrix/config.txt" && ns.fileExists(local, "home")) {
            ns.tprint("MATRIX-OS // PRESERVED /matrix/config.txt");
            continue;
        }
        const success = await ns.wget(`${BASE}/${remote}`, local, "home");
        if (success) ok++;
        else failed.push(local);
    }

    ns.tprint(`MATRIX-OS // ${ok} FILES UPDATED`);
    if (failed.length) {
        ns.tprint(`MATRIX-OS // ${failed.length} DOWNLOAD(S) FAILED:`);
        for (const f of failed) ns.tprint(`  ${f}`);
        ns.tprint("MATRIX-OS // NOT STARTING: fix downloads first.");
        return;
    }

    if (noStart) {
        ns.tprint("MATRIX-OS // UPDATE COMPLETE (--no-start)");
        return;
    }

    let pid = ns.run("/matrix/start.js", { threads: 1, preventDuplicates: true });
    if (pid) {
        ns.tprint("MATRIX-OS // AUTONOMOUS CONTROL SYSTEM STARTED: /matrix/start.js");
    } else {
        pid = ns.run("/matrix/bootstrap.js", { threads: 1, preventDuplicates: true });
        if (pid) {
            ns.tprint("MATRIX-OS // LOW-RAM BOOTSTRAP STARTED: /matrix/bootstrap.js");
        } else {
            ns.tprint("MATRIX-OS // FILES UPDATED; launch deferred because HOME has insufficient free RAM.");
            ns.tprint("MATRIX-OS // Try: run /matrix/start.js");
        }
    }
}
