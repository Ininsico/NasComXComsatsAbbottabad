import { createChromaStore } from './chromaStore.js';
import { resolveEmbedder } from './embedders.js';
import { createVectorStore, DEFAULT_DATA_DIR } from './vectorStore.js';

/**
 * Picks the embedding model and the vector backend on first use.
 *
 * Embeddings are semantic (the Python service) when it is running, otherwise
 * hashed. The collection prefix follows the embedder, so semantic and hashed
 * vectors never land in the same collection — switching models cannot corrupt
 * an existing index, it just starts a new one.
 */
export function createAdaptiveStore({
  chromaUrl,
  semanticUrl,
  preferSemantic = true,
  dataDir = DEFAULT_DATA_DIR,
  chunkOptions,
  ChromaClient,
  onFallback,
} = {}) {
  let resolved = null;

  async function active() {
    if (resolved) return resolved;

    const embedder = await resolveEmbedder({
      semanticUrl,
      preferSemantic,
      onFallback: (error) => {
        onFallback?.(new Error(`semantic embeddings unavailable (${error.message})`));
      },
    });

    const collectionPrefix = embedder.kind === 'semantic' ? 'sem-' : 'ns-';
    let fallbackReason = chromaUrl ? null : 'No Chroma URL configured';

    if (chromaUrl) {
      const chroma = createChromaStore({
        url: chromaUrl,
        embedder,
        ChromaClient,
        collectionPrefix,
        chunkOptions,
      });

      try {
        await chroma.ready();
        resolved = { store: chroma, backend: 'chroma', embedder, reason: null };
        return resolved;
      } catch (error) {
        fallbackReason = `Chroma unreachable: ${error.message}`;
        onFallback?.(error);
      }
    }

    resolved = {
      store: createVectorStore({ dataDir, embedder, chunkOptions }),
      backend: 'local',
      embedder,
      reason: fallbackReason,
    };

    return resolved;
  }

  return {
    /** Which embedder and which backend are actually serving. */
    async describe() {
      const { backend, reason, store, embedder } = await active();

      return {
        backend,
        reason,
        url: store.url ?? null,
        collectionPrefix: store.collectionPrefix ?? null,
        embedder: { kind: embedder.kind, ...embedder.stats },
      };
    },

    async ingest(args) {
      return (await active()).store.ingest(args);
    },

    async search(args) {
      return (await active()).store.search(args);
    },

    async removeSource(namespace, sourceId) {
      return (await active()).store.removeSource(namespace, sourceId);
    },

    async listNamespaces() {
      return (await active()).store.listNamespaces();
    },

    async listSources(namespace) {
      return (await active()).store.listSources(namespace);
    },

    get stats() {
      return resolved?.store.stats ?? { backend: 'pending' };
    },
  };
}
