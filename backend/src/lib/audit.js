import { createHash, randomUUID } from 'node:crypto';
import { db } from './db.js';

const entries = db.collection('audit');

/**
 * The canonical string a hash commits to. Field order is fixed here so a chain
 * can be re-verified deterministically no matter how the entry was assembled.
 */
function fingerprint(prevHash, entry) {
  const canonical = JSON.stringify([
    entry.workspaceId,
    entry.actorId ?? null,
    entry.action,
    entry.target ?? null,
    entry.metadata ?? null,
    entry.at,
  ]);

  return createHash('sha256').update(`${prevHash ?? ''}\n${canonical}`).digest('hex');
}

/**
 * Append one audit entry. Every entry commits to the previous entry's hash, so
 * editing, reordering or dropping any record breaks the chain and is detectable.
 */
export async function record({ workspaceId, actorId = null, action, target = null, metadata = null }) {
  return entries.mutate((rows) => {
    const previous = [...rows].reverse().find((row) => row.workspaceId === workspaceId);
    const entry = {
      id: randomUUID(),
      workspaceId,
      actorId,
      action,
      target,
      metadata,
      at: new Date().toISOString(),
      prevHash: previous?.hash ?? null,
    };

    entry.hash = fingerprint(entry.prevHash, entry);
    rows.push(entry);
    return entry;
  });
}

/** Newest first, optionally filtered — the order the console renders. */
export async function listEntries(workspaceId, { action, actorId, from, to, limit = 200 } = {}) {
  let rows = await entries.where((row) => row.workspaceId === workspaceId);

  if (action) rows = rows.filter((row) => row.action === action);
  if (actorId) rows = rows.filter((row) => row.actorId === actorId);
  if (from) rows = rows.filter((row) => row.at >= from);
  if (to) rows = rows.filter((row) => row.at <= to);

  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, Math.min(Number(limit) || 200, 1000));
}

/** Recompute the chain and report the first entry that does not match. */
export async function verifyChain(workspaceId) {
  const rows = (await entries.where((row) => row.workspaceId === workspaceId)).sort((a, b) =>
    a.at < b.at ? -1 : 1,
  );

  let prevHash = null;

  for (const row of rows) {
    if ((row.prevHash ?? null) !== prevHash) return { valid: false, brokenAt: row.id };
    if (fingerprint(prevHash, row) !== row.hash) return { valid: false, brokenAt: row.id };
    prevHash = row.hash;
  }

  return { valid: true, entries: rows.length };
}
