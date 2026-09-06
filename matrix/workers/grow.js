export async function main(ns) {
    if(ns.peek?.(20)==="MATRIX:PAUSED")return;
    const [target, extra = 0, stock = false] = ns.args;
    await ns.grow(String(target), { additionalMsec: Number(extra) || 0, stock: Boolean(stock) });
}
