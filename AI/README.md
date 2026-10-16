# AI — RAG pipeline

A self-contained retrieval-augmented generation pipeline. It has **no npm
dependencies of its own**: the embedding model is implemented here, and anything
external (the Chroma client, the generation API key) is injected by the caller.

```
AI/
├── src/
│   ├── embedder.js     deterministic hashed TF-IDF vectors + cosine similarity
│   ├── chunker.js      paragraph/sentence-aware chunking with overlap
│   ├── vectorStore.js  built-in store (JSON-backed), used as the fallback
│   ├── chromaStore.js  Chroma-backed store — one collection per namespace
│   ├── store.js        picks Chroma when reachable, else the built-in store
│   ├── pipeline.js     ingest / search / answer, with namespace isolation
│   ├── generate.js     Groq chat completion (transport only)
│   └── index.js        public surface
└── data/               vector data + persisted embedder state (gitignored)
```

## Vector spaces are isolated per member

Every document is tagged with a namespace and every search is restricted to the
namespaces it names:

| Namespace       | Holds                                    | Who sees it        |
| --------------- | ---------------------------------------- | ------------------ |
| `shared:campus` | published programmes, faculty, policies   | every member       |
| `user:<id>`     | one member's own documents                | that member only   |
| `wa:<number>`   | an unrecognised WhatsApp sender's uploads | that sender only   |

With Chroma each namespace is its own **collection** (`ns-shared-campus`,
`ns-user-<id>`), so isolation is enforced by the database rather than by
filtering. A member's query can only reach their own collection plus the shared
one, which is asserted in the pipeline test.

## Embeddings

`embedder.js` projects text into a fixed 512-dimension space with the hashing
trick over unigrams and bigrams, weighted by sublinear TF and IDF and
L2-normalised, so cosine similarity is meaningful. The IDF table is persisted
next to the vector data, so query vectors are weighted identically across
restarts.

It is deliberately swappable: `createEmbedder()` exposes `fit`/`embed`, so a
neural model (for example MiniLM via `@huggingface/transformers`) can replace it
without touching the stores or the pipeline. Chroma can also be pointed at its
own server-side embedding function if you prefer.

## Usage

```js
import { createRagPipeline, createAdaptiveStore, memberNamespace } from '../AI/src/index.js';
import { ChromaClient } from 'chromadb';

const store = createAdaptiveStore({
  chromaUrl: 'http://localhost:8000',
  ChromaClient,              // injected: this package has no dependencies
  onFallback: (error) => console.warn('falling back:', error.message),
});

const pipeline = createRagPipeline({
  store,
  generation: { apiKey: process.env.GROQ_API_KEY, model: 'openai/gpt-oss-120b' },
});

await pipeline.ingest({
  namespace: memberNamespace(userId),
  sourceId: 'fee-letter',
  title: 'Fee letter',
  text: '...',
});

const { answer, sources } = await pipeline.answer({ userId, question: 'What do I owe?' });
```

## Running the Chroma server

```bash
pip install chromadb
chroma run --path ./AI/data/chroma --port 8000
```

If Chroma is unreachable the adaptive store falls back to the built-in one and
reports why, so the pipeline never hard-fails.
