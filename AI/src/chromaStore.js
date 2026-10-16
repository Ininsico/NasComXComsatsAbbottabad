import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkText } from './chunker.js';
import { createEmbedder, DEFAULT_DIMENSIONS } from './embedder.js';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = join(here, '..', 'data');

/**
 * Chroma-backed vector store.
 *
 * One collection per namespace, so each member's documents live in a genuinely
 * separate vector space and a query can only ever reach the collections it names.
 *
 * The embedder's IDF table is persisted next to the collection data, so query
 * vectors are weighted identically before and after a restart.
 */
export function createChromaStore({
  url = 'http://localhost:8000',
  dataDir = DEFAULT_DATA_DIR,
  chunkOptions,
  ChromaClient,
} = {}) {
  const embedder = createEmbedder({ dimensions: DEFAULT_DIMENSIONS });
  const stateFile = join(dataDir, 'embedder.json');

  let client = null;
  const collections = new Map();
  let loaded = false;

  async function loadEmbedderState() {
    if (loaded) return;
    loaded = true;

    try {
      embedder.importState(JSON.parse(await readFile(stateFile, 'utf8')));
    } catch {
      // No state yet — the first run learns as it ingests.
    }
  }

  async function saveEmbedderState() {
    await mkdir(dataDir, { recursive: true });
    const tmp = join(dataDir, `.embedder.${Date.now()}.tmp`);
    await writeFile(tmp, JSON.stringify(embedder.exportState()), 'utf8');
    await rename(tmp, stateFile);
  }

  /** Chroma names must be 3-63 chars of [a-zA-Z0-9._-] starting with a letter. */
  function collectionName(namespace) {
    const safe = String(namespace).replace(/[^a-zA-Z0-9._-]/g, '-');
    return `ns-${safe}`.slice(0, 63).toLowerCase();
  }

  /** The client is injected by the caller, so this package stays dependency-free. */
  async function connect() {
    if (client) return client;

    if (typeof ChromaClient !== 'function') {
      throw new Error('A ChromaClient constructor was not provided');
    }

    const parsed = new URL(url);
    const ssl = parsed.protocol === 'https:';

    const created = new ChromaClient({
      host: parsed.hostname,
      port: Number(parsed.port || (ssl ? 443 : 8000)),
      ssl,
    });

    await created.heartbeat();

    client = created;
    await loadEmbedderState();
    return client;
  }

  async function collection(namespace) {
    const name = collectionName(namespace);

    if (collections.has(name)) return collections.get(name);

    const active = await connect();
    const created = await active.getOrCreateCollection({
      name,
      metadata: { namespace, 'hnsw:space': 'cosine' },
    });

    collections.set(name, created);
    return created;
  }

  /** Chroma takes dense vectors; the embedder produces sparse pairs. */
  function dense(pairs) {
    const vector = new Array(embedder.dimensions).fill(0);

    for (const [index, weight] of pairs) {
      vector[index] = weight;
    }

    return vector;
  }

  /** Chroma metadata accepts primitives only. */
  function flatten(source) {
    const out = {};

    for (const [key, value] of Object.entries(source ?? {})) {
      if (typeof value === 'string') out[key] = value.slice(0, 800);
      else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    }

    return out;
  }

  async function ingest({ namespace, sourceId, title, text, metadata = {} }) {
    const target = await collection(namespace);

    // Re-ingesting a source replaces it rather than duplicating chunks.
    try {
      await target.delete({ where: { sourceId } });
    } catch {
      // Nothing stored for this source yet.
    }

    const pieces = chunkText(text, chunkOptions);

    if (pieces.length === 0) return { namespace, sourceId, title, chunks: 0 };

    const createdAt = new Date().toISOString();
    const embeddings = [];
    const ids = [];

    pieces.forEach((piece, index) => {
      const tokens = embedder.tokenize(`${title} ${piece}`);
      embedder.fit(tokens);
      embeddings.push(dense(embedder.embed(tokens)));
      ids.push(`${sourceId}::${index}`);
    });

    await target.add({
      ids,
      embeddings,
      documents: pieces,
      metadatas: pieces.map((piece, index) => ({
        namespace,
        sourceId,
        title,
        index,
        createdAt,
        ...flatten(metadata),
      })),
    });

    await saveEmbedderState();

    return { namespace, sourceId, title, chunks: pieces.length };
  }

  async function search({ namespaces, question, topK = 4, minScore = 0.05 }) {
    if (question.trim().length === 0) return [];

    const queryVector = dense(embedder.embed(embedder.tokenize(question)));
    const hits = [];

    for (const namespace of namespaces) {
      const target = await collection(namespace);
      const result = await target.query({
        queryEmbeddings: [queryVector],
        nResults: topK,
        include: ['documents', 'metadatas', 'distances'],
      });

      const ids = result.ids?.[0] ?? [];

      ids.forEach((id, position) => {
        const distance = Number(result.distances?.[0]?.[position] ?? 1);
        const score = Number((1 - distance).toFixed(4));

        if (score < minScore) return;

        const meta = result.metadatas?.[0]?.[position] ?? {};

        hits.push({
          id,
          namespace,
          sourceId: meta.sourceId,
          sourceTitle: meta.title,
          text: result.documents?.[0]?.[position] ?? '',
          metadata: meta,
          score,
        });
      });
    }

    return hits.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async function removeSource(namespace, sourceId) {
    const target = await collection(namespace);

    try {
      await target.delete({ where: { sourceId } });
      return { removed: 1 };
    } catch {
      return { removed: 0 };
    }
  }

  async function listNamespaces() {
    const active = await connect();
    const listed = await active.listCollections();
    const out = [];

    for (const entry of listed) {
      const name = typeof entry === 'string' ? entry : entry.name;
      const found = await active.getCollection({ name });
      const namespace = found.metadata?.namespace ?? name;
      const all = await found.get({ include: ['metadatas'] });
      const sources = new Set((all.metadatas ?? []).map((meta) => meta?.sourceId).filter(Boolean));

      out.push({ namespace, chunks: all.ids?.length ?? 0, sources: sources.size });
    }

    return out.sort((a, b) => a.namespace.localeCompare(b.namespace));
  }

  async function listSources(namespace) {
    const target = await collection(namespace);
    const all = await target.get({ include: ['metadatas'] });
    const map = new Map();

    for (const meta of all.metadatas ?? []) {
      if (!meta?.sourceId) continue;

      const entry = map.get(meta.sourceId) ?? {
        sourceId: meta.sourceId,
        title: meta.title ?? meta.sourceId,
        chunks: 0,
        createdAt: meta.createdAt ?? null,
      };

      entry.chunks += 1;
      map.set(meta.sourceId, entry);
    }

    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  return {
    backend: 'chroma',
    url,
    ready: connect,
    ingest,
    search,
    removeSource,
    listNamespaces,
    listSources,
    get stats() {
      return { ...embedder.stats, backend: 'chroma' };
    },
  };
}
