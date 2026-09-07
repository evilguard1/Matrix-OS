export function normalizeJob(job, heartbeat, now = Date.now()) {
  if (!job || !['run', 'kill', 'killall'].includes(job.action)) throw new Error('Invalid action');
  if (Object.keys(job).some(k => !['action','script','server','threads','args','idempotencyKey'].includes(k))) throw new Error('Invalid job field');
  const server = job.server ?? 'home';
  if (typeof server !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(server)) throw new Error('Invalid server');
  const script = job.script;
  if (script !== undefined && typeof script !== 'string') throw new Error('Invalid script');
  if (job.action !== 'killall' && (typeof script !== 'string' || !/^\/?[\w./-]+\.jsx?$/.test(script) || script.includes('..') || script.length > 240)) throw new Error('Invalid script');
  if ((script?.replace(/^\/+/, '') === 'cloud/agent.js' && job.action !== 'run') || (server === 'home' && job.action === 'killall')) throw new Error('Invalid job: agent must remain available');
  const threads = job.threads ?? 1, args = job.args ?? [];
  if (!Number.isInteger(threads) || threads < 1 || threads > 1e6) throw new Error('Invalid threads');
  if (!Array.isArray(args) || args.length > 64 || args.some(a => !['string','boolean','number'].includes(typeof a) || (typeof a === 'number' && !Number.isFinite(a)))) throw new Error('Invalid args');
  if (job.idempotencyKey !== undefined && (typeof job.idempotencyKey !== 'string' || !/^[\w:-]{1,96}$/.test(job.idempotencyKey))) throw new Error('Invalid idempotencyKey');
  if (heartbeat?.schemaVersion !== 2 || !Number.isFinite(heartbeat.updated) || heartbeat.updated > now || now - heartbeat.updated > 10000 || typeof heartbeat.resetEpoch !== 'string') throw new Error('Agent heartbeat unavailable or stale');
  return {action:job.action, server, ...(script ? {script} : {}), threads, args, resetEpoch:heartbeat.resetEpoch, schemaVersion:2, expiresAt:now+60000};
}
