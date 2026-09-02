const REQUEST = "/matrix/state/update-request.txt";

export async function main(ns) {
    await ns.write(REQUEST, String(Date.now()), "w");
    ns.tprint("MATRIX-OS // UPDATE QUEUED; THE ACTIVE MATRIX STAGE WILL RESTART FROM GITHUB.");
    ns.tprint("MATRIX-OS // IF MATRIX WAS STOPPED, RUN /matrix/kernel.js ONCE.");
}
