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

/** Newest first — the order the console renders. */
export async function listEntries(workspaceId) {
  const rows = await entries.where((row) => row.workspaceId === workspaceId);
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1));
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
