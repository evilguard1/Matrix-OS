const JOURNAL = "/cloud/agent-journal.txt";
const LIMIT = 4096;
export function eligible(command, epoch, now) {
  return command?.schemaVersion === 2 && typeof command.id === "string" && /^[\w:-]{1,128}$/.test(command.id) &&
    command.resetEpoch === epoch && Number.isFinite(command.expiresAt) && command.expiresAt > now &&
    command.expiresAt <= now + 60000 && ["run","kill","killall"].includes(command.action);
}
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  if (ns.getHostname() !== "home") return;
  if (ns.ps("home").some(p => p.filename.replace(/^\/+/, "") === "cloud/agent.js" && p.pid < ns.pid)) return;
  const reset = ns.getResetInfo();
  const epoch = `${reset.currentNode}:${reset.lastNodeReset}:${reset.lastAugReset}`;
  let journal;
  const raw = ns.read(JOURNAL);
  try { journal = raw ? JSON.parse(raw) : null; } catch { ns.tprint("CLOUD // corrupt journal; refusing jobs"); return; }
  if (journal && (journal.schemaVersion !== 2 || !Array.isArray(journal.receipts))) { ns.tprint("CLOUD // invalid journal; refusing jobs"); return; }
  if (!journal || journal.resetEpoch !== epoch) journal = {schemaVersion:2,resetEpoch:epoch,receipts:[],pending:null};
  const save = async () => {
    const encoded = JSON.stringify(journal);
    await ns.write(JOURNAL, encoded, "w");
    if (ns.read(JOURNAL) !== encoded) throw new Error("agent journal write failed");
  };
  if (journal.pending) {
    journal.receipts.push({...journal.pending,status:"unknown-after-interruption",completedAt:Date.now()});
    journal.pending = null;
  }
  await save();
  while (true) {
    let commands = [], error = null;
    try {
      commands = JSON.parse(ns.read("/cloud/commands.json") || "[]");
      if (!Array.isArray(commands)) throw new Error("invalid command queue");
    } catch (e) { commands=[]; error=String(e); }
    for (const command of commands) {
      if (!eligible(command, epoch, Date.now()) || journal.receipts.some(r => r.id === command.id)) continue;
      if (journal.receipts.length >= LIMIT) { error="receipt capacity reached; new jobs blocked"; break; }
      journal.pending = {id:command.id,action:command.action,server:command.server,startedAt:Date.now()};
      await save();
      let status="failed", result=null;
      try {
        const server=command.server ?? "home", script=command.script;
        if (command.action === "killall" && server === "home") throw new Error("cannot kill home agent");
        if (command.action !== "run" && script?.replace(/^\/+/, "") === "cloud/agent.js") throw new Error("cannot kill agent");
        if (command.action === "run") { result=ns.exec(script,server,command.threads ?? 1,...(command.args ?? [])); status=result>0?"started":"not-started"; }
        else if (command.action === "kill") { result=ns.scriptKill(script,server); status=result?"killed":"not-running"; }
        else { result=ns.killall(server); status=result?"killed":"nothing-killed"; }
      } catch (e) { result=String(e); }
      const receipt={...journal.pending,status,result,completedAt:Date.now()};
      journal.receipts.push(receipt); journal.pending=null;
      await save();
      await ns.write("/cloud/status.txt",JSON.stringify(receipt),"w");
      await ns.write("/cloud/agent-state.txt",command.id,"w");
    }
    await ns.write("/cloud/heartbeat.txt",JSON.stringify({schemaVersion:2,updated:Date.now(),resetEpoch:epoch,pid:ns.pid,
      status:error?"degraded":"online",error,receiptCount:journal.receipts.length,homeRam:ns.getServerMaxRam("home"),usedRam:ns.getServerUsedRam("home"),processes:ns.ps("home")}),"w");
    await ns.sleep(1000);
  }
}
