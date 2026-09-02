/**
 * Coding-contract solvers.
 *
 * Pure functions, deliberately separate from matrix/services/contracts.js so
 * every one can be tested without a running game. A contract has limited
 * attempts, so an unknown or uncertain type must be SKIPPED rather than guessed
 * at - contracts.js only attempts a type that appears here.
 */
export const solvers = {
    "Find Largest Prime Factor": n => {
        let f = 2, last = 1;
        while (f * f <= n) {
            if (n % f === 0) { last = f; n /= f; } else f += (f === 2 ? 1 : 2);
        }
        return Math.max(last, n);
    },
    "Subarray with Maximum Sum": a => {
        let best = -Infinity, cur = 0;
        for (const x of a) { cur = Math.max(x, cur + x); best = Math.max(best, cur); }
        return best;
    },
    "Total Ways to Sum": n => {
        const dp = Array(n + 1).fill(0); dp[0] = 1;
        for (let x = 1; x < n; x++) for (let s = x; s <= n; s++) dp[s] += dp[s - x];
        return dp[n];
    },
    "Total Ways to Sum II": ([n, nums]) => {
        const dp = Array(n + 1).fill(0); dp[0] = 1;
        for (const x of nums) for (let s = x; s <= n; s++) dp[s] += dp[s - x];
        return dp[n];
    },
    "Spiralize Matrix": m => {
        const out = []; let t = 0, b = m.length - 1, l = 0, r = m[0].length - 1;
        while (t <= b && l <= r) {
            for (let j = l; j <= r; j++) out.push(m[t][j]); t++;
            for (let i = t; i <= b; i++) out.push(m[i][r]); r--;
            if (t <= b) { for (let j = r; j >= l; j--) out.push(m[b][j]); b--; }
            if (l <= r) { for (let i = b; i >= t; i--) out.push(m[i][l]); l++; }
        }
        return out;
    },
    "Array Jumping Game": a => {
        let far = 0;
        for (let i = 0; i <= far && i < a.length; i++) far = Math.max(far, i + a[i]);
        return far >= a.length - 1 ? 1 : 0;
    },
    "Array Jumping Game II": a => {
        if (a.length <= 1) return 0;
        let jumps = 0, end = 0, far = 0;
        for (let i = 0; i < a.length - 1; i++) {
            far = Math.max(far, i + a[i]);
            if (i === end) { jumps++; end = far; if (end >= a.length - 1) return jumps; }
        }
        return 0;
    },
    "Merge Overlapping Intervals": a => {
        a = [...a].sort((x, y) => x[0] - y[0]);
        const out = [];
        for (const x of a) {
            if (!out.length || out[out.length - 1][1] < x[0]) out.push([...x]);
            else out[out.length - 1][1] = Math.max(out[out.length - 1][1], x[1]);
        }
        return out;
    },
    "Generate IP Addresses": s => {
        const out = [];
        for (let a = 1; a <= 3; a++) for (let b = 1; b <= 3; b++) for (let c = 1; c <= 3; c++) {
            const d = s.length - a - b - c;
            if (d < 1 || d > 3) continue;
            const p = [s.slice(0, a), s.slice(a, a + b), s.slice(a + b, a + b + c), s.slice(a + b + c)];
            if (p.every(x => String(Number(x)) === x && Number(x) <= 255)) out.push(p.join("."));
        }
        return out;
    },
    "Algorithmic Stock Trader I": a => {
        let min = Infinity, best = 0;
        for (const x of a) { min = Math.min(min, x); best = Math.max(best, x - min); }
        return best;
    },
    "Algorithmic Stock Trader II": a => a.slice(1).reduce((s, x, i) => s + Math.max(0, x - a[i]), 0),
    "Algorithmic Stock Trader III": a => {
        let b1 = -Infinity, s1 = 0, b2 = -Infinity, s2 = 0;
        for (const x of a) { b1 = Math.max(b1, -x); s1 = Math.max(s1, b1 + x); b2 = Math.max(b2, s1 - x); s2 = Math.max(s2, b2 + x); }
        return s2;
    },
    "Algorithmic Stock Trader IV": ([k, a]) => {
        if (k >= a.length / 2) return a.slice(1).reduce((s, x, i) => s + Math.max(0, x - a[i]), 0);
        const buy = Array(k + 1).fill(-Infinity), sell = Array(k + 1).fill(0);
        for (const x of a) for (let j = 1; j <= k; j++) { buy[j] = Math.max(buy[j], sell[j - 1] - x); sell[j] = Math.max(sell[j], buy[j] + x); }
        return sell[k];
    },
    "Minimum Path Sum in a Triangle": tri => {
        const dp = [...tri[tri.length - 1]];
        for (let i = tri.length - 2; i >= 0; i--) for (let j = 0; j < tri[i].length; j++) dp[j] = tri[i][j] + Math.min(dp[j], dp[j + 1]);
        return dp[0];
    },
    "Unique Paths in a Grid I": ([r, c]) => {
        const dp = Array(c).fill(1);
        for (let i = 1; i < r; i++) for (let j = 1; j < c; j++) dp[j] += dp[j - 1];
        return dp[c - 1];
    },
    "Unique Paths in a Grid II": g => {
        const c = g[0].length, dp = Array(c).fill(0);
        dp[0] = g[0][0] ? 0 : 1;
        for (let i = 0; i < g.length; i++) for (let j = 0; j < c; j++) { if (g[i][j]) dp[j] = 0; else if (j) dp[j] += dp[j - 1]; }
        return dp[c - 1];
    },
    "Encryption I: Caesar Cipher": ([s, k]) => s.split("").map(ch => ch === " " ? ch : String.fromCharCode((ch.charCodeAt(0) - 65 - k + 260) % 26 + 65)).join(""),
    "Encryption II: Vigenère Cipher": ([s, key]) => s.split("").map((ch, i) => String.fromCharCode((ch.charCodeAt(0) - 65 + (key.charCodeAt(i % key.length) - 65)) % 26 + 65)).join(""),
};

// --- previously unsolved types ----------------------------------------------

solvers["Shortest Path in a Grid"] = grid => {
    const rows = grid.length, cols = grid[0].length;
    if (grid[0][0] === 1 || grid[rows - 1][cols - 1] === 1) return "";
    const moves = [["U", -1, 0], ["D", 1, 0], ["L", 0, -1], ["R", 0, 1]];
    const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
    seen[0][0] = true;
    const queue = [[0, 0, ""]];
    for (let head = 0; head < queue.length; head++) {
        const [r, c, path] = queue[head];
        if (r === rows - 1 && c === cols - 1) return path;
        for (const [ch, dr, dc] of moves) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
            if (grid[nr][nc] === 1 || seen[nr][nc]) continue;
            seen[nr][nc] = true;
            queue.push([nr, nc, path + ch]);
        }
    }
    return "";
};

solvers["Sanitize Parentheses in Expression"] = input => {
    const valid = str => {
        let depth = 0;
        for (const ch of str) {
            if (ch === "(") depth++;
            else if (ch === ")") { depth--; if (depth < 0) return false; }
        }
        return depth === 0;
    };
    let level = new Set([input]);
    while (level.size) {
        const good = [...level].filter(valid);
        if (good.length) return good.sort();
        const next = new Set();
        for (const cur of level) {
            for (let i = 0; i < cur.length; i++) {
                if (cur[i] !== "(" && cur[i] !== ")") continue;
                next.add(cur.slice(0, i) + cur.slice(i + 1));
            }
        }
        level = next;
    }
    return [""];
};

solvers["Find All Valid Math Expressions"] = ([digits, target]) => {
    const out = [];
    const walk = (pos, expr, value, prev) => {
        if (pos === digits.length) { if (value === target) out.push(expr); return; }
        for (let len = 1; pos + len <= digits.length; len++) {
            const part = digits.substr(pos, len);
            if (part.length > 1 && part[0] === "0") break;
            const num = Number(part);
            if (pos === 0) walk(len, part, num, num);
            else {
                walk(pos + len, `${expr}+${part}`, value + num, num);
                walk(pos + len, `${expr}-${part}`, value - num, -num);
                walk(pos + len, `${expr}*${part}`, value - prev + prev * num, prev * num);
            }
        }
    };
    walk(0, "", 0, 0);
    return out;
};

solvers["Proper 2-Coloring of a Graph"] = ([n, edges]) => {
    const adjacency = Array.from({ length: n }, () => []);
    for (const [a, b] of edges) { adjacency[a].push(b); adjacency[b].push(a); }
    const colour = Array(n).fill(-1);
    for (let start = 0; start < n; start++) {
        if (colour[start] !== -1) continue;
        colour[start] = 0;
        const queue = [start];
        for (let head = 0; head < queue.length; head++) {
            const u = queue[head];
            for (const v of adjacency[u]) {
                if (colour[v] === -1) { colour[v] = 1 - colour[u]; queue.push(v); }
                else if (colour[v] === colour[u]) return [];
            }
        }
    }
    return colour;
};

solvers["Compression I: RLE Compression"] = input => {
    let out = "";
    for (let i = 0; i < input.length;) {
        let j = i;
        while (j < input.length && input[j] === input[i]) j++;
        let run = j - i;
        while (run > 9) { out += `9${input[i]}`; run -= 9; }
        if (run > 0) out += `${run}${input[i]}`;
        i = j;
    }
    return out;
};

solvers["Compression II: LZ Decompression"] = data => {
    let out = "", i = 0, literal = true;
    while (i < data.length) {
        const length = Number(data[i]);
        i++;
        if (length) {
            if (literal) { out += data.substr(i, length); i += length; }
            else {
                const distance = Number(data[i]);
                i++;
                for (let n = 0; n < length; n++) out += out[out.length - distance];
            }
        }
        literal = !literal;
    }
    return out;
};

solvers["Square Root"] = value => {
    const n = BigInt(value);
    if (n < 2n) return n.toString();
    let x = n, y = (x + 1n) / 2n;
    while (y < x) { x = y; y = (x + n / x) / 2n; }
    // x is the floor; the contract wants the nearest integer.
    return (n - x * x <= (x + 1n) * (x + 1n) - n ? x : x + 1n).toString();
};

// Extended Hamming: index 0 carries overall parity, indices that are powers of
// two carry the block parities, everything else is data.
solvers["HammingCodes: Integer to Encoded Binary"] = value => {
    const data = value.toString(2).split("").map(Number);
    let parityBits = 0;
    while (2 ** parityBits < data.length + parityBits + 1) parityBits++;
    const total = data.length + parityBits + 1;
    const bits = Array(total).fill(0);
    let next = 0;
    for (let i = 1; i < total; i++) {
        if ((i & (i - 1)) === 0) continue;
        bits[i] = data[next++];
    }
    for (let p = 0; p < parityBits; p++) {
        const position = 2 ** p;
        let parity = 0;
        for (let i = 1; i < total; i++) if (i & position) parity ^= bits[i];
        bits[position] = parity;
    }
    bits[0] = bits.slice(1).reduce((a, b) => a ^ b, 0);
    return bits.join("");
};

// The XOR of every set index is the position of a single flipped bit, or 0.
solvers["HammingCodes: Encoded Binary to Integer"] = encoded => {
    const bits = String(encoded).split("").map(Number);
    let errorAt = 0;
    for (let i = 1; i < bits.length; i++) if (bits[i]) errorAt ^= i;
    if (errorAt && errorAt < bits.length) bits[errorAt] ^= 1;
    let binary = "";
    for (let i = 1; i < bits.length; i++) {
        if ((i & (i - 1)) === 0) continue;
        binary += bits[i];
    }
    return parseInt(binary, 2);
};

// Shortest LZ encoding. State is (kind, length): kind 0 is a pending literal
// run, kind>0 is a pending backreference at that offset. Deterministic on ties
// so the result is testable.
solvers["Compression III: LZ Compression"] = plain => {
    if (!plain.length) return "";
    let cur = Array.from({ length: 10 }, () => Array(10).fill(null));
    let next = Array.from({ length: 10 }, () => Array(10).fill(null));
    const set = (state, i, j, str) => {
        const existing = state[i][j];
        if (existing === null || str.length < existing.length) state[i][j] = str;
    };

    cur[0][1] = "";
    for (let i = 1; i < plain.length; i++) {
        for (const row of next) row.fill(null);
        const ch = plain[i];

        for (let length = 1; length <= 9; length++) {
            const str = cur[0][length];
            if (str === null) continue;
            if (length < 9) set(next, 0, length + 1, str);
            else set(next, 0, 1, `${str}9${plain.substring(i - 9, i)}0`);
            for (let offset = 1; offset <= Math.min(9, i); offset++) {
                if (plain[i - offset] === ch) set(next, offset, 1, str + String(length) + plain.substring(i - length, i));
            }
        }

        for (let offset = 1; offset <= 9; offset++) {
            for (let length = 1; length <= 9; length++) {
                const str = cur[offset][length];
                if (str === null) continue;
                if (plain[i - offset] === ch) {
                    if (length < 9) set(next, offset, length + 1, str);
                    else set(next, offset, 1, `${str}9${offset}0`);
                }
                set(next, 0, 1, str + String(length) + String(offset));
                for (let newOffset = 1; newOffset <= Math.min(9, i); newOffset++) {
                    if (plain[i - newOffset] === ch) set(next, newOffset, 1, `${str}${length}${offset}0`);
                }
            }
        }
        [cur, next] = [next, cur];
    }

    let best = null;
    for (let length = 1; length <= 9; length++) {
        const literal = cur[0][length];
        if (literal !== null) {
            const candidate = literal + String(length) + plain.substring(plain.length - length);
            if (best === null || candidate.length < best.length) best = candidate;
        }
        for (let offset = 1; offset <= 9; offset++) {
            const ref = cur[offset][length];
            if (ref === null) continue;
            const candidate = ref + String(length) + String(offset);
            if (best === null || candidate.length < best.length) best = candidate;
        }
    }
    return best ?? "";
};
