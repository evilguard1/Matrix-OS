/**
 * IPvGO - permanent multipliers for territory nobody else is contesting.
 *
 * Every other bonus MATRIX chases is gated behind a Source-File. This one is
 * not: ns.go needs nothing, and each opponent grants a permanent buff. For a
 * hacking autopilot The Black Hand (hacking money) and Illuminati (faster hack,
 * grow and weaken) are direct income multipliers.
 *
 * Node power scales with opponent difficulty AND win streak, so the policy is a
 * ladder: climb while winning, retreat after losses. A hard opponent we lose to
 * is worth nothing at all, which makes an easy opponent we beat strictly better.
 *
 * Chains, liberties and legality are computed in /matrix/lib/goban.js rather
 * than bought from the analysis API, which would cost 40 GB.
 */
import { config, writeState, event, readJson, STATE_DIR } from "/matrix/lib/common.js";
import { bestMove, tally, chooseOpponent, serialise, toGrid, OPPONENTS } from "/matrix/lib/goban.js";

const RECORD = `${STATE_DIR}/go-record.txt`;

// The opponent moves on its own clock; polling faster just burns cycles.
const TURN_DELAY = 220;
const IDLE_DELAY = 4000;

function record(ns) {
    const saved = readJson(ns, RECORD, {});
    return {
        index: Number(saved.index ?? 0) || 0,
        wins: Number(saved.wins ?? 0) || 0,
        losses: Number(saved.losses ?? 0) || 0,
        games: Number(saved.games ?? 0) || 0,
        totalWins: Number(saved.totalWins ?? 0) || 0,
    };
}

// The last few positions, so the engine can refuse to repeat one. getMoveHistory
// is free; the validity API that would tell us the same thing costs 8 GB.
function history(ns) {
    try {
        return ns.go.getMoveHistory().slice(-8).map(board => serialise(toGrid(board)));
    } catch { return []; }
}

async function startGame(ns, opponent, boardSize) {
    try {
        ns.go.resetBoardState(opponent.name, boardSize);
        await event(ns, "go", `Subnet engagement opened against ${opponent.name} (${opponent.bonus})`, "info");
        return true;
    } catch { return false; }
}

export async function main(ns) {
    ns.disableLog("ALL");

    // IPvGO is absent from some BitNodes. Say so once and idle rather than
    // throwing on every cycle.
    try { ns.go.getGameState(); }
    catch (error) {
        await writeState(ns, "go", { status: "unavailable", error: String(error) });
        return;
    }

    let state = record(ns);
    let pending = null;

    while (true) {
        try {
            const cfg = config(ns);
            if (cfg.automation?.go === false) {
                await writeState(ns, "go", { status: "paused" });
                await ns.sleep(IDLE_DELAY);
                continue;
            }

            const boardSize = Number(cfg.go?.boardSize) || 5;
            const opponent = chooseOpponent({ ...state, preferred: cfg.go?.opponent ?? null });
            state.index = opponent.index;

            const game = ns.go.getGameState();
            const board = ns.go.getBoardState();
            const score = tally(board);

            // currentPlayer is "None" once the game is decided.
            if (game.currentPlayer === "None") {
                const won = Number(game.blackScore ?? 0) > Number(game.whiteScore ?? 0);
                if (pending !== null) {
                    state.games++;
                    if (won) { state.wins++; state.losses = 0; state.totalWins++; }
                    else { state.losses++; state.wins = 0; }
                    await event(ns, "go",
                        `Subnet ${won ? "captured" : "lost"} vs ${pending} - ${game.blackScore} to ${game.whiteScore}`,
                        won ? "success" : "warn");
                    await ns.write(RECORD, JSON.stringify(state), "w");
                    pending = null;
                }
                const next = chooseOpponent({ ...state, preferred: cfg.go?.opponent ?? null });
                state.index = next.index;
                if (await startGame(ns, next, boardSize)) pending = next.name;
                await writeState(ns, "go", {
                    status: "online", phase: "resetting", opponent: next.name, bonus: next.bonus,
                    boardSize, ...state,
                });
                await ns.sleep(TURN_DELAY);
                continue;
            }

            if (pending === null) pending = ns.go.getOpponent?.() ?? opponent.name;

            // Not our turn: the opponent is still resolving its move.
            if (game.currentPlayer !== "Black") {
                await ns.sleep(TURN_DELAY);
                continue;
            }

            const move = bestMove(board, { history: history(ns) });
            let response = null;
            if (move) {
                try { response = await ns.go.makeMove(move.x, move.y); } catch { response = null; }
            }
            // No move worth playing, or the game rejected ours: pass rather than
            // fill our own territory. Two passes end the game and bank the score.
            if (!move || !response || response.type === "invalid") {
                try { await ns.go.passTurn(); } catch {}
            }

            await writeState(ns, "go", {
                status: "online", phase: "playing",
                opponent: pending, bonus: opponent.bonus, boardSize,
                routers: score.us, enemyRouters: score.them, open: score.empty,
                blackScore: game.blackScore, whiteScore: game.whiteScore,
                lastMove: move ? `${move.x},${move.y}` : "pass",
                ...state,
            });
            await ns.sleep(TURN_DELAY);
        } catch (error) {
            await writeState(ns, "go", { status: "error", error: String(error), ...state });
            await ns.sleep(IDLE_DELAY);
        }
    }
}
