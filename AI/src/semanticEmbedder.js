/**
 * Client for the Python semantic embedding service (`AI/main.py`).
 *
 * The model runs in that service (fastembed / ONNX), so this stays a thin HTTP
 * client and the Node side never has to carry a model runtime.
 */

export const DEFAULT_SEMANTIC_URL = 'http://127.0.0.1:8100';

export function createSemanticEmbedder({ url = DEFAULT_SEMANTIC_URL, batchSize = 64, timeoutMs = 120000 } = {}) {
  const base = url.replace(/\/+$/, '');

  let dimensions = null;
  let modelName = null;

  async function withTimeout(task) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await task(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Confirms the service is up *and* has an embedding model loaded. */
  async function ready() {
    const payload = await withTimeout(async (signal) => {
      const response = await fetch(`${base}/health`, { signal });
      if (!response.ok) throw new Error(`embedding service replied ${response.status}`);
      return response.json();
    });

    const embedder = payload?.embedder;

    if (embedder?.kind !== 'semantic' || !embedder?.dimensions) {
      throw new Error(embedder?.error ?? 'the embedding service has no semantic model loaded');
    }

    dimensions = embedder.dimensions;
    modelName = embedder.model;

    return { model: modelName, dimensions };
  }

  async function embedBatch(texts) {
    const vectors = [];

    for (let index = 0; index < texts.length; index += batchSize) {
      const slice = texts.slice(index, index + batchSize);

      const payload = await withTimeout(async (signal) => {
        const response = await fetch(`${base}/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: slice }),
          signal,
        });

        const body = await response.json().catch(() => null);

        if (!response.ok) throw new Error(body?.error ?? `embedding failed (${response.status})`);

        return body;
      });

      if (dimensions === null) dimensions = payload.dimensions;

      vectors.push(...payload.embeddings);
    }

    return vectors;
  }

  return {
    kind: 'semantic',
    url: base,
    ready,
    embedBatch,
    get dimensions() {
      return dimensions;
    },
    get stats() {
      return { backend: 'semantic', model: modelName, dimensions, url: base };
    },
  };
}
