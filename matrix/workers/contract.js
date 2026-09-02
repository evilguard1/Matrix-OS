import { solvers } from "/matrix/lib/solvers.js";

/**
 * One-shot coding-contract solver.
 *
 * The expensive half of contract solving lives here so it never sits resident on
 * home: getContractType (5) + getData (5) + attempt (10) is 20 GB of the 21.6 GB
 * this costs. It runs on any rooted network host with room, solves exactly one
 * contract, and exits - the same inversion the worm uses.
 *
 * A contract has a limited number of attempts, so an unknown type or a solver
 * that throws must exit WITHOUT attempting.
 *
 * args: [host, file]
 */
export async function main(ns) {
    const [host, file] = ns.args.map(String);
    const type = ns.codingcontract.getContractType(file, host);
    const solver = solvers[type];
    if (!solver) return;

    let answer;
    try { answer = solver(ns.codingcontract.getData(file, host)); }
    catch { return; }
    if (answer === undefined || answer === null) return;

    const reward = ns.codingcontract.attempt(answer, file, host);
    ns.tprint(reward
        ? `MATRIX-OS // CONTRACT ${type} on ${host}: ${reward}`
        : `MATRIX-OS // CONTRACT FAILED ${type} on ${host}`);
}
