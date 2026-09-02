/** Charges one Stanek fragment. charge() scales with threads, so this runs wide. */
export async function main(ns) {
    const x = Number(ns.args[0]);
    const y = Number(ns.args[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    try { await ns.stanek.chargeFragment(x, y); } catch {}
}
