/**
 * A fake Netscript environment.
 *
 * Every bug that has actually bitten this project was an integration bug that
 * parsed fine: the 8 GB overflow, the stale bootstrap lock, ns.self(), exec
 * silently refusing to launch. Pure-function tests cannot catch those. This can.
 *
 * The mock enforces real RAM: exec() refuses when threads * scriptRam exceeds a
 * server's free memory, exactly as the game does, and script costs come from the
 * same analyser the budget tests use.
 */
import fs from "node:fs";
import path from "node:path";
import { scriptRam } from "./ram-budget.mjs";

export const STOP = Symbol("mock-ns-stop");

/** A small but structurally faithful slice of the real Bitburner network. */
export function defaultNetwork() {
    return {
        home:              { ram: 8,  ports: 0, level: 1,   money: 0,          links: ["n00dles", "foodnstuff", "sigma-cosmetics", "joesguns"] },
        "n00dles":         { ram: 4,  ports: 0, level: 1,   money: 1750000,    links: ["home", "zer0"] },
        foodnstuff:        { ram: 16, ports: 0, level: 1,   money: 2000000,    links: ["home", "max-hardware"] },
        "sigma-cosmetics": { ram: 16, ports: 0, level: 5,   money: 2300000,    links: ["home"] },
        joesguns:          { ram: 16, ports: 0, level: 10,  money: 2700000,    links: ["home", "iron-gym"] },
        zer0:              { ram: 32, ports: 1, level: 75,  money: 7500000,    links: ["n00dles"] },
        "max-hardware":    { ram: 32, ports: 1, level: 80,  money: 10000000,   links: ["foodnstuff"] },
        "iron-gym":        { ram: 32, ports: 1, level: 100, money: 20000000,   links: ["joesguns", "phantasy"] },
        phantasy:          { ram: 64, ports: 2, level: 100, money: 24000000,   links: ["iron-gym"] },
    };
}

export function createMockNs({
    network = defaultNetwork(),
    hackingLevel = 120,
    crackers = ["BruteSSH.exe"],
    root = process.cwd(),
    hostname = "home",
    maxSleeps = 50,
    args = [],
} = {}) {
    const servers = new Map();
    for (const [name, spec] of Object.entries(network)) {
        servers.set(name, { ...spec, name, rooted: name === "home", opened: 0, files: new Set(), procs: [] });
    }
    const ramCache = new Map();
    const ramOf = file => {
        if (!ramCache.has(file)) {
            const source = fs.readFileSync(path.join(root, file.replace(/^\//, "")), "utf8");
            ramCache.set(file, scriptRam(source).ram);
        }
        return ramCache.get(file);
    };
    const server = name => {
        const found = servers.get(name);
        if (!found) throw new Error(`mock-ns: unknown server ${name}`);
        return found;
    };
    const usedRam = s => s.procs.reduce((sum, p) => sum + ramOf(p.file) * p.threads, 0);

    let sleeps = 0;
    let nextPid = 1;
    const ports = new Map();
    const log = [];
    const home = server("home");
    for (const file of crackers) home.files.add(file);
    // The installer puts every manifest file on home, so the mock must too -
    // otherwise scp() fails for reasons the real game would never produce.
    for (const entry of JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")).files) {
        if (entry.path.endsWith(".js") || entry.path.endsWith(".jsx")) home.files.add(`/${entry.path}`);
    }

    const ns = {
        args,
        pid: 1,
        getHostname: () => hostname,
        scan: host => [...server(host).links],
        hasRootAccess: host => server(host).rooted,
        getServerNumPortsRequired: host => server(host).ports,
        getServerMaxRam: host => server(host).ram,
        getServerUsedRam: host => usedRam(server(host)),
        getServerMaxMoney: host => server(host).money,
        getServerMoneyAvailable: host => server(host).money * 0.6,
        getServerRequiredHackingLevel: host => server(host).level,
        getServerSecurityLevel: () => 5,
        getServerMinSecurityLevel: () => 1,
        getHackingLevel: () => hackingLevel,
        fileExists: (file, host = hostname) => server(host).files.has(file),
        getScriptRam: file => ramOf(file),
        ls: (host, ext) => [...server(host).files].filter(f => !ext || f.endsWith(ext)),

        brutessh: host => { if (!home.files.has("BruteSSH.exe")) throw new Error("no BruteSSH"); server(host).opened++; },
        ftpcrack: () => { throw new Error("no FTPCrack.exe"); },
        relaysmtp: () => { throw new Error("no relaySMTP.exe"); },
        httpworm: () => { throw new Error("no HTTPWorm.exe"); },
        sqlinject: () => { throw new Error("no SQLInject.exe"); },
        nuke: host => {
            const s = server(host);
            if (s.opened < s.ports) throw new Error(`not enough ports open on ${host}`);
            s.rooted = true;
        },

        scp: (files, dest, src = hostname) => {
            const list = Array.isArray(files) ? files : [files];
            for (const file of list) {
                if (!server(src).files.has(file)) return false;
                server(dest).files.add(file);
            }
            return true;
        },
        exec: (file, host, opts = 1, ...args) => {
            const s = server(host);
            const threads = typeof opts === "number" ? opts : (opts.threads ?? 1);
            const preventDuplicates = typeof opts === "object" && opts.preventDuplicates;
            if (!s.files.has(file)) return 0;
            if (preventDuplicates && s.procs.some(p => p.file === file && String(p.args) === String(args))) return 0;
            const need = ramOf(file) * threads;
            if (need > s.ram - usedRam(s) + 1e-9) {
                log.push({ event: "ram-refused", file, host, need, free: s.ram - usedRam(s) });
                return 0;
            }
            const pid = nextPid++;
            s.procs.push({ pid, file, threads, args });
            log.push({ event: "exec", file, host, threads, args });
            return pid;
        },
        scriptKill: (file, host) => {
            const s = server(host);
            const before = s.procs.length;
            s.procs = s.procs.filter(p => p.file !== file);
            return s.procs.length !== before;
        },
        ps: host => server(host).procs.map(p => ({ ...p, filename: p.file })),
        kill: pid => { for (const s of servers.values()) s.procs = s.procs.filter(p => p.pid !== pid); return true; },
        isRunning: pid => [...servers.values()].some(s => s.procs.some(p => p.pid === pid)),

        writePort: (port, value) => { ports.set(port, value); return null; },
        peek: port => ports.get(port) ?? "NULL PORT DATA",
        readPort: port => { const v = ports.get(port) ?? "NULL PORT DATA"; ports.delete(port); return v; },
        clearPort: port => { ports.delete(port); },

        disableLog: () => {},
        print: () => {},
        tprint: msg => log.push({ event: "tprint", msg }),
        spawn: (file, opts, ...args) => { log.push({ event: "spawn", file, args }); throw STOP; },
        sleep: async () => { if (++sleeps >= maxSleeps) throw STOP; return true; },

        _servers: servers,
        _log: log,
        _used: name => usedRam(server(name)),
        _free: name => server(name).ram - usedRam(server(name)),
        _ports: ports,
        _addContract: (host, file) => server(host).files.add(file),
        // The same world, viewed from another host - this is how a worm instance
        // running on foodnstuff sees things.
        _as: other => ({ ...ns, getHostname: () => other, fileExists: (f, h = other) => server(h).files.has(f) }),
    };
    return ns;
}

/** Run a script's main() until it stops, swallowing only the stop sentinel. */
export async function run(main, ns) {
    try { await main(ns); }
    catch (error) { if (error !== STOP) throw error; }
    return ns;
}
