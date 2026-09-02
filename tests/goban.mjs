/**
 * IPvGO engine, checked against hand-built positions.
 *
 * MATRIX computes chains, liberties and move legality itself rather than paying
 * 16 + 16 + 8 GB for the API versions, so those computations have to be right on
 * their own. Every board below is written out so the expected answer is visible.
 *
 * Boards are [x][y] with [0][0] bottom-left, exactly as ns.go.getBoardState()
 * returns them - each string is a COLUMN, not a row.
 */
import assert from "node:assert/strict";
import {
    toGrid, group, play, isLegal, isOwnEye, bestMove, tally, serialise,
    chooseOpponent, OPPONENTS, US, THEM,
} from "../matrix/lib/goban.js";

// --- liberties ---------------------------------------------------------------
// A lone router in the middle of an empty 5x5 has four liberties.
const empty5 = ["....." , ".....", ".....", ".....", "....."];
{
    const grid = toGrid(empty5);
    grid[2][2] = US;
    assert.equal(group(grid, 2, 2).liberties, 4, "a centre router breathes four ways");
    assert.equal(group(grid, 2, 2).stones.length, 1);
}
// A corner router has two.
{
    const grid = toGrid(empty5);
    grid[0][0] = US;
    assert.equal(group(grid, 0, 0).liberties, 2, "a corner router breathes twice");
}
// Connected routers share liberties as one chain.
{
    const grid = toGrid(empty5);
    grid[2][2] = US; grid[2][3] = US;
    const chain = group(grid, 2, 2);
    assert.equal(chain.stones.length, 2, "adjacent routers form one chain");
    assert.equal(chain.liberties, 6, "a two-router chain in open space has six liberties");
}
// A dead node is a wall: neither a stone nor a liberty.
{
    const grid = toGrid(["#....", ".....", ".....", ".....", "....."]);
    grid[0][1] = US;
    assert.equal(group(grid, 0, 1).liberties, 2, "the dead node above does not count as a liberty");
}

// --- capture -----------------------------------------------------------------
// An enemy router at (0,1) whose liberties are (0,0), (0,2) and (1,1). With two
// of them already ours, playing (0,0) fills the last one.
//   column 0 = ".OX..", column 1 = ".X..."
const ATARI = [".OX..", ".X...", ".....", ".....", "....."];
{
    const result = play(toGrid(ATARI), 0, 0, US);
    assert.equal(result.captured, 1, "filling the last liberty must capture");
    assert.equal(result.grid[0][1], ".", "the captured router is removed");
}
// That same move is legal even though the placed router has no liberty of its
// own until the capture resolves.
{
    assert.equal(isLegal(toGrid(ATARI), 0, 0, US), true,
        "a capturing move is legal even without liberties of its own");
}
// True suicide is rejected: (0,0) is enclosed by enemies and captures nothing,
// because both enemy routers keep liberties elsewhere.
//   column 0 = ".O...", column 1 = "O...."
{
    const grid = toGrid([".O...", "O....", ".....", ".....", "....."]);
    assert.equal(isLegal(grid, 0, 0, US), false, "filling our own last liberty is suicide");
}
// An occupied point is never legal.
{
    const grid = toGrid([".....", ".....", ".....", ".....", "....."]);
    grid[2][2] = THEM;
    assert.equal(isLegal(grid, 2, 2, US), false);
}

// --- ko ----------------------------------------------------------------------
// Repeating the previous position is forbidden.
// Reuses the capture above: legal on its own, illegal once that exact position
// has already been seen. That is the rule the free move history lets us enforce
// without buying the validity API.
{
    const grid = toGrid(ATARI);
    const after = play(grid, 0, 0, US);
    assert.equal(after.captured, 1, "the setup really does capture");
    assert.equal(isLegal(grid, 0, 0, US, []), true, "legal with no history");
    assert.equal(isLegal(grid, 0, 0, US, [serialise(after.grid)]), false,
        "the same position may not be repeated");
}

// --- eyes --------------------------------------------------------------------
{
    const grid = toGrid([".....", ".....", ".....", ".....", "....."]);
    grid[1][2] = US; grid[3][2] = US; grid[2][1] = US; grid[2][3] = US;
    assert.equal(isOwnEye(grid, 2, 2, US), true, "a point enclosed by our routers is an eye");
    grid[1][2] = THEM;
    assert.equal(isOwnEye(grid, 2, 2, US), false, "an enemy neighbour means it is not our eye");
}

// --- move choice -------------------------------------------------------------
// Given a free capture, take it.
{
    const move = bestMove(ATARI, { colour: US });
    assert.deepEqual([move.x, move.y], [0, 0], "the capture at (0,0) must be chosen");
}
// Never fill our own eye when other moves exist.
{
    const grid = toGrid([".....", ".....", ".....", ".....", "....."]);
    grid[1][2] = US; grid[3][2] = US; grid[2][1] = US; grid[2][3] = US;
    const move = bestMove(grid.map(c => c.join("")), { colour: US });
    assert.ok(move, "there are still moves to play");
    assert.ok(!(move.x === 2 && move.y === 2), "the eye at (2,2) must not be filled");
}
// A full board has no move: pass.
{
    const full = ["XXXXX", "XXXXX", "XXXXX", "XXXXX", "XXXXX"];
    assert.equal(bestMove(full, { colour: US }), null, "a full board must pass");
}
// Junk input must not throw - the deck and the service both call this blind.
for (const junk of [null, undefined, [], ["", ""], "nonsense", [null, undefined]]) {
    assert.doesNotThrow(() => bestMove(junk, { colour: US }), `bestMove threw on ${JSON.stringify(junk)}`);
    assert.doesNotThrow(() => tally(junk));
}

// --- scoring the position ----------------------------------------------------
{
    // The example board from the ns.go.getBoardState() docs. Counted by column:
    // XX.O. / X..OO / .XO.. / XXO.# / .XO.#  ->  7 ours, 6 theirs, 10 empty, 2 dead.
    const t = tally(["XX.O.", "X..OO", ".XO..", "XXO.#", ".XO.#"]);
    assert.equal(t.us, 7);
    assert.equal(t.them, 6);
    assert.equal(t.empty, 10, "dead nodes are not empty points");
    assert.equal(t.us + t.them + t.empty, 23, "the two dead nodes are excluded entirely");
}

// --- the difficulty ladder ---------------------------------------------------
// A lost game is worth no node power, so a hard opponent we lose to is strictly
// worse than an easy one we beat. The ladder must therefore actually retreat.
assert.equal(chooseOpponent({ index: 0, wins: 0, losses: 0 }).name, "Netburners",
    "start on the easiest opponent");
assert.equal(chooseOpponent({ index: 0, wins: 3 }).name, "Slum Snakes", "climb after three wins");
assert.equal(chooseOpponent({ index: 2, losses: 2 }).name, "Slum Snakes", "retreat after two losses");
assert.equal(chooseOpponent({ index: 0, losses: 5 }).name, "Netburners", "never fall off the bottom");
assert.equal(chooseOpponent({ index: 5, wins: 9 }).name, "Illuminati", "never climb past the top");
const pinned = chooseOpponent({ index: 0, wins: 9, preferred: "The Black Hand" });
assert.equal(pinned.name, "The Black Hand", "an explicit preference wins");
assert.equal(pinned.pinned, true);
assert.equal(chooseOpponent({ index: 1, preferred: "not-a-faction" }).name, "Slum Snakes",
    "an unknown preference falls back to the ladder");
// Every opponent must declare what it grants, or the deck cannot explain itself.
for (const opponent of OPPONENTS) {
    assert.ok(opponent.bonus && opponent.komi > 0, `${opponent.name} is missing its bonus or komi`);
}

console.log(`MATRIX-OS goban passed: ${OPPONENTS.length} opponents, chains/liberties/ko computed without the 40 GB of API calls.`);
