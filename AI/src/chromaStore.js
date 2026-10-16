import { chunkText } from './chunker.js';

export const DEFAULT_CHROMA_URL = 'http://localhost:8000';

/**
 * Chroma-backed vector store.
 *
 * One collection per namespace, so each member's documents sit in a genuinely
 * separate vector space and a query can only reach the collections it names.
 *
 * The embedder and the ChromaClient are injected, so this package carries no
 * dependencies and never has to know whether vectors are semantic or hashed.
 */
export function createChromaStore({
  url = DEFAULT_CHROMA_URL,
  embedder,
  ChromaClient,
  collectionPrefix = 'ns-',
  chunkOptions,
} = {}) {
  let client = null;
  const collections = new Map();

  /** Chroma names must be 3-63 chars of [a-zA-Z0-9._-] starting with a letter. */
  function collectionName(namespace) {
    const safe = String(namespace).replace(/[^a-zA-Z0-9._-]/g, '-');
    return `${collectionPrefix}${safe}`.slice(0, 63).toLowerCase();
  }

  function parseUrl() {
    const parsed = new URL(url);
    const ssl = parsed.protocol === 'https:';

    return { host: parsed.hostname, port: Number(parsed.port || (ssl ? 443 : 8000)), ssl };
  }

  async function connect() {
    if (client) return client;

    if (typeof ChromaClient !== 'function') {
      throw new Error('A ChromaClient constructor was not provided');
    }

    const created = new ChromaClient(parseUrl());
    await created.heartbeat();

    client = created;
    return client;
  }

  async function collection(namespace) {
    const name = collectionName(namespace);

    if (collections.has(name)) return collections.get(name);

    const active = await connect();
    const created = await active.getOrCreateCollection({
      name,
      metadata: { namespace, 'hnsw:space': 'cosine' },
      // Embeddings are always supplied explicitly, but the client still wants a
      // function to build the collection with — otherwise it reaches for the
      // optional @chroma-core/default-embed and complains when it is absent.
      embeddingFunction: {
        generate: (texts) => embedder.embedBatch([...texts]),
      },
    });

    collections.set(name, created);
    return created;
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
    const embeddings = await embedder.embedBatch(pieces.map((piece) => `${title} ${piece}`));

    await target.add({
      ids: pieces.map((piece, index) => `${sourceId}::${index}`),
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

    return { namespace, sourceId, title, chunks: pieces.length };
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

  async function search({ namespaces, question, topK = 4, minScore = 0.05 }) {
    if (String(question).trim().length === 0) return [];

    const [queryVector] = await embedder.embedBatch([question]);
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
        // Chroma returns cosine distance; similarity is 1 - distance.
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

      if (collectionPrefix && !name.startsWith(collectionPrefix)) continue;

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
    collectionPrefix,
    ready: connect,
    ingest,
    search,
    removeSource,
    listNamespaces,
    listSources,
    get stats() {
      return { ...embedder.stats, backend: 'chroma', collectionPrefix };
    },
  };
}
