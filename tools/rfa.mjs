/**
 * Bitburner Remote File API client.
 *
 * The game's Options > Remote API connects OUT to a WebSocket server, so this
 * is the server and Bitburner is the client. Once connected it speaks JSON-RPC
 * 2.0 and exposes the game's own file system - and, more valuably,
 * `calculateRam`, which is the game's real RAM calculator.
 *
 * That last one matters more than the convenience. Every RAM claim in this
 * project has carried the caveat "verified against the analyser, not against a
 * live game". `npm run rfa -- ram` removes it: it asks Bitburner what each
 * script costs and diffs that against tests/ram-budget.mjs. If the two disagree,
 * one of them is wrong and the stage budgets are built on sand.
 *
 * Zero dependencies on purpose - this repo has one devDependency and a tool for
 * deploying it should not add another. The WebSocket bits below are the minimum
 * that speaks the protocol correctly: the SHA-1 handshake, client-masked frames,
 * and the extended payload lengths that file contents immediately require.
 *
 * Usage:
 *   node tools/rfa.mjs deploy     push every manifest file to home
 *   node tools/rfa.mjs ram        compare the game's RAM costs to the analyser
 *   node tools/rfa.mjs state      dump /matrix/state from the running game
 *   node tools/rfa.mjs pull FILE  print one file from home
 *
 * Then in game: Options > Remote API > Connect.
 */
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.RFA_PORT ?? 12525);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");

import { handshake, encode, createDecoder } from "./websocket.mjs";

// --- the RPC layer -----------------------------------------------------------

function connect() {
    return new Promise((resolve, reject) => {
        const pending = new Map();
        let id = 0;
        const server = net.createServer(socket => {
            socket.once("data", first => {
                const text = first.toString("utf8");
                if (!/upgrade:\s*websocket/i.test(text) || !handshake(socket, text)) {
                    socket.destroy();
                    return;
                }
                socket.on("data", createDecoder((message, event) => {
                    if (event === "close") return;
                    let parsed;
                    try { parsed = JSON.parse(message); } catch { return; }
                    const waiter = pending.get(parsed.id);
                    if (!waiter) return;
                    pending.delete(parsed.id);
                    if (parsed.error) waiter.reject(new Error(String(parsed.error)));
                    else waiter.resolve(parsed.result);
                }));
                socket.on("error", () => {});
                resolve({
                    call(method, params = {}) {
                        return new Promise((ok, fail) => {
                            const messageId = ++id;
                            pending.set(messageId, { resolve: ok, reject: fail });
                            socket.write(encode(JSON.stringify({ jsonrpc: "2.0", id: messageId, method, params })));
                            setTimeout(() => {
                                if (pending.delete(messageId)) fail(new Error(`${method} timed out`));
                            }, 30_000);
                        });
                    },
                    close() { try { socket.end(); } catch {} server.close(); },
                });
            });
        });
        server.on("error", reject);
        server.listen(PORT, "127.0.0.1", () => {
            console.log(`RFA server listening on 127.0.0.1:${PORT}`);
            console.log("In Bitburner: Options > Remote API > Connect\n");
        });
    });
}

// --- commands ----------------------------------------------------------------

function manifestFiles() {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
    return manifest.files.map(entry => entry.path);
}

async function deploy(rfa) {
    let pushed = 0, failed = 0;
    for (const relative of manifestFiles()) {
        const absolute = path.join(root, relative);
        if (!fs.existsSync(absolute)) { console.log(`  missing locally: ${relative}`); failed++; continue; }
        // config.json is protected: pushing it would overwrite the player's settings.
        if (relative.endsWith("matrix/config.json")) { console.log(`  skipped (protected): ${relative}`); continue; }
        try {
            await rfa.call("pushFile", {
                filename: "/" + relative.replace(/^matrix\//, "matrix/"),
                content: fs.readFileSync(absolute, "utf8"),
                server: "home",
            });
            pushed++;
        } catch (error) { console.log(`  FAILED ${relative}: ${error.message}`); failed++; }
    }
    console.log(`\npushed ${pushed} file(s), ${failed} failure(s)`);
}

async function compareRam(rfa) {
    const { scriptRam } = await import(pathToFileURL(path.join(root, "tests/ram-budget.mjs")).href);
    const rows = [];
    for (const relative of manifestFiles()) {
        if (!/[.](js|jsx)$/.test(relative)) continue;
        const absolute = path.join(root, relative);
        if (!fs.existsSync(absolute)) continue;
        const filename = "/" + relative;
        let game = null;
        try { game = Number(await rfa.call("calculateRam", { filename, server: "home" })); }
        catch (error) { rows.push({ file: relative, game: null, ours: null, note: error.message }); continue; }
        const ours = scriptRam(fs.readFileSync(absolute, "utf8"), { root }).ram;
        rows.push({ file: relative, game, ours, delta: Math.round((game - ours) * 100) / 100 });
    }
    const bad = rows.filter(r => r.delta !== undefined && Math.abs(r.delta) > 0.01);
    console.log(`checked ${rows.length} script(s) against the game's own calculator\n`);
    for (const row of rows) {
        if (row.game === null) { console.log(`  ?  ${row.file.padEnd(38)} ${row.note}`); continue; }
        const flag = Math.abs(row.delta) > 0.01 ? "MISMATCH" : "ok";
        console.log(`  ${flag === "ok" ? " " : "!"}  ${row.file.padEnd(38)} game ${String(row.game).padStart(8)}   ours ${String(row.ours).padStart(8)}   ${flag}`);
    }
    console.log(bad.length
        ? `\n${bad.length} MISMATCH(es) - the analyser and the game disagree, and every stage budget rests on the analyser.`
        : `\nevery script matches the game's own RAM calculation.`);
}

async function dumpState(rfa) {
    const names = await rfa.call("getFileNames", { server: "home" });
    const state = names.filter(n => n.startsWith("/matrix/state/") || n.startsWith("matrix/state/"));
    for (const name of state) {
        const content = await rfa.call("getFile", { filename: name, server: "home" });
        console.log(`\n=== ${name} ===`);
        try { console.log(JSON.stringify(JSON.parse(content), null, 1).slice(0, 2000)); }
        catch { console.log(String(content).slice(0, 2000)); }
    }
    if (!state.length) console.log("no /matrix/state files found on home");
}

const [command, argument] = process.argv.slice(2);
const rfa = await connect();
try {
    if (command === "deploy") await deploy(rfa);
    else if (command === "ram") await compareRam(rfa);
    else if (command === "state") await dumpState(rfa);
    else if (command === "pull" && argument) console.log(await rfa.call("getFile", { filename: argument, server: "home" }));
    else console.log("commands: deploy | ram | state | pull <file>");
} catch (error) {
    console.error("RFA error:", error.message);
} finally {
    rfa.close();
}
