/** Boosts faction reputation gain while working. 1.6 base + 2.4 share = 4.0 GB. */
export async function main(ns) {
    while (true) await ns.share();
}
