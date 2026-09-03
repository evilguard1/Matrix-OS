import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";
import { scriptRam, stripComments, DOM_IDENTIFIERS, RAM_COSTS } from "./ram-budget.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const configFile = JSON.parse(read("matrix/config.json"));
const asFileImports = source => source.replace(
    /from\s+["'](\/matrix\/[^"']+)["']/g,
    (_, spec) => `from "${pathToFileURL(path.join(root, spec.replace(/^\//, ""))).href}"`,
);
const importRewritten = async relative => {
    const source = asFileImports(read(relative));
    return await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
};

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const absolute = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(absolute) : [absolute];
    });
}

assert.equal(configFile.version, manifest.version, "config and manifest versions must match");
assert.match(read("matrix/VERSION.txt"), new RegExp(manifest.version.replaceAll(".", "\\.")));
assert.equal(new Set(manifest.files.map(entry => entry.path)).size, manifest.files.length, "manifest paths must be unique");
assert.ok(manifest.protectedFiles.includes("matrix/config.json"), "config.json must be update-protected");

const stages = [...manifest.stages].sort((a, b) => a.minHomeRam - b.minHomeRam);
assert.deepEqual(manifest.stages, stages, "manifest stages must be ordered by RAM");
assert.deepEqual(
    manifest.stages.map(stage => [stage.id, stage.minHomeRam]),
    [["bootstrap", 8], ["early", 16], ["full", 64], ["operations", 128], ["advanced", 256]],
    "manifest stage thresholds must match the centralized 8/16/64/128/256 architecture",
);
const stageIndex = new Map(stages.map((stage, index) => [stage.id, index]));
const fileStage = new Map(manifest.files.map(entry => [entry.path, entry.stage]));

const required = [
    "matrix/bootstrap.js", "matrix/early.js", "matrix/kernel.js", "matrix/start.js",
    "matrix/dashboard.jsx", "matrix/update.js", "matrix/config.json", "matrix/lib/stages.js",
    "matrix/services/root.js", "matrix/services/hacking.js", "matrix/services/telemetry.js",
    "matrix/services/progression.js", "matrix/services/coordinator.js",
];
for (const relative of required) assert.ok(fileStage.has(relative), `${relative} is missing from the manifest`);

for (const entry of manifest.files) {
    const absolute = path.join(root, entry.path);
    assert.ok(fs.existsSync(absolute), `${entry.path} does not exist`);
    assert.ok(stageIndex.has(entry.stage), `${entry.path} references unknown stage ${entry.stage}`);
    const source = fs.readFileSync(absolute, "utf8");
    for (const match of source.matchAll(/from\s+["']\/matrix\/([^"']+)["']/g)) {
        const imported = `matrix/${match[1]}`;
        assert.ok(fileStage.has(imported), `${entry.path} imports unmanifested ${imported}`);
        assert.ok(
            stageIndex.get(fileStage.get(imported)) <= stageIndex.get(entry.stage),
            `${entry.path} imports ${imported} from a later stage`,
        );
    }
}

const runtimeFiles = [path.join(root, "install.js"), ...walk(path.join(root, "matrix"))]
    .filter(file => /\.(?:js|jsx)$/.test(file));
for (const absolute of runtimeFiles) {
    const source = fs.readFileSync(absolute, "utf8");
    const loader = absolute.endsWith(".jsx") ? "jsx" : "js";
    await transform(source, { loader, format: "esm", target: "es2022" });
    assert.doesNotMatch(source, /\bns\.closeTail\b/, `${absolute} uses the removed pre-v3 tail API`);
    assert.doesNotMatch(source, /\bui\.renderPage\b/, `${absolute} uses a dev-only UI API`);
    assert.doesNotMatch(source, /\bns\.self\b/, `${absolute} uses non-existent ns.self API`);
    assert.deepEqual(stripComments(source).match(DOM_IDENTIFIERS) ?? [], [],
        `${absolute} touches the DOM, which costs 25 GB`);
    for (const match of source.matchAll(/["'`](\/matrix\/state\/[^"'`$]+)["'`]/g)) {
        assert.match(match[1], /\.(?:txt|json|js|jsx)$/, `${absolute} uses an invalid Bitburner state-file extension`);
    }
}

const updateSource = read("matrix/update.js");
assert.doesNotMatch(updateSource, /\bns\.(?:spawn|run|exec|wget|ps)\b/, "the 8 GB updater must remain request-only");
assert.doesNotMatch(read("matrix/bootstrap.js"), /from\s+["']\/matrix\//, "bootstrap must remain standalone");
assert.match(read("install.js"), /api\.github\.com\/repos\/evilguard1\/Matrix-OS\/commits\/main/);
assert.match(read("install.js"), /\$\{release\}\//, "installer downloads must be pinned to the resolved commit");
const singularitySource = read("matrix/services/singularity.js");
assert.match(singularitySource, /spending-reserve\.txt/, "Singularity must publish its augmentation funding reserve");
assert.match(singularitySource, /donateToFaction/, "Singularity must use unlocked faction donations");
assert.match(singularitySource, /getAugmentationPrereq/, "Singularity must respect augmentation dependencies");
const startSource = read("matrix/start.js");
assert.ok(startSource.indexOf('file: "/matrix/services/hacking.js"') < startSource.indexOf("file: DASHBOARD"),
    "hacking must launch before the full dashboard");
assert.match(startSource, /getScriptRam\(UPDATE_SCRIPT/, "the full supervisor must reserve RAM for self-update");

const { scanNetwork, tryRoot, chooseTarget, chooseStarterAction } = await import(pathToFileURL(path.join(root, "matrix/bootstrap.js")));
const { stageForRam } = await importRewritten("matrix/kernel.js");
const { stageIdForRam, FULL_ENGINE_HOME_RAM } = await import(pathToFileURL(path.join(root, "matrix/lib/stages.js")));
const { autonomousDronesAllowed } = await import(pathToFileURL(path.join(root, "matrix/worm/spread.js")));
const { config, plannedNextBitNode, reserveMoney } = await import(pathToFileURL(path.join(root, "matrix/lib/common.js")));
const { eligibleFiles } = await import(pathToFileURL(path.join(root, "install.js")));

assert.equal(FULL_ENGINE_HOME_RAM, 64);
assert.equal(stageForRam(8), "/matrix/bootstrap.js");
assert.equal(stageForRam(16), "/matrix/early.js");
assert.equal(stageForRam(32), "/matrix/early.js");
assert.equal(stageForRam(63), "/matrix/early.js");
assert.equal(stageForRam(64), "/matrix/start.js");
assert.equal(stageIdForRam(64), "full");
assert.equal(stageIdForRam(128), "operations");
assert.equal(stageIdForRam(256), "advanced");
assert.deepEqual([...new Set(eligibleFiles(manifest, 8).map(entry => entry.stage))], ["bootstrap"]);
assert.deepEqual([...new Set(eligibleFiles(manifest, 16).map(entry => entry.stage))], ["bootstrap", "early"]);
assert.deepEqual([...new Set(eligibleFiles(manifest, 64).map(entry => entry.stage))], ["bootstrap", "early", "full"]);
assert.deepEqual([...new Set(eligibleFiles(manifest, 128).map(entry => entry.stage))], ["bootstrap", "early", "full", "operations"]);
assert.equal(eligibleFiles(manifest, 256).length, manifest.files.length);

const graph = {
    home: ["n00dles", "foodnstuff"], n00dles: ["home", "sigma-cosmetics"],
    foodnstuff: ["home"], "sigma-cosmetics": ["n00dles"],
};
assert.deepEqual(scanNetwork({ scan: host => graph[host] }), ["home", "n00dles", "foodnstuff", "sigma-cosmetics"]);
const rooted = new Set(["home"]);
let bruteCalls = 0;
const rootMock = {
    hasRootAccess: host => rooted.has(host), fileExists: file => file === "BruteSSH.exe",
    getServerNumPortsRequired: () => 1, brutessh: () => { bruteCalls++; },
    ftpcrack: () => {}, relaysmtp: () => {}, httpworm: () => {}, sqlinject: () => {},
    nuke: host => rooted.add(host),
};
assert.equal(tryRoot(rootMock, "foodnstuff"), true);
assert.equal(bruteCalls, 1);

const targetMock = {
    getHackingLevel: () => 20, hasRootAccess: host => host !== "home",
    getServerMaxMoney: host => ({ n00dles: 100_000, foodnstuff: 2_000_000 }[host] ?? 0),
    getServerMoneyAvailable: host => ({ n00dles: 70_000, foodnstuff: 2_000_000 }[host] ?? 0),
    getServerRequiredHackingLevel: host => ({ n00dles: 1, foodnstuff: 10 }[host] ?? 1),
};
assert.equal(chooseTarget(targetMock, ["home", "n00dles", "foodnstuff"]), "foodnstuff");
targetMock.getServerMoneyAvailable = host => ({ n00dles: 70_000, foodnstuff: 1_000 }[host] ?? 0);
assert.equal(chooseTarget(targetMock, ["home", "n00dles", "foodnstuff"]), "n00dles");
assert.equal(chooseStarterAction(2_000_000, 50_000_000, 10, 3), "hack");
assert.equal(chooseStarterAction(100_000, 50_000_000, 10, 3), "grow");
assert.equal(chooseStarterAction(2_000_000, 50_000_000, 95, 3), "weaken");

const merged = config({ read: file => file.endsWith("config.json") ? '{"economy":{"cashReserve":123}}' : "" });
assert.equal(merged.economy.cashReserve, 123);
assert.equal(merged.economy.cloudBudgetFraction, 0.12, "nested defaults must survive partial configuration");
const migratedDefaults = config({ read: file => file.endsWith("config.json")
    ? '{"hacking":{"maxBatches":24,"fullEngineHomeRam":32}}' : "" });
assert.equal(migratedDefaults.hacking.maxBatches, null, "stale protected batch cap must migrate");
assert.equal(migratedDefaults.hacking.fullEngineHomeRam, 64, "stale protected full-engine marker must migrate to 64 GB");
const reserveMock = {
    getServerMoneyAvailable: () => 100_000_000,
    read: file => file.endsWith("spending-reserve.txt") ? JSON.stringify({ amount: 80_000_000, updated: Date.now() }) : "",
};
assert.equal(config(reserveMock).progression.donationFavorThreshold, 150, "new progression defaults must apply to preserved configs");
assert.equal(reserveMoney(reserveMock), 80_000_000, "fresh augmentation reserve must protect progression funds");
reserveMock.read = file => file.endsWith("spending-reserve.txt") ? JSON.stringify({ amount: 80_000_000, updated: 0 }) : "";
assert.equal(reserveMoney(reserveMock), 15_000_000, "stale augmentation reserve must not freeze economy spending");

const { evaluateObjective, planDirectives } = await importRewritten("matrix/services/coordinator.js");
const reset = { currentNode: 4, ownedSF: new Map([[4, 1], [5, 0]]) };
assert.equal(plannedNextBitNode(reset, [4, 4, 4, 5]), 4);
assert.equal(plannedNextBitNode({ currentNode: 1, ownedSF: new Map([[4, 3]]) }, [4, 4, 4, 5]), 5);

const objGang = evaluateObjective({ karma: -10, resetInfo: { currentNode: 2 } });
assert.equal(objGang.id, "GANG_KARMA");
assert.equal(objGang.liquidateStocks, false);
const objDaedalus = evaluateObjective({ cash: 10_000_000_000, stockPortfolioValue: 95_000_000_000, hackingLevel: 2000 });
assert.equal(objDaedalus.id, "RESERVE_MILESTONE");
assert.equal(objDaedalus.liquidateStocks, true);
const objDaemon = evaluateObjective({ worldDaemonRooted: true, hackingLevel: 3000, worldDaemonReqLevel: 3000 });
assert.equal(objDaemon.id, "W0R1D_D43M0N");
assert.equal(objDaemon.liquidateStocks, true);
const objAugs = evaluateObjective({ queuedAugs: 12 });
assert.equal(objAugs.id, "INSTALL_AUGMENTATIONS");
assert.equal(objAugs.liquidateStocks, true);
const objTor = evaluateObjective({ cash: 300_000, hasTor: false });
assert.equal(objTor.id, "BUY_TOR");
assert.notEqual(objTor.id, evaluateObjective({
    cash: 300_000, hasTor: true, missingPrograms: ["BruteSSH.exe"], programCosts: 500_000,
}).id, "two different objectives must not share an id");

const dirBoot = planDirectives({ cash: 5_000, hasTor: false });
assert.equal(dirBoot.phase, "BOOTSTRAP", "low-cash fresh save is the bootstrap phase");
assert.equal(dirBoot.directives.hacking, "xp", "bootstrap rushes hacking XP");
assert.equal(dirBoot.directives.singularity, "programs", "bootstrap without TOR funds port programs first");
assert.equal(dirBoot.directives.gang, "idle", "no gang yet means no gang directive");
assert.equal(dirBoot.budgets.homeRam, 0.5, "bootstrap spends aggressively on Home RAM");
const dirEarly32 = planDirectives({ cash: 5_000, hasTor: true, homeRam: 32 });
assert.equal(dirEarly32.phase, "BOOTSTRAP", "32-63 GB remains the early/worm-owned economy");
const dirEarly63 = planDirectives({ cash: 5_000, hasTor: true, homeRam: 63 });
assert.equal(dirEarly63.phase, "BOOTSTRAP", "63 GB must still use early-stage directives");
const dirKarma = planDirectives({ karma: -10, resetInfo: { currentNode: 2 } });
assert.equal(dirKarma.phase, "KARMA_GANG");
assert.equal(dirKarma.directives.sleeves, "karma", "karma rush points every sleeve at homicide");
assert.equal(dirKarma.directives.gang, "idle");
const dirReset = planDirectives({ queuedAugs: 12 });
assert.equal(dirReset.phase, "AUG_RESET");
assert.equal(dirReset.directives.stock, "liquidate", "an imminent reset liquidates the portfolio");
assert.equal(dirReset.directives.singularity, "augs", "reset phase stops faction work and buys queued augs");
assert.equal(dirReset.budgets.hacknet, 0);
assert.equal(dirReset.budgets.cloud, 0);
assert.equal(dirReset.budgets.sleeveAugs, 0.001);
const dirMilestone = planDirectives({ cash: 10_000_000_000, stockPortfolioValue: 95_000_000_000, hackingLevel: 2000 });
assert.equal(dirMilestone.phase, "MILESTONE");
assert.equal(dirMilestone.budgets.cloud, 0);
assert.equal(dirMilestone.directives.stock, "liquidate");
const dirEndgame = planDirectives({ worldDaemonRooted: true, hackingLevel: 3000, worldDaemonReqLevel: 3000 });
assert.equal(dirEndgame.phase, "ENDGAME");
assert.equal(dirEndgame.budgets.stock, 0);
assert.equal(dirEndgame.directives.stock, "liquidate");
const dirEcon = planDirectives({ cash: 5_000_000, hasTor: true, hackingLevel: 800, homeRam: 64 });
assert.equal(dirEcon.phase, "HACK_ECON", "64 GB starts the steady-state full-engine economy");
assert.equal(dirEcon.directives.hacking, "money");
assert.equal(dirEcon.directives.stock, "trade");
assert.equal(dirEcon.budgets.hacknet, 0.04);
assert.equal(dirEcon.budgets.homeRam, 0.15);
const dirRepGrind = planDirectives({ targetAugPrice: 5_000_000_000, targetAugName: "X", targetAugFaction: "Daedalus", cash: 1_000_000_000 });
assert.equal(dirRepGrind.phase, "FACTION_REP");
assert.equal(dirRepGrind.directives.sleeves, "rep:Daedalus");

// Live-derived v3.0.1 RAM constants that caused the old 32-GB false pass.
assert.equal(RAM_COSTS.getResetInfo, 1.0);
assert.equal(RAM_COSTS.scriptKill, 1.0);
assert.equal(RAM_COSTS.rm, 0.6);

// Imported-export reachability: importing a cheap export must not charge an
// unrelated expensive export from the same module.
{
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "matrix-ram-fixture-"));
    fs.mkdirSync(path.join(fixture, "matrix"), { recursive: true });
    fs.writeFileSync(path.join(fixture, "matrix", "lib.js"), [
        "export function cheap(ns) { return ns.read('x'); }",
        "export function expensive(ns) { return ns.getServer('n00dles'); }",
    ].join("\n"));
    const entry = "import { cheap } from '/matrix/lib.js'; export function main(ns) { cheap(ns); }";
    fs.writeFileSync(path.join(fixture, "entry.js"), entry);
    const measured = scriptRam(entry, { root: fixture });
    assert.equal(measured.ram, 1.6, "unused imported exports must not add Netscript RAM");
    assert.ok(!measured.used.includes("getServer"), "unused getServer export leaked into reachable RAM set");
    fs.rmSync(fixture, { recursive: true, force: true });
}

const wormRam = {};
for (const name of ["seed", "spread", "drone"]) {
    const source = read(`matrix/worm/${name}.js`);
    assert.doesNotMatch(source, /^\s*import\s/m, `matrix/worm/${name}.js must not import`);
    const measured = scriptRam(source);
    assert.deepEqual(measured.unknown, [], `matrix/worm/${name}.js uses unknown RAM APIs: ${measured.unknown.join(", ")}`);
    wormRam[name] = measured.ram;
}
assert.ok(wormRam.drone <= 4, `drone must fit a 4 GB server, is ${wormRam.drone} GB`);
assert.ok(wormRam.spread + wormRam.drone <= 8, `spread + drone must fit 8 GB, is ${wormRam.spread + wormRam.drone} GB`);
assert.ok(wormRam.seed <= 8, `seed must fit an 8 GB home, is ${wormRam.seed} GB`);
const bootstrapRam = scriptRam(read("matrix/bootstrap.js"), { root });
assert.deepEqual(bootstrapRam.unknown, [], `bootstrap.js uses unknown RAM APIs: ${bootstrapRam.unknown.join(", ")}`);
assert.ok(bootstrapRam.ram <= 8, `bootstrap.js must fit an 8 GB home, is ${bootstrapRam.ram} GB`);
const constantIn = (file, name) => {
    const line = read(file).split("\n").find(entry => entry.trim().startsWith(`const ${name} = `));
    return line ? Number(line.split("=")[1].replace(";", "").trim()) : NaN;
};
assert.equal(constantIn("matrix/worm/spread.js", "SPREAD_RAM"), wormRam.spread);
assert.equal(constantIn("matrix/worm/spread.js", "DRONE_RAM"), wormRam.drone);
assert.equal(constantIn("matrix/worm/seed.js", "SPREAD_RAM"), wormRam.spread);
assert.match(read("matrix/kernel.js"), /worm\/seed\.js/);
const installerSource = read("install.js");
for (const name of ["seed", "spread", "drone"]) {
    assert.ok(!installerSource.includes(`"matrix/worm/${name}.js"`),
        `installer must not directly sweep matrix/worm/${name}.js`);
}
assert.equal(autonomousDronesAllowed(8), true);
assert.equal(autonomousDronesAllowed(16), true);
assert.equal(autonomousDronesAllowed(32), true, "32 GB remains worm-owned early economy");
assert.equal(autonomousDronesAllowed(63), true, "worm earning must persist until HWGW actually owns H/G/W");
assert.equal(autonomousDronesAllowed(64), false, "64 GB rolling HWGW handoff must disable autonomous drones");
assert.equal(autonomousDronesAllowed(4096), false);
assert.match(read("matrix/worm/seed.js"), /scriptKill\(SPREAD, host\)[\s\S]*scriptKill\(DRONE, host\)/);
assert.doesNotMatch(read("matrix/worm/spread.js"), /DRONE_SHARE_WITH_HWGW/);
assert.match(read("matrix/worm/spread.js"), /if \(hwgwActive\)[\s\S]*scriptKill\(DRONE, host\)/);

const cap = await import(pathToFileURL(path.join(root, "matrix/lib/capabilities.js")));
const hud = await import(pathToFileURL(path.join(root, "matrix/lib/hud.js")));
const near = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) / expected < 1e-6, `${label}: got ${actual}, expected ~${expected}`);
near(cap.homeRamUpgradeCost(8), 1_009_743.872, "8->16GB Home RAM price");
near(cap.homeRamUpgradeCost(16), 3_190_790.63552, "16->32GB Home RAM price");
near(cap.homeRamUpgradeCost(64), 31_861_958.97, "64->128GB Home RAM price");
assert.equal(cap.serverCost(8), 440_000);
assert.equal(cap.bestServerBuy(100_000), 0);
assert.equal(cap.bestServerBuy(439_999), 0);
assert.equal(cap.bestServerBuy(440_000), 8);
assert.equal(cap.bestServerBuy(1_000_000), 16);
assert.ok(cap.bestServerBuy(1e12, 2.4) * 1 >= 8);
assert.equal(cap.singularityReady({ currentNode: 1, ownedSF: new Map() }), false);
assert.equal(cap.singularityReady({ currentNode: 4, ownedSF: new Map() }), true);
assert.equal(cap.singularityReady({ currentNode: 1, ownedSF: new Map([[4, 1]]) }), true);
const nextProgram = cap.nextPortProgram(["BruteSSH.exe"], 92);
assert.equal(nextProgram.file, "FTPCrack.exe");
assert.equal(nextProgram.canCreate, false);
assert.equal(nextProgram.levelsToGo, 8);
assert.equal(cap.nextPortProgram(["BruteSSH.exe"], 100).canCreate, true);
assert.equal(cap.nextPortProgram(cap.PORT_PROGRAMS.map(p => p.file), 999), null);
assert.deepEqual(cap.manualActions({ singularity: true }), []);
const labelWidth = hud.cols("  🟢 BUY SERVER  : ");
for (const scenario of [
    { homeRam: 8, cash: 0, hackingLevel: 1, ownedPrograms: [] },
    { homeRam: 16, cash: 367_415, hackingLevel: 92, ownedPrograms: ["BruteSSH.exe"] },
    { homeRam: 64, cash: 2e8, hackingLevel: 760, ownedPrograms: ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe"] },
    { homeRam: 512, cash: 5e9, hackingLevel: 900, ownedPrograms: cap.PORT_PROGRAMS.map(p => p.file) },
]) {
    for (const action of cap.manualActions(scenario)) {
        assert.ok(action.tag && hud.cols(action.tag) <= 11, `tag "${action.tag}" must fit the label column`);
        assert.ok(action.short, `${action.id} needs a short form`);
        const value = `${action.cost > 0 ? cap.formatCost(action.cost) + "  " : ""}${action.short}`;
        assert.ok(hud.cols(value) <= hud.WIDTH - labelWidth,
            `manual action "${value}" is ${hud.cols(value)} cols, only ${hud.WIDTH - labelWidth} available`);
    }
}
const boxLines = [
    hud.top(), hud.bottom(), hud.rule(), hud.rule("B O T N E T"), hud.center("M A T R I X"),
    hud.row("🎯", "TARGET", "n00dles"), hud.row("🕸️", "SWARM TGT", "x".repeat(400)), hud.row("⏳", "EST. TIME", ""),
];
for (const line of boxLines) assert.equal(hud.cols(line), hud.WIDTH + 2, `box line drifted: ${JSON.stringify(line)}`);
assert.equal(hud.cols("🎯"), 2);
assert.equal(hud.cols("⠹"), 1);
assert.equal(hud.bar(0.5, 16), "████████░░░░░░░░");

// Runtime service floors plus actual script-RAM model.
const { SERVICES } = await importRewritten("matrix/start.js");
const UPDATE_RESERVE = scriptRam(read("matrix/update.js"), { root }).ram;
for (const service of SERVICES) {
    const relative = service.file.replace(/^\//, "");
    const measured = scriptRam(read(relative), { sf4: service.sf4Level3 ? 3 : 0, root });
    assert.deepEqual(measured.unknown, [], `${relative} uses unknown RAM APIs: ${measured.unknown.join(", ")}`);
    assert.ok(service.minRam >= measured.ram + UPDATE_RESERVE,
        `${relative} declares minRam ${service.minRam} but needs ${measured.ram} + ${UPDATE_RESERVE} reserve`);
}

// The selected 64-GB full tier must coexist. Root/contracts intentionally wait
// until 128 so service ordering cannot silently choose winners at 64.
const at64 = SERVICES.filter(s => s.minRam <= 64);
const total64 = at64.reduce((sum, s) => sum + scriptRam(read(s.file.replace(/^\//, "")), { root }).ram, 0)
    + scriptRam(read("matrix/start.js"), { root }).ram + UPDATE_RESERVE;
assert.ok(total64 <= 64, `the 64 GB full tier needs ${Math.round(total64 * 100) / 100} GB and does not fit`);
for (const requiredName of ["hacking.js", "dashboard", "telemetry.js", "coordinator.js", "hacknet.js", "cloud.js", "go.js"]) {
    assert.ok(at64.some(s => s.file.includes(requiredName)), `${requiredName} must be eligible at 64 GB`);
}
assert.ok(!at64.some(s => s.file.includes("root.js")), "worm-backed root.js must be deferred at 64 GB");
assert.ok(!at64.some(s => s.file.includes("contracts.js")), "contracts must be deferred at 64 GB");

const at128Ungated = SERVICES.filter(s => s.minRam <= 128 && s.sf === undefined);
const total128Ungated = at128Ungated.reduce((sum, s) => sum + scriptRam(read(s.file.replace(/^\//, "")), { root }).ram, 0)
    + scriptRam(read("matrix/start.js"), { root }).ram + UPDATE_RESERVE;
assert.ok(total128Ungated <= 128,
    `the ungated 128 GB operations tier needs ${Math.round(total128Ungated * 100) / 100} GB and does not fit`);

const sing = SERVICES.find(s => s.file.includes("singularity.js"));
assert.ok(sing.sf4Level3);
assert.ok(scriptRam(read("matrix/services/singularity.js"), { root }).ram > 1000);
assert.ok(scriptRam(read("matrix/services/singularity.js"), { sf4: 3, root }).ram < 100);

const { solvers } = await import(pathToFileURL(path.join(root, "matrix/lib/solvers.js")));
const solverCases = [
    ["Find Largest Prime Factor", 13195, 29], ["Find Largest Prime Factor", 48, 3],
    ["Subarray with Maximum Sum", [-2, 1, -3, 4, -1, 2, 1, -5, 4], 6],
    ["Total Ways to Sum", 5, 6], ["Total Ways to Sum II", [10, [1, 2, 5]], 10],
    ["Spiralize Matrix", [[1,2,3],[4,5,6],[7,8,9]], [1,2,3,6,9,8,7,4,5]],
    ["Array Jumping Game", [2,3,1,1,4], 1], ["Array Jumping Game II", [2,3,1,1,4], 2],
    ["Merge Overlapping Intervals", [[1,3],[2,6],[8,10]], [[1,6],[8,10]]],
    ["Algorithmic Stock Trader I", [7,1,5,3,6,4], 5],
    ["Algorithmic Stock Trader II", [7,1,5,3,6,4], 7],
    ["Algorithmic Stock Trader III", [3,3,5,0,0,3,1,4], 6],
    ["Algorithmic Stock Trader IV", [2,[3,2,6,5,0,3]], 7],
    ["Minimum Path Sum in a Triangle", [[2],[3,4],[6,5,7],[4,1,8,3]], 11],
    ["Unique Paths in a Grid I", [3,7], 28],
    ["Unique Paths in a Grid II", [[0,0,0],[0,1,0],[0,0,0]], 2],
    ["Encryption I: Caesar Cipher", ["MEDIUM",1], "LDCHTL"],
    ["Encryption II: Vigenère Cipher", ["DASHBOARD","LINUX"], "OIFBYZIEX"],
    ["Shortest Path in a Grid", [[0,1,0,0,0],[0,0,0,1,0]], "DRRURRD"],
    ["Proper 2-Coloring of a Graph", [4,[[0,2],[0,3],[1,2],[1,3]]], [0,0,1,1]],
    ["Proper 2-Coloring of a Graph", [3,[[0,1],[1,2],[0,2]]], []],
    ["Compression I: RLE Compression", "aaaaabccc", "5a1b3c"],
    ["Compression II: LZ Decompression", "5aaabb450723abb", "aaabbaaababababaabb"],
    ["HammingCodes: Integer to Encoded Binary", 5, "0101101"],
    ["Square Root", "109882259804267570667338854624", "331484931489001"],
];
for (const [type, input, expected] of solverCases) {
    const solver = solvers[type];
    assert.ok(solver, `no solver registered for ${type}`);
    assert.deepEqual(solver(input), expected, `${type} produced the wrong answer`);
}
assert.deepEqual(solvers["Sanitize Parentheses in Expression"]("()())()"), ["(())()", "()()()"]);
const mathAnswers = solvers["Find All Valid Math Expressions"](["123", 6]);
assert.ok(mathAnswers.includes("1*2*3") && mathAnswers.includes("1+2+3"));
assert.deepEqual(solvers["Find All Valid Math Expressions"](["105", 5]), ["1*0+5", "10-5"]);
for (const value of [1,5,8,19,1000,123456]) {
    const encoded = solvers["HammingCodes: Integer to Encoded Binary"](value);
    assert.equal(solvers["HammingCodes: Encoded Binary to Integer"](encoded), value);
    const corrupted = encoded.split("");
    corrupted[3] = corrupted[3] === "1" ? "0" : "1";
    assert.equal(solvers["HammingCodes: Encoded Binary to Integer"](corrupted.join("")), value);
}
for (const plain of ["aaaaabbbbbbbbbbbbbbbbbbbbbbccccc", "abcabcabcabcabc", "x", "mississippi"]) {
    const compressed = solvers["Compression III: LZ Compression"](plain);
    assert.equal(solvers["Compression II: LZ Decompression"](compressed), plain);
}

const contractWorker = read("matrix/workers/contract.js");
assert.match(contractWorker, /if \(!solver\) return;/);
assert.match(contractWorker, /catch \{ return; \}/);
assert.ok(contractWorker.indexOf("if (!solver) return;") < contractWorker.indexOf("codingcontract.attempt"));
const solverRam = scriptRam(contractWorker, { root }).ram;
const finderRam = scriptRam(read("matrix/services/contracts.js"), { root }).ram;
assert.ok(solverRam > 20, `the solver carries the contract API (${solverRam} GB)`);
assert.ok(finderRam < 6, `the finder must stay cheap enough to run early (${finderRam} GB)`);
assert.match(read("matrix/early.js"), /dispatchContracts/, "the 16-63 GB early stage must dispatch contracts too");

// Common constant import guard.
{
    const constants = [...new Set([...read("matrix/lib/common.js")
        .matchAll(/export\s+const\s+([A-Z][A-Z0-9_]+)\s*=/g)].map(m => m[1]))];
    assert.ok(constants.length >= 4);
    const codeOnly = source => stripComments(source)
        .replace(/^\s*import[^;]*;/gm, "")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/`(?:[^`\\]|\\.)*`/g, match => [...match.matchAll(/\$\{([^{}]*)\}/g)].map(m => m[1]).join(";"));
    for (const absolute of runtimeFiles) {
        const source = fs.readFileSync(absolute, "utf8");
        if (!source.includes('from "/matrix/lib/common.js"')) continue;
        const imported = new Set();
        for (const match of source.matchAll(/import\s*\{([^}]*)\}/g)) {
            for (const name of match[1].split(",")) imported.add(name.trim().split(/\s+as\s+/).pop());
        }
        const stripped = codeOnly(source);
        for (const name of constants) {
            const used = new RegExp(String.raw`(^|[^\w$.])` + name + String.raw`\b`).test(stripped);
            const declared = new RegExp(String.raw`(?:const|let|var)\s+` + name + String.raw`\b`).test(stripped);
            if (used && !declared) assert.ok(imported.has(name), `${absolute} uses ${name} without importing it`);
        }
    }
}

console.log(`MATRIX-OS validation passed: ${runtimeFiles.length} scripts, ${manifest.files.length} manifest files.`);
console.log(`  worm RAM: seed ${wormRam.seed} GB, spread ${wormRam.spread} GB, drone ${wormRam.drone} GB.`);
console.log(`  bootstrap.js: ${bootstrapRam.ram} GB of the 8 GB fresh-save home.`);
console.log(`  64 GB selected full tier: ${Math.round(total64 * 100) / 100} GB incl. updater reserve.`);
console.log(`  ${Object.keys(solvers).length} coding-contract solvers, all known-answer tested.`);
