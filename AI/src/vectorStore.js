import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkText } from './chunker.js';
import { cosine } from './embedder.js';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = join(here, '..', 'data');

/**
 * Bundled vector store: dense vectors in a JSON file, one namespace per member.
 *
 * This is the fallback used when Chroma is unreachable, so the pipeline keeps
 * working without a database running. It is not meant to scale.
 */
export function createVectorStore({ dataDir = DEFAULT_DATA_DIR, embedder, chunkOptions } = {}) {
  const file = join(dataDir, 'vectors.json');

  let chunks = [];
  let loaded = false;
  let writeQueue = Promise.resolve();

  const round = (value) => Number(value.toFixed(5));

  async function load() {
    if (loaded) return;

    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'));
      chunks = Array.isArray(parsed.chunks) ? parsed.chunks : [];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      chunks = [];
    }

    loaded = true;
  }

  async function persist() {
    await mkdir(dataDir, { recursive: true });
    const tmpFile = join(dataDir, `.vectors.${randomUUID()}.tmp`);
    await writeFile(tmpFile, JSON.stringify({ chunks }), 'utf8');
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

  async function ingest({ namespace, sourceId, title, text, metadata = {} }) {
    await load();

    const pieces = chunkText(text, chunkOptions);
    const embeddings = await embedder.embedBatch(pieces.map((piece) => `${title} ${piece}`));
    const createdAt = new Date().toISOString();

    return withLock(async () => {
      chunks = chunks.filter(
        (chunk) => !(chunk.namespace === namespace && chunk.sourceId === sourceId),
      );

      pieces.forEach((piece, index) => {
        chunks.push({
          id: randomUUID(),
          namespace,
          sourceId,
          sourceTitle: title,
          index,
          text: piece,
          vector: embeddings[index].map(round),
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

    const [queryVector] = await embedder.embedBatch([question]);

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

  async function listNamespaces() {
    await load();

    const map = new Map();

    for (const chunk of chunks) {
      const entry = map.get(chunk.namespace) ?? {
        namespace: chunk.namespace,
        chunks: 0,
        sources: new Set(),
      };

      entry.chunks += 1;
      entry.sources.add(chunk.sourceId);
      map.set(chunk.namespace, entry);
    }

    return [...map.values()]
      .map((entry) => ({
        namespace: entry.namespace,
        chunks: entry.chunks,
        sources: entry.sources.size,
      }))
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
    backend: 'local',
    ready: load,
    ingest,
    search,
    removeSource,
    listNamespaces,
    listSources,
    get stats() {
      return { ...embedder.stats, backend: 'local', chunks: chunks.length };
    },
  };
}
