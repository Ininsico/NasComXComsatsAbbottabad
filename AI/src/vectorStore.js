import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkText } from './chunker.js';
import { cosine, createEmbedder } from './embedder.js';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = join(here, '..', 'data');

/**
 * Persistent vector store with isolated namespaces.
 *
 * Chunks are tagged with a namespace and every search is restricted to the
 * namespaces it is given, so one member's documents can never surface in
 * another member's retrieval.
 */
export function createVectorStore({ dataDir = DEFAULT_DATA_DIR, chunkOptions } = {}) {
  const file = join(dataDir, 'vectors.json');
  const embedder = createEmbedder();

  let chunks = [];
  let loaded = false;
  let writeQueue = Promise.resolve();

  async function load() {
    if (loaded) return;

    try {
      const raw = await readFile(file, 'utf8');
      const parsed = JSON.parse(raw);
      chunks = Array.isArray(parsed.chunks) ? parsed.chunks : [];
      embedder.importState(parsed.embedder);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      chunks = [];
    }

    loaded = true;
  }

  async function persist() {
    await mkdir(dataDir, { recursive: true });
    const tmpFile = join(dataDir, `.vectors.${randomUUID()}.tmp`);
    const payload = { embedder: embedder.exportState(), chunks };

    await writeFile(tmpFile, `${JSON.stringify(payload)}\n`, 'utf8');
    await rename(tmpFile, file);
  }

  function withLock(task) {
    const run = writeQueue.then(task, task);
    writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Add a document to one namespace. Re-ingesting the same source replaces it. */
  async function ingest({ namespace, sourceId, title, text, metadata = {} }) {
    await load();

    return withLock(async () => {
      chunks = chunks.filter(
        (chunk) => !(chunk.namespace === namespace && chunk.sourceId === sourceId),
      );

      const pieces = chunkText(text, chunkOptions);
      const createdAt = new Date().toISOString();

      pieces.forEach((piece, index) => {
        const tokens = embedder.tokenize(`${title} ${piece}`);
        embedder.fit(tokens);

        chunks.push({
          id: randomUUID(),
          namespace,
          sourceId,
          sourceTitle: title,
          index,
          text: piece,
          vector: embedder.embed(tokens),
          metadata,
          createdAt,
        });
      });

      await persist();

      return { namespace, sourceId, title, chunks: pieces.length };
    });
  }

  async function removeSource(namespace, sourceId) {
    await load();

    return withLock(async () => {
      const before = chunks.length;
      chunks = chunks.filter(
        (chunk) => !(chunk.namespace === namespace && chunk.sourceId === sourceId),
      );
      await persist();
      return { removed: before - chunks.length };
    });
  }

  async function search({ namespaces, question, topK = 4, minScore = 0.05 }) {
    await load();

    const scoped = chunks.filter((chunk) => namespaces.includes(chunk.namespace));
    if (scoped.length === 0) return [];

    const queryVector = embedder.embed(embedder.tokenize(question));

    return scoped
      .map((chunk) => ({
        id: chunk.id,
        namespace: chunk.namespace,
        sourceId: chunk.sourceId,
        sourceTitle: chunk.sourceTitle,
        text: chunk.text,
        metadata: chunk.metadata,
        score: Number(cosine(queryVector, chunk.vector).toFixed(4)),
      }))
      .filter((hit) => hit.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /** What a namespace holds, for the UI. */
  async function listNamespaces() {
    await load();

    const map = new Map();

    for (const chunk of chunks) {
      const entry = map.get(chunk.namespace) ?? { namespace: chunk.namespace, chunks: 0, sources: new Set() };
      entry.chunks += 1;
      entry.sources.add(chunk.sourceId);
      map.set(chunk.namespace, entry);
    }

    return [...map.values()]
      .map((entry) => ({ namespace: entry.namespace, chunks: entry.chunks, sources: entry.sources.size }))
      .sort((a, b) => a.namespace.localeCompare(b.namespace));
  }

  async function listSources(namespace) {
    await load();

    const map = new Map();

    for (const chunk of chunks.filter((item) => item.namespace === namespace)) {
      const entry = map.get(chunk.sourceId) ?? {
        sourceId: chunk.sourceId,
        title: chunk.sourceTitle,
        chunks: 0,
        createdAt: chunk.createdAt,
      };
      entry.chunks += 1;
      map.set(chunk.sourceId, entry);
    }

    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  return {
    ingest,
    removeSource,
    search,
    listNamespaces,
    listSources,
    get stats() {
      return { ...embedder.stats, chunks: chunks.length };
    },
  };
}
