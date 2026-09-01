export async function main(ns) {
    const [target, extra = 0] = ns.args;
    await ns.weaken(String(target), { additionalMsec: Number(extra) || 0 });
}
