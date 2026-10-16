import { createChromaStore } from './chromaStore.js';
import { createVectorStore, DEFAULT_DATA_DIR } from './vectorStore.js';

/**
 * Picks the vector backend at first use.
 *
 * Chroma is preferred when a URL is configured and the server answers a
 * heartbeat; otherwise the built-in store keeps the pipeline working. The chosen
 * backend is reported so the UI can show which one is live.
 */
export function createAdaptiveStore({
  chromaUrl,
  dataDir = DEFAULT_DATA_DIR,
  chunkOptions,
  ChromaClient,
  onFallback,
} = {}) {
  let resolved = null;

  async function active() {
    if (resolved) return resolved;

    let fallbackReason = 'No Chroma URL configured';

    if (chromaUrl) {
      const chroma = createChromaStore({ url: chromaUrl, dataDir, chunkOptions, ChromaClient });

      try {
        await chroma.ready();
        resolved = { store: chroma, backend: 'chroma', reason: null };
        return resolved;
      } catch (error) {
        fallbackReason = `Chroma unreachable: ${error.message}`;
        onFallback?.(error);
      }
    }

    resolved = {
      store: createVectorStore({ dataDir, chunkOptions }),
      backend: 'local',
      reason: fallbackReason,
    };

    return resolved;
  }

  return {
    /** Which backend is actually serving — `pending` until the first call. */
    async describe() {
      const { backend, reason, store } = await active();
      return { backend, reason, url: store.url ?? null };
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
