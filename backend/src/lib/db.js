import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Where every runtime collection lives — one JSON file per collection, gitignored. */
export const dataDir = join(here, '..', '..', 'data');

/**
 * A tiny JSON-backed collection with atomic writes and a serialised write queue,
 * so two concurrent requests can never interleave into a corrupt file. Reads are
 * uncached on purpose: the files are small and the file is the source of truth.
 */
export function collection(name) {
  const file = join(dataDir, `${name}.json`);
  let queue = Promise.resolve();

  async function readRows() {
    try {
      const raw = await readFile(file, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function writeRows(rows) {
    await mkdir(dataDir, { recursive: true });
    const tmp = join(dataDir, `.${name}.${randomUUID()}.tmp`);
    await writeFile(tmp, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
    await rename(tmp, file);
  }

  function withLock(task) {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    name,
    read: () => readRows(),
    find: async (predicate) => (await readRows()).find(predicate) ?? null,
    where: async (predicate) => (await readRows()).filter(predicate),

    /** Read-modify-write under the lock. `fn(rows)` may return a value for the caller. */
    mutate: (fn) =>
      withLock(async () => {
        const rows = await readRows();
        const outcome = await fn(rows);
        await writeRows(rows);
        return outcome;
      }),

    insert: (doc) =>
      withLock(async () => {
        const rows = await readRows();
        const record = { ...doc, id: doc.id ?? randomUUID() };
        rows.push(record);
        await writeRows(rows);
        return record;
      }),
  };
}

export const db = { collection };
export const newId = () => randomUUID();
