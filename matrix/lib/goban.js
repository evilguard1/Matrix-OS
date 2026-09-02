/**
 * IPvGO engine - pure board logic, no ns.
 *
 * The game exposes chains, liberties and valid moves as API calls, but they
 * cost 16, 16 and 8 GB. All three are derivable from the 4 GB board state with
 * a flood fill, so MATRIX buys the board and works the rest out itself. That is
 * the difference between a 9.6 GB module and a 49.6 GB one.
 *
 * Board format, straight from ns.go.getBoardState(): an array of strings, one
 * per COLUMN, indexed [x][y] with [0][0] at the bottom left.
 *   "X" our routers   "O" opponent   "." empty   "#" dead node
 */

export const US = "X";
export const THEM = "O";
export const EMPTY = ".";
export const DEAD = "#";

/** Board strings -> mutable grid[x][y]. */
export function toGrid(board) {
    if (!Array.isArray(board)) return [];
    return board.map(column => String(column ?? "").split(""));
}

export function gridSize(grid) {
    return Array.isArray(grid) ? grid.length : 0;
}

export function neighbours(grid, x, y) {
    const size = gridSize(grid);
    const out = [];
    if (x > 0) out.push([x - 1, y]);
    if (x < size - 1) out.push([x + 1, y]);
    if (y > 0) out.push([x, y - 1]);
    if (y < (grid[x]?.length ?? 0) - 1) out.push([x, y + 1]);
    return out;
}

/**
 * The connected group of like-coloured routers containing (x,y), plus its
 * liberties. A dead node is a wall: it is neither a stone nor a liberty.
 */
export function group(grid, x, y) {
    const colour = grid[x]?.[y];
    if (colour !== US && colour !== THEM) return { colour, stones: [], liberties: 0 };
    const stack = [[x, y]];
    const seen = new Set();
    const stones = [];
    const liberties = new Set();
    while (stack.length) {
        const [cx, cy] = stack.pop();
        const key = `${cx},${cy}`;
        if (seen.has(key)) continue;
        seen.add(key);
        stones.push([cx, cy]);
        for (const [nx, ny] of neighbours(grid, cx, cy)) {
            const value = grid[nx][ny];
            if (value === EMPTY) liberties.add(`${nx},${ny}`);
            else if (value === colour) stack.push([nx, ny]);
        }
    }
    return { colour, stones, liberties: liberties.size };
}

/**
 * Result of playing `colour` at (x,y): the new grid, how many enemy routers it
 * captured, and the liberties of the group we end up with. Captures resolve
 * before self-capture, which is what makes a capturing move legal even when the
 * placed router would otherwise have no liberties.
 */
export function play(grid, x, y, colour = US) {
    const next = grid.map(column => column.slice());
    next[x][y] = colour;
    const enemy = colour === US ? THEM : US;
    let captured = 0;
    for (const [nx, ny] of neighbours(next, x, y)) {
        if (next[nx][ny] !== enemy) continue;
        const chain = group(next, nx, ny);
        if (chain.liberties > 0) continue;
        for (const [sx, sy] of chain.stones) { next[sx][sy] = EMPTY; captured++; }
    }
    const mine = group(next, x, y);
    return { grid: next, captured, liberties: mine.liberties, size: mine.stones.length };
}

export function serialise(grid) {
    return grid.map(column => column.join("")).join("|");
}

/**
 * Legal iff the point is empty and the move is not suicide. Repeating the
 * previous position is also rejected - that is the ko rule, and `history` is
 * free to obtain, unlike the validity API.
 */
export function isLegal(grid, x, y, colour = US, history = []) {
    if (grid[x]?.[y] !== EMPTY) return false;
    const result = play(grid, x, y, colour);
    if (result.captured === 0 && result.liberties === 0) return false;
    return !history.includes(serialise(result.grid));
}

/** A point enclosed entirely by our own routers. Filling it destroys an eye. */
export function isOwnEye(grid, x, y, colour = US) {
    if (grid[x]?.[y] !== EMPTY) return false;
    const around = neighbours(grid, x, y);
    if (!around.length) return false;
    return around.every(([nx, ny]) => grid[nx][ny] === colour || grid[nx][ny] === DEAD);
}

/**
 * Move scoring. Ordered by what actually decides small-board games: take
 * captures, save your own groups, never walk into atari, then prefer moves that
 * breathe, connect and enclose space.
 */
export function scoreMove(grid, x, y, colour = US) {
    const enemy = colour === US ? THEM : US;
    const before = new Map();
    for (const [nx, ny] of neighbours(grid, x, y)) {
        const value = grid[nx][ny];
        if (value !== US && value !== THEM) continue;
        before.set(`${nx},${ny}`, group(grid, nx, ny));
    }

    const result = play(grid, x, y, colour);
    let score = 0;

    // Capturing is worth more than anything else on the board.
    score += result.captured * 40;

    // Rescuing one of our own groups from atari is next.
    for (const [key, chain] of before) {
        if (chain.colour !== colour || chain.liberties !== 1) continue;
        const [cx, cy] = key.split(",").map(Number);
        const after = result.grid[cx]?.[cy] === colour ? group(result.grid, cx, cy) : null;
        if (after && after.liberties > 1) score += 25 + chain.stones.length * 4;
    }

    // Walking into atari for nothing loses the group next turn.
    if (result.captured === 0 && result.liberties === 1) score -= 55;

    // Putting an enemy group in atari threatens it.
    for (const [nx, ny] of neighbours(result.grid, x, y)) {
        if (result.grid[nx][ny] !== enemy) continue;
        const chain = group(result.grid, nx, ny);
        if (chain.liberties === 1) score += 8 + chain.stones.length * 3;
    }

    score += Math.min(result.liberties, 6) * 3;

    let friends = 0, space = 0;
    for (const [nx, ny] of neighbours(grid, x, y)) {
        const value = grid[nx][ny];
        if (value === colour) friends++;
        else if (value === EMPTY) space++;
    }
    // Connected shapes live; isolated routers get surrounded.
    score += friends * 2 + space;

    // Territory comes from the middle; the edge is where groups die.
    const size = gridSize(grid);
    const edge = Math.min(x, y, size - 1 - x, (grid[x]?.length ?? size) - 1 - y);
    if (edge === 0) score -= 4;

    return score;
}

/**
 * The move to play, or null to pass. Passing is correct only when nothing
 * constructive is left: filling our own eyes at the end of a game hands back
 * territory we already control.
 */
export function bestMove(board, { colour = US, history = [], threshold = 0 } = {}) {
    const grid = toGrid(board);
    const size = gridSize(grid);
    let best = null;
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < (grid[x]?.length ?? 0); y++) {
            if (grid[x][y] !== EMPTY) continue;
            if (isOwnEye(grid, x, y, colour)) continue;
            if (!isLegal(grid, x, y, colour, history)) continue;
            const score = scoreMove(grid, x, y, colour);
            if (!best || score > best.score) best = { x, y, score };
        }
    }
    return best && best.score >= threshold ? best : null;
}

/** Routers on the board for each side - a cheap running read on who is ahead. */
export function tally(board) {
    const grid = toGrid(board);
    let us = 0, them = 0, empty = 0;
    for (const column of grid) {
        for (const point of column) {
            if (point === US) us++;
            else if (point === THEM) them++;
            else if (point === EMPTY) empty++;
        }
    }
    return { us, them, empty };
}

/**
 * The difficulty ladder, easiest first, with what each opponent permanently
 * grants. Node power scales with BOTH opponent difficulty and win streak, so
 * the right policy is to climb only as fast as we keep winning.
 */
export const OPPONENTS = [
    { name: "Netburners", komi: 1.5, bonus: "hacknet production" },
    { name: "Slum Snakes", komi: 3.5, bonus: "crime success rate" },
    { name: "The Black Hand", komi: 3.5, bonus: "hacking money" },
    { name: "Tetrads", komi: 5.5, bonus: "combat stat levels" },
    { name: "Daedalus", komi: 5.5, bonus: "reputation gain" },
    { name: "Illuminati", komi: 7.5, bonus: "faster hack, grow and weaken" },
];

/**
 * Adaptive difficulty. Climb after a streak of wins, drop back after repeated
 * losses, and never sit at a tier we cannot beat - a lost game is worth no node
 * power at all, so a hard opponent we lose to is strictly worse than an easy one
 * we beat. `preferred` pins a tier when the player wants a specific bonus.
 */
export function chooseOpponent({ index = 0, wins = 0, losses = 0, preferred = null } = {}) {
    if (preferred) {
        const pinned = OPPONENTS.findIndex(o => o.name.toLowerCase() === String(preferred).toLowerCase());
        if (pinned >= 0) return { index: pinned, ...OPPONENTS[pinned], pinned: true };
    }
    let next = Math.min(Math.max(0, index), OPPONENTS.length - 1);
    if (wins >= 3 && next < OPPONENTS.length - 1) next++;
    else if (losses >= 2 && next > 0) next--;
    return { index: next, ...OPPONENTS[next], pinned: false };
}
