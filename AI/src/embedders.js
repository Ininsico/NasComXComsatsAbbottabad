import { createEmbedder as createHashedCore, DEFAULT_DIMENSIONS } from './embedder.js';
import { createSemanticEmbedder, DEFAULT_SEMANTIC_URL } from './semanticEmbedder.js';

export { DEFAULT_SEMANTIC_URL, createSemanticEmbedder };

/**
 * The hashed embedder behind the same async, dense interface as the semantic
 * one, so stores never need to know which is in use. It is the fallback for
 * when the Python embedding service is not running.
 */
export function createHashedEmbedder({ dimensions = DEFAULT_DIMENSIONS } = {}) {
  const core = createHashedCore({ dimensions });

  return {
    kind: 'hashed',
    dimensions,

    async ready() {
      return { model: 'hashed-tfidf', dimensions };
    },

    async embedBatch(texts) {
      return texts.map((text) => {
        const tokens = core.tokenize(text);
        core.fit(tokens);

        const dense = new Array(dimensions).fill(0);

        for (const [index, weight] of core.embed(tokens)) {
          dense[index] = weight;
        }

        return dense;
      });
    },

    get stats() {
      return { backend: 'hashed', dimensions, model: 'hashed-tfidf' };
    },
  };
}

/**
 * Prefers the semantic service; falls back to hashed vectors so retrieval keeps
 * working when Python is not running. Callers surface which one won.
 */
export async function resolveEmbedder({
  semanticUrl = DEFAULT_SEMANTIC_URL,
  preferSemantic = true,
  onFallback,
} = {}) {
  if (preferSemantic && semanticUrl) {
    const semantic = createSemanticEmbedder({ url: semanticUrl });

    try {
      await semantic.ready();
      return semantic;
    } catch (error) {
      onFallback?.(error);
    }
  }

  return createHashedEmbedder();
}
