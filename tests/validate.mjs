import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";
import { scriptRam, stripComments, DOM_IDENTIFIERS } from "./ram-budget.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const configFile = JSON.parse(read("matrix/config.json"));

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
const stageIndex = new Map(stages.map((stage, index) => [stage.id, index]));
const fileStage = new Map(manifest.files.map(entry => [entry.path, entry.stage]));

const required = [
    "matrix/bootstrap.js", "matrix/early.js", "matrix/kernel.js", "matrix/start.js",
    "matrix/dashboard.jsx", "matrix/update.js", "matrix/config.json",
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
    // Touching window or document costs 25 GB (RamCostConstants Dom: 25), charged
    // statically on the identifier whether or not the line ever runs. One
    // window.innerWidth in a decorative canvas made the command deck 26.9 GB and
    // silently unlaunchable at 32 GB. Use a React ref instead.
    assert.deepEqual(
        stripComments(source).match(DOM_IDENTIFIERS) ?? [],
        [],
        `${absolute} touches the DOM, which costs 25 GB`,
    );
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
assert.ok(startSource.indexOf('file: "/matrix/services/hacking.js"') < startSource.indexOf("file: DASHBOARD"), "hacking must launch before the full dashboard");
assert.match(startSource, /getScriptRam\(UPDATE_SCRIPT/, "the full supervisor must reserve RAM for self-update");

const { scanNetwork, tryRoot, chooseTarget, chooseStarterAction } = await import(pathToFileURL(path.join(root, "matrix/bootstrap.js")));
const { stageForRam } = await import(pathToFileURL(path.join(root, "matrix/kernel.js")));
const { config, plannedNextBitNode, reserveMoney } = await import(pathToFileURL(path.join(root, "matrix/lib/common.js")));
const { eligibleFiles } = await import(pathToFileURL(path.join(root, "install.js")));

assert.equal(stageForRam(8), "/matrix/bootstrap.js");
assert.equal(stageForRam(16), "/matrix/early.js");
assert.equal(stageForRam(32), "/matrix/start.js");
assert.deepEqual([...new Set(eligibleFiles(manifest, 8).map(entry => entry.stage))], ["bootstrap"]);
assert.deepEqual([...new Set(eligibleFiles(manifest, 16).map(entry => entry.stage))], ["bootstrap", "early"]);
assert.deepEqual([...new Set(eligibleFiles(manifest, 64).map(entry => entry.stage))], ["bootstrap", "early", "full", "operations"]);
assert.equal(eligibleFiles(manifest, 128).length, manifest.files.length);

const graph = {
    home: ["n00dles", "foodnstuff"],
    n00dles: ["home", "sigma-cosmetics"],
    foodnstuff: ["home"],
    "sigma-cosmetics": ["n00dles"],
};
assert.deepEqual(scanNetwork({ scan: host => graph[host] }), ["home", "n00dles", "foodnstuff", "sigma-cosmetics"]);

const rooted = new Set(["home"]);
let bruteCalls = 0;
const rootMock = {
    hasRootAccess: host => rooted.has(host),
    fileExists: file => file === "BruteSSH.exe",
    getServerNumPortsRequired: () => 1,
    brutessh: () => { bruteCalls++; },
    ftpcrack: () => {}, relaysmtp: () => {}, httpworm: () => {}, sqlinject: () => {},
    nuke: host => rooted.add(host),
};
assert.equal(tryRoot(rootMock, "foodnstuff"), true);
assert.equal(bruteCalls, 1);

const targetMock = {
    getHackingLevel: () => 20,
    hasRootAccess: host => host !== "home",
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
const reserveMock = {
    getServerMoneyAvailable: () => 100_000_000,
    read: file => file.endsWith("spending-reserve.txt") ? JSON.stringify({ amount: 80_000_000, updated: Date.now() }) : "",
};
assert.equal(config(reserveMock).progression.donationFavorThreshold, 150, "new progression defaults must apply to preserved configs");
assert.equal(reserveMoney(reserveMock), 80_000_000, "fresh augmentation reserve must protect progression funds");
reserveMock.read = file => file.endsWith("spending-reserve.txt") ? JSON.stringify({ amount: 80_000_000, updated: 0 }) : "";
assert.equal(reserveMoney(reserveMock), 15_000_000, "stale augmentation reserve must not freeze economy spending");

// Rewrite every in-game /matrix/... import to a real file URL so the module can
// be imported here. Generic on purpose: a service gaining a new lib import must
// not silently break its own tests.
const asFileImports = source => source.replace(
    /from\s+["'](\/matrix\/[^"']+)["']/g,
    (_, spec) => `from "${pathToFileURL(path.join(root, spec.replace(/^\//, ""))).href}"`,
);
const coordSource = asFileImports(fs.readFileSync(path.join(root, "matrix/services/coordinator.js"), "utf8"));
const { evaluateObjective, planDirectives } = await import(`data:text/javascript;base64,${Buffer.from(coordSource).toString("base64")}`);

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
assert.equal(objTor.id, "BUY_PROGRAMS");

// --- planDirectives: the per-manager directive/budget protocol ---------------
// Every branch that a consumer reads has a deterministic scenario here.

const dirBoot = planDirectives({ cash: 5_000, hasTor: false });
assert.equal(dirBoot.phase, "BOOTSTRAP", "low-cash fresh save is the bootstrap phase");
assert.equal(dirBoot.directives.hacking, "xp", "bootstrap rushes hacking XP");
assert.equal(dirBoot.directives.singularity, "programs", "bootstrap without TOR funds port programs first");
assert.equal(dirBoot.directives.gang, "idle", "no gang yet means no gang directive");
assert.equal(dirBoot.budgets.homeRam, 0.5, "bootstrap spends aggressively on Home RAM");

const dirKarma = planDirectives({ karma: -10, resetInfo: { currentNode: 2 } });
assert.equal(dirKarma.phase, "KARMA_GANG");
assert.equal(dirKarma.directives.sleeves, "karma", "karma rush points every sleeve at homicide");
assert.equal(dirKarma.directives.gang, "idle");

const dirReset = planDirectives({ queuedAugs: 12 });
assert.equal(dirReset.phase, "AUG_RESET");
assert.equal(dirReset.directives.stock, "liquidate", "an imminent reset liquidates the portfolio");
assert.equal(dirReset.directives.singularity, "augs", "reset phase stops faction work and buys queued augs");
assert.equal(dirReset.budgets.hacknet, 0, "reset phase starves discretionary spenders");
assert.equal(dirReset.budgets.cloud, 0);
assert.equal(dirReset.budgets.sleeveAugs, 0.001);

const dirMilestone = planDirectives({ cash: 10_000_000_000, stockPortfolioValue: 95_000_000_000, hackingLevel: 2000 });
assert.equal(dirMilestone.phase, "MILESTONE");
assert.equal(dirMilestone.budgets.cloud, 0, "a cash milestone starves infrastructure spend");
assert.equal(dirMilestone.directives.stock, "liquidate");

const dirEndgame = planDirectives({ worldDaemonRooted: true, hackingLevel: 3000, worldDaemonReqLevel: 3000 });
assert.equal(dirEndgame.phase, "ENDGAME");
assert.equal(dirEndgame.budgets.stock, 0);
assert.equal(dirEndgame.directives.stock, "liquidate");

const dirEcon = planDirectives({ cash: 5_000_000, hasTor: true, hackingLevel: 800, homeRam: 64 });
assert.equal(dirEcon.phase, "HACK_ECON", "an established save with RAM headroom is the steady-state phase");
assert.equal(dirEcon.directives.hacking, "money");
assert.equal(dirEcon.directives.stock, "trade");
assert.equal(dirEcon.budgets.hacknet, 0.04);
assert.equal(dirEcon.budgets.homeRam, 0.15);

const dirRepGrind = planDirectives({ targetAugPrice: 5_000_000_000, targetAugName: "X", targetAugFaction: "Daedalus", cash: 1_000_000_000 });
assert.equal(dirRepGrind.phase, "FACTION_REP");
assert.equal(dirRepGrind.directives.sleeves, "rep:Daedalus", "a rep grind assigns sleeves to that faction");

// --- worm RAM budgets ------------------------------------------------------
// Bitburner charges a script for every NS function it mentions, and a script
// that does not fit simply never launches. These budgets are what make the
// self-propagating botnet viable on 4-16 GB servers, so they are asserted
// exactly rather than loosely.

const wormRam = {};
for (const name of ["seed", "spread", "drone"]) {
    const source = read(`matrix/worm/${name}.js`);
    assert.doesNotMatch(source, /^\s*import\s/m, `matrix/worm/${name}.js must not import (import RAM is billed to the caller)`);
    const measured = scriptRam(source);
    assert.deepEqual(measured.unknown, [], `matrix/worm/${name}.js uses NS functions with no known RAM cost: ${measured.unknown.join(", ")}`);
    wormRam[name] = measured.ram;
}

// A 4 GB server (n00dles) must be able to carry one drone.
assert.ok(wormRam.drone <= 4, `drone must fit a 4 GB server, is ${wormRam.drone} GB`);
// An 8 GB server must carry the propagator plus at least one drone.
assert.ok(wormRam.spread + wormRam.drone <= 8, `spread + drone must fit 8 GB, is ${wormRam.spread + wormRam.drone} GB`);
// The one-shot seeder must fit an 8 GB home on its own.
assert.ok(wormRam.seed <= 8, `seed must fit an 8 GB home, is ${wormRam.seed} GB`);

// The bootstrap controller shares the same 8 GB home and now renders worm
// telemetry, so hold it to the hard game limit too.
const bootstrapRam = scriptRam(read("matrix/bootstrap.js"), { root });
assert.deepEqual(bootstrapRam.unknown, [], `bootstrap.js uses NS functions with no known RAM cost: ${bootstrapRam.unknown.join(", ")}`);
assert.ok(bootstrapRam.ram <= 8, `bootstrap.js must fit an 8 GB home, is ${bootstrapRam.ram} GB`);

// The worm hardcodes these costs because ns.getScriptRam() is RAM it cannot
// spare. Drift between the constants and reality would silently over-subscribe
// every server in the botnet, so pin them.
const constantIn = (file, name) => {
    const line = read(file).split("\n").find(entry => entry.trim().startsWith(`const ${name} = `));
    return line ? Number(line.split("=")[1].replace(";", "").trim()) : NaN;
};
assert.equal(constantIn("matrix/worm/spread.js", "SPREAD_RAM"), wormRam.spread, "spread.js SPREAD_RAM constant is stale");
assert.equal(constantIn("matrix/worm/spread.js", "DRONE_RAM"), wormRam.drone, "spread.js DRONE_RAM constant is stale");
assert.equal(constantIn("matrix/worm/seed.js", "SPREAD_RAM"), wormRam.spread, "seed.js SPREAD_RAM constant is stale");

// The kernel must hand off to the seeder, and the installer must NOT sweep the
// worm: a stage transition that killed the botnet would trade continuous income
// for a batcher that idles between waves. spread.js yields RAM to HWGW instead.
assert.match(read("matrix/kernel.js"), /worm\/seed\.js/, "kernel must be able to launch the worm seeder");
const installerSource = read("install.js");
for (const name of ["seed", "spread", "drone"]) {
    assert.ok(
        !installerSource.includes(`"matrix/worm/${name}.js"`),
        `installer must not sweep matrix/worm/${name}.js - the worm has to survive stage transitions`,
    );
}
assert.match(read("matrix/worm/spread.js"), /DRONE_SHARE_WITH_HWGW/, "the worm must yield RAM to the batcher once HWGW runs");

// --- capabilities + hud: what MATRIX cannot automate, and rendering it --------
const cap = await import(pathToFileURL(path.join(root, "matrix/lib/capabilities.js")));
const hud = await import(pathToFileURL(path.join(root, "matrix/lib/hud.js")));

// Bitburner's own formulas. If these drift, every cost MATRIX shows is a lie.
const near = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) / expected < 1e-6, `${label}: got ${actual}, expected ~${expected}`);
near(cap.homeRamUpgradeCost(8), 1_009_743.872, "8->16GB Home RAM price");
near(cap.homeRamUpgradeCost(16), 3_190_790.63552, "16->32GB Home RAM price");
near(cap.homeRamUpgradeCost(64), 31_861_958.97, "64->128GB Home RAM price");
assert.equal(cap.serverCost(8), 440_000, "purchased servers are $55k/GB");

// A server too small to host a worker is money set on fire.
assert.equal(cap.bestServerBuy(100_000), 0, "cannot afford the smallest useful server");
assert.equal(cap.bestServerBuy(439_999), 0, "8GB is the floor, never buy 2GB or 4GB");
assert.equal(cap.bestServerBuy(440_000), 8);
assert.equal(cap.bestServerBuy(1_000_000), 16);
assert.ok(cap.bestServerBuy(1e12, 2.4) * 1 >= 8, "floor holds at any budget");

// Singularity detection must be free (getResetInfo is 0 GB) and correct.
assert.equal(cap.singularityReady({ currentNode: 1, ownedSF: new Map() }), false);
assert.equal(cap.singularityReady({ currentNode: 4, ownedSF: new Map() }), true, "inside BN4");
assert.equal(cap.singularityReady({ currentNode: 1, ownedSF: new Map([[4, 1]]) }), true, "owns SF4");

const nextProgram = cap.nextPortProgram(["BruteSSH.exe"], 92);
assert.equal(nextProgram.file, "FTPCrack.exe");
assert.equal(nextProgram.canCreate, false);
assert.equal(nextProgram.levelsToGo, 8);
assert.equal(cap.nextPortProgram(["BruteSSH.exe"], 100).canCreate, true, "free to create at the level gate");
assert.equal(cap.nextPortProgram(cap.PORT_PROGRAMS.map(p => p.file), 999), null, "nothing left to get");

// With Singularity there is nothing left for the player to do by hand.
assert.deepEqual(cap.manualActions({ singularity: true }), []);

// Every manual action must render inside the tail without clipping. This is the
// regression guard for the HUD: a long label used to punch through the border.
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

// Every box line is exactly the same rendered width, whatever is thrown at it.
const boxLines = [
    hud.top(), hud.bottom(), hud.rule(), hud.rule("B O T N E T"),
    hud.center("M A T R I X"), hud.row("🎯", "TARGET", "n00dles"),
    hud.row("🕸️", "SWARM TGT", "x".repeat(400)),
    hud.row("⏳", "EST. TIME", ""),
];
for (const line of boxLines) {
    assert.equal(hud.cols(line), hud.WIDTH + 2, `box line drifted: ${JSON.stringify(line)}`);
}
assert.equal(hud.cols("🎯"), 2, "emoji are two columns wide in the tail font");
assert.equal(hud.cols("⠹"), 1, "braille spinner is one column");
assert.equal(hud.bar(0.5, 16), "████████░░░░░░░░");

// --- the stage model must match measured RAM ---------------------------------
// The service table in start.js declares how much Home RAM each manager needs.
// Assert those numbers still cover the script's real static cost plus the update
// reserve, so the stage model can never drift back into fiction. Costs are
// verified against bitburner-src RamCostGenerator.ts.

const { SERVICES } = await import(
    `data:text/javascript;base64,${Buffer.from(asFileImports(read("matrix/start.js"))).toString("base64")}`
);
const UPDATE_RESERVE = scriptRam(read("matrix/update.js"), { root }).ram;

for (const service of SERVICES) {
    const relative = service.file.replace(/^\//, "");
    // Singularity services are only reachable at SF4 level 3; price them there.
    const measured = scriptRam(read(relative), { sf4: service.sf4Level3 ? 3 : 0, root });
    assert.deepEqual(measured.unknown, [], `${relative} uses NS functions with no known RAM cost: ${measured.unknown.join(", ")}`);
    assert.ok(
        service.minRam >= measured.ram + UPDATE_RESERVE,
        `${relative} declares minRam ${service.minRam} but needs ${measured.ram} + ${UPDATE_RESERVE} reserve`,
    );
}

// The 32 GB set must actually co-exist in 32 GB, which is the promise the README
// makes and the one that was previously false.
const at32 = SERVICES.filter(s => s.minRam <= 32);
const total32 = at32.reduce((sum, s) => sum + scriptRam(read(s.file.replace(/^\//, "")), { root }).ram, 0)
    + scriptRam(read("matrix/start.js"), { root }).ram + UPDATE_RESERVE;
assert.ok(total32 <= 32, `the 32 GB stage needs ${Math.round(total32 * 100) / 100} GB and does not fit`);
assert.ok(at32.some(s => s.file.includes("hacking.js")), "hacking must be in the 32 GB set");
assert.ok(at32.some(s => s.file.includes("coordinator.js")), "the coordinator must be in the 32 GB set");

// Singularity is 1242 GB below SF4 level 3 - it must be flagged, or the
// supervisor will retry it forever on a save that can never run it.
const sing = SERVICES.find(s => s.file.includes("singularity.js"));
assert.ok(sing.sf4Level3, "singularity.js must be marked as requiring SF4 level 3");
assert.ok(scriptRam(read("matrix/services/singularity.js"), { root }).ram > 1000, "singularity without SF4 is over 1 TB");
assert.ok(scriptRam(read("matrix/services/singularity.js"), { sf4: 3, root }).ram < 100, "singularity at SF4 L3 is under 100 GB");

// --- coding-contract solvers -------------------------------------------------
// A contract has limited attempts, so a wrong solver costs a real reward. Every
// solver has at least one known-answer case here.
const { solvers } = await import(pathToFileURL(path.join(root, "matrix/lib/solvers.js")));

const solverCases = [
    ["Find Largest Prime Factor", 13195, 29],
    ["Find Largest Prime Factor", 48, 3],
    ["Subarray with Maximum Sum", [-2, 1, -3, 4, -1, 2, 1, -5, 4], 6],
    ["Total Ways to Sum", 5, 6],
    ["Total Ways to Sum II", [10, [1, 2, 5]], 10],
    ["Spiralize Matrix", [[1, 2, 3], [4, 5, 6], [7, 8, 9]], [1, 2, 3, 6, 9, 8, 7, 4, 5]],
    ["Array Jumping Game", [2, 3, 1, 1, 4], 1],
    ["Array Jumping Game II", [2, 3, 1, 1, 4], 2],
    ["Merge Overlapping Intervals", [[1, 3], [2, 6], [8, 10]], [[1, 6], [8, 10]]],
    ["Algorithmic Stock Trader I", [7, 1, 5, 3, 6, 4], 5],
    ["Algorithmic Stock Trader II", [7, 1, 5, 3, 6, 4], 7],
    ["Algorithmic Stock Trader III", [3, 3, 5, 0, 0, 3, 1, 4], 6],
    ["Algorithmic Stock Trader IV", [2, [3, 2, 6, 5, 0, 3]], 7],
    ["Minimum Path Sum in a Triangle", [[2], [3, 4], [6, 5, 7], [4, 1, 8, 3]], 11],
    ["Unique Paths in a Grid I", [3, 7], 28],
    ["Unique Paths in a Grid II", [[0, 0, 0], [0, 1, 0], [0, 0, 0]], 2],
    ["Encryption I: Caesar Cipher", ["MEDIUM", 1], "LDCHTL"],
    ["Encryption II: Vigenère Cipher", ["DASHBOARD", "LINUX"], "OIFBYZIEX"],
    // previously unsolved types
    ["Shortest Path in a Grid", [[0, 1, 0, 0, 0], [0, 0, 0, 1, 0]], "DRRURRD"],
    ["Proper 2-Coloring of a Graph", [4, [[0, 2], [0, 3], [1, 2], [1, 3]]], [0, 0, 1, 1]],
    ["Proper 2-Coloring of a Graph", [3, [[0, 1], [1, 2], [0, 2]]], []],
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

// Sanitize returns a sorted set of maximal-length valid strings.
assert.deepEqual(solvers["Sanitize Parentheses in Expression"]("()())()"), ["(())()", "()()()"]);
// Math expressions must respect operator precedence and reject leading zeros.
const mathAnswers = solvers["Find All Valid Math Expressions"](["123", 6]);
assert.ok(mathAnswers.includes("1*2*3") && mathAnswers.includes("1+2+3"), "must find both routes to 6");
assert.deepEqual(solvers["Find All Valid Math Expressions"](["105", 5]), ["1*0+5", "10-5"], "no leading-zero operands");

// Hamming and LZ must round-trip, including single-bit error correction.
for (const value of [1, 5, 8, 19, 1000, 123456]) {
    const encoded = solvers["HammingCodes: Integer to Encoded Binary"](value);
    assert.equal(solvers["HammingCodes: Encoded Binary to Integer"](encoded), value, `hamming round-trip for ${value}`);
    const corrupted = encoded.split("");
    corrupted[3] = corrupted[3] === "1" ? "0" : "1";
    assert.equal(solvers["HammingCodes: Encoded Binary to Integer"](corrupted.join("")), value,
        `hamming must correct a single flipped bit for ${value}`);
}
for (const plain of ["aaaaabbbbbbbbbbbbbbbbbbbbbbccccc", "abcabcabcabcabc", "x", "mississippi"]) {
    const compressed = solvers["Compression III: LZ Compression"](plain);
    assert.equal(solvers["Compression II: LZ Decompression"](compressed), plain, `LZ round-trip for ${plain}`);
}

// The solver must never consume one of a contract's limited attempts on a type
// it does not know, or on a solver that threw.
const contractWorker = read("matrix/workers/contract.js");
assert.match(contractWorker, /if \(!solver\) return;/, "an unknown contract type must be skipped, never guessed at");
assert.match(contractWorker, /catch \{ return; \}/, "a throwing solver must not attempt the contract");
assert.ok(
    contractWorker.indexOf("if (!solver) return;") < contractWorker.indexOf("codingcontract.attempt"),
    "the unknown-type guard must come before the attempt",
);
// The expensive half must stay off home: 20 of its 21.6 GB is contract API.
const solverRam = scriptRam(contractWorker, { root }).ram;
const finderRam = scriptRam(read("matrix/services/contracts.js"), { root }).ram;
assert.ok(solverRam > 20, `the solver carries the contract API (${solverRam} GB)`);
assert.ok(finderRam < 6, `the finder must stay cheap enough to run early (${finderRam} GB)`);
assert.match(read("matrix/early.js"), /dispatchContracts/, "the 16 GB stage must dispatch contracts too");


// --- imports that actually exist ---------------------------------------------
// esbuild parses each script but cannot see that a name is never bound. Adding
// `${STATE_DIR}/faction-rep.txt` to a service that never imported STATE_DIR
// parses perfectly and throws the moment the line runs - in game, unattended.
//
// Scoped to the UPPER_CASE constants. The function exports (config, event,
// readJson) are routinely shadowed by locals and destructuring - the deck's
// `const { data, config } = useStore()` is legitimate - and telling those apart
// from a genuine miss needs real scope analysis. The constants are never
// shadowed here, and they are the class that bites: a bare CONSTANT inside a
// template literal reads as valid code right up until it runs.
{
    const constants = [...new Set([...read("matrix/lib/common.js")
        .matchAll(/export\s+const\s+([A-Z][A-Z0-9_]+)\s*=/g)].map(m => m[1]))];
    assert.ok(constants.length >= 4, "expected common.js to export UPPER_CASE constants");

    // Quoted strings are not code. Template literals are BOTH: the literal text
    // is not code but every ${...} inside it is, and that is exactly where a
    // missing constant hides - so keep the interpolations and drop the prose.
    const codeOnly = source => stripComments(source)
        .replace(/^\s*import[^;]*;/gm, "")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/`(?:[^`\\]|\\.)*`/g, match =>
            [...match.matchAll(/\$\{([^{}]*)\}/g)].map(m => m[1]).join(";"));

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
            if (used && !declared) {
                assert.ok(imported.has(name),
                    `${absolute} uses ${name} from common.js without importing it - parses fine, throws at runtime`);
            }
        }
    }
}

console.log(`MATRIX-OS validation passed: ${runtimeFiles.length} scripts, ${manifest.files.length} manifest files.`);
console.log(`  worm RAM: seed ${wormRam.seed} GB (one-shot on home), spread ${wormRam.spread} GB, drone ${wormRam.drone} GB.`);
console.log(`  bootstrap.js: ${bootstrapRam.ram} GB of the 8 GB fresh-save home.`);
console.log(`  ${Object.keys(solvers).length} coding-contract solvers, all known-answer tested.`);
