import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";

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

const coordSource = fs.readFileSync(path.join(root, "matrix/services/coordinator.js"), "utf8")
    .replace(/from\s+["']\/matrix\/lib\/common\.js["']/g, `from "${pathToFileURL(path.join(root, "matrix/lib/common.js")).href}"`);
const { evaluateObjective } = await import(`data:text/javascript;base64,${Buffer.from(coordSource).toString("base64")}`);

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

console.log(`MATRIX-OS validation passed: ${runtimeFiles.length} scripts, ${manifest.files.length} manifest files.`);
