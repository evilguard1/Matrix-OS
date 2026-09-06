export async function main(ns) {
    if(ns.peek?.(20)==="MATRIX:PAUSED")return;
    const [target, extra = 0] = ns.args;
    await ns.weaken(String(target), { additionalMsec: Number(extra) || 0 });
}
