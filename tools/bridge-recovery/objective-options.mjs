const finite = value => Number.isFinite(value) && value>=0;
const factionName = value => typeof value==='string' && value.length>0 && value.length<=100 && !/[\u0000-\u001f\u007f]/.test(value);
export const OBJECTIVE_ACTIONS = new Set(['faction-reputation','automatic-policy']);
export function validObjectiveParams(action, params) {
  if (!params || typeof params!=='object' || Array.isArray(params)) return false;
  if (action==='automatic-policy') return Object.keys(params).length===1 && params.scope==='current-operator-objective';
  return action==='faction-reputation' && Object.keys(params).length===2 && factionName(params.faction) &&
    Number.isFinite(params.targetRep) && params.targetRep>0 && params.targetRep<=1e12;
}
export function validObjectiveJournal(journal) {
  if (!journal || journal.schemaVersion!==1 || !Number.isSafeInteger(journal.revision) || journal.revision<0 ||
      !Array.isArray(journal.receipts) || journal.receipts.length>1024 || !Object.hasOwn(journal,'active')) return false;
  const statuses = new Set(['accepted','starting','working','observing','blocked','succeeded','cancelled','reset-interrupted']);
  if (journal.receipts.some(r=>!r || typeof r.id!=='string' || !/^[\w.:-]{1,96}$/.test(r.id) ||
      !['faction','auto'].includes(r.action) || !statuses.has(r.status) || typeof r.resetEpoch!=='string' || !/^\d+:\d+:\d+$/.test(r.resetEpoch) ||
      !finite(r.requestedAt) || (r.action==='faction' && !validObjectiveParams('faction-reputation',{faction:r.faction,targetRep:r.targetRep})) ||
      (r.action==='auto' && (r.faction!==null || r.targetRep!==null)))) return false;
  if (new Set(journal.receipts.map(r=>r.id)).size!==journal.receipts.length) return false;
  const active=journal.active;
  return active===null || Boolean(active && journal.receipts.some(r=>r.id===active.id && r.action==='faction' &&
    r.status===active.status && r.resetEpoch===active.resetEpoch && r.faction===active.faction && r.targetRep===active.targetRep));
}

// Read existing native observations. This adapter cannot select arbitrary
// factions, fabricate requirements, buy augmentations or install a reset.
export async function objectiveOptions({report,heartbeat,readJson,now}) {
  const empty = reason => ({options:[],reason});
  const journal=await readJson('/matrix/state/objective-journal.txt', {schemaVersion:1,revision:0,active:null,receipts:[]});
  if (!validObjectiveJournal(journal)) return empty('invalid-objective-journal');
  if (!(report.home?.maxRam>=64) || !['running','paused'].includes(report.status)) return empty('full-stage-unavailable');
  if (journal.active) {
    if (journal.active.resetEpoch!==report.resetEpoch) return empty('previous-reset-objective');
    if (journal.receipts.length>=1024) return empty('objective-journal-full');
    return {options:[{action:'automatic-policy',params:{scope:'current-operator-objective'},
      effect:"Annuler l'objectif opérateur actif au moment de l'exécution et restaurer la politique automatique. Les resets automatiques redeviennent possibles selon la configuration."}],reason:null};
  }
  if (journal.receipts.length>=1023) return empty('objective-journal-full');
  if (report.status!=='running' || report.stage?.observed!=='full' ||
      !report.capabilities?.some(c=>c.id==='progression' && c.state==='observed')) return empty('progression-unavailable');
  if (!heartbeat.processes?.some(p=>String(p.filename).replace(/^\/+/, '')==='matrix/services/singularity.js')) return empty('dispatcher-not-running');
  const singularity=await readJson('/matrix/state/singularity.txt',null);
  const overview=await readJson('/matrix/state/overview.txt',null);
  const fresh = data => finite(data?.updated) && data.updated<=now && now-data.updated<=15000;
  if (!fresh(singularity) || singularity.schemaVersion!==1 || singularity.resetEpoch!==report.resetEpoch || singularity.status!=='online') return empty('stale-singularity-evidence');
  const reset=overview?.reset;
  if (!fresh(overview) || `${reset?.currentNode}:${reset?.lastNodeReset}:${reset?.lastAugReset}`!==report.resetEpoch) return empty('stale-membership-evidence');
  const goal=singularity.goal;
  if (!goal || !validObjectiveParams('faction-reputation',{faction:goal.faction,targetRep:goal.need}) || !finite(goal.rep) || goal.rep>=goal.need ||
      !Array.isArray(overview.player?.factions) || !overview.player.factions.includes(goal.faction)) return empty('no-observed-reputation-target');
  return {options:[{action:'faction-reputation',params:{faction:goal.faction,targetRep:goal.need},
    effect:`Poursuivre ${goal.need} de réputation auprès de ${goal.faction}. Suspend les resets automatiques tant que cet objectif reste actif.`,
    evidence:{currentRep:goal.rep,targetRep:goal.need,updated:singularity.updated,source:'native-singularity-goal',scope:'faction-reputation-threshold'}}],reason:null};
}
