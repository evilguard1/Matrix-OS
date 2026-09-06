/** Boosts faction reputation gain while working. 1.6 base + 2.4 share = 4.0 GB. */
export async function main(ns) {
    if(ns.peek?.(20)==="MATRIX:PAUSED")return;
    const args = (ns.args ?? []).map(value => String(value));
    const endIndex = args.indexOf("--ends");
    const bounded = args.includes("--boost") && endIndex >= 0;
    const endsAt = bounded ? Number(args[endIndex + 1]) : Infinity;

    if (bounded && Number.isFinite(endsAt)) {
        while (Date.now() < endsAt && ns.peek?.(20)!=="MATRIX:PAUSED") await ns.share();
        return;
    }

    while (ns.peek?.(20)!=="MATRIX:PAUSED") await ns.share();
}
