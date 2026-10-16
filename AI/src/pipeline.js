/**
 * Retrieval-augmented generation pipeline.
 *
 * Ties the store, the embedder and the generator together. Every call takes an
 * explicit list of namespaces, which is what keeps each member's vector space
 * separate — a member only ever retrieves from their own namespace plus the
 * shared campus one.
 */
import { generateAnswer, DEFAULT_SYSTEM_PROMPT } from './generate.js';
import { createVectorStore } from './vectorStore.js';

export const SHARED_NAMESPACE = 'shared:campus';

export const memberNamespace = (userId) => `user:${userId}`;

export function createRagPipeline({ store = createVectorStore(), generation } = {}) {
  const generator = generation ?? {};

  async function ingest({ namespace, sourceId, title, text, metadata }) {
    if (!namespace) throw new Error('A namespace is required');
    if (!sourceId) throw new Error('A sourceId is required');

    return store.ingest({ namespace, sourceId, title: title ?? sourceId, text, metadata });
  }

  /** Ingest many documents into one namespace. */
  async function ingestMany({ namespace, documents }) {
    const results = [];

    for (const document of documents) {
      results.push(await ingest({ namespace, ...document }));
    }

    return { namespace, documents: results.length, chunks: results.reduce((t, r) => t + r.chunks, 0) };
  }

  async function search({ userId, question, topK = 4, includeShared = true, minScore = 0.05 }) {
    const namespaces = [memberNamespace(userId), ...(includeShared ? [SHARED_NAMESPACE] : [])];

    const hits = await store.search({ namespaces, question, topK, minScore });

    return hits.map((hit) => ({
      ...hit,
      scope: hit.namespace === SHARED_NAMESPACE ? 'campus' : 'personal',
    }));
  }

  /**
   * Retrieve, then answer. `sources` is returned separately so a caller can show
   * what the answer was grounded in (or cite it in a WhatsApp reply).
   *
   * `generation` overrides the default generator settings for one call, which is
   * how the chat path asks for a smaller, faster model.
   */
  async function answer({ userId, question, topK = 4, includeShared = true, minScore = 0.05, system, generation }) {
    const retrieved = await search({ userId, question, topK, includeShared, minScore });

    const context = retrieved
      .map((hit, index) => `[${index + 1}] (${hit.sourceTitle}) ${hit.text}`)
      .join('\n\n');

    const settings = { ...generator, ...(generation ?? {}) };

    const result = await generateAnswer({
      apiKey: settings.apiKey,
      model: settings.model,
      endpoint: settings.endpoint,
      system: system ?? settings.system ?? DEFAULT_SYSTEM_PROMPT,
      question,
      context,
      maxTokens: settings.maxTokens,
      temperature: settings.temperature,
      reasoningEffort: settings.reasoningEffort,
    });

    return {
      answer: result.answer,
      model: result.model,
      retrieved: retrieved.length,
      sources: retrieved.map((hit) => ({
        title: hit.sourceTitle,
        scope: hit.scope,
        score: hit.score,
      })),
    };
  }

  return {
    ingest,
    ingestMany,
    search,
    answer,
    store,
    namespaces: () => store.listNamespaces(),
    sources: (namespace) => store.listSources(namespace),
    remove: (namespace, sourceId) => store.removeSource(namespace, sourceId),
    stats: () => store.stats,
  };
}
