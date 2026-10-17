# AI — RAG pipeline

A retrieval-augmented generation pipeline. The Node side has **no npm dependencies of its own** —
the Chroma client, the generation API key and the semantic embedder are all injected — and the
embedding model itself lives in `main.py`.

```
AI/
├── main.py             Flask service: embeddings, Chroma search, Groq answers, voice
├── voice.py            VAD, Whisper STT (Groq) and TTS (edge-tts / Windows SAPI)
├── PROMPTS.md          reusable prompts, including the WhatsApp QR pairing flow
├── src/
│   ├── semanticEmbedder.js  HTTP client for main.py (bge-small, 384 dimensions)
│   ├── embedders.js    resolves semantic, else hashed
│   ├── embedder.js     hashed TF-IDF vectors + cosine — the fallback model
│   ├── chunker.js      paragraph/sentence-aware chunking with overlap
│   ├── vectorStore.js  built-in store (JSON-backed), used as the fallback
│   ├── chromaStore.js  Chroma-backed store — one collection per namespace
│   ├── store.js        picks the embedder and backend, reports which won
│   ├── pipeline.js     ingest / search / answer, with namespace isolation
│   ├── generate.js     Groq chat completion (transport only)
│   └── index.js        public surface
└── data/               Chroma data and fallback vectors (gitignored)
```

## Voice

`voice.py` is used by `main.py` for the `/voice/*` routes:

- **VAD** — energy-based on 16-bit PCM. The noise floor is the 10th-percentile frame, the gate sits
  8 dB above it (never below −38 dBFS), frames are 30 ms, and a 350 ms hangover stops short gaps
  splitting an utterance. `analyse_speech()` reports segments; `trim_to_speech()` drops silence
  before transcription.
- **STT** — Groq `whisper-large-v3-turbo` via multipart, with a campus-vocabulary prompt. ~400–650 ms.
- **TTS** — `edge-tts` neural voices (network) with Windows SAPI via System.Speech as an offline
  fallback. Text reaches PowerShell base64-encoded so quotes and unicode survive.

```bash
pip install edge-tts        # optional: better TTS; SAPI works without it
```

Groq's own TTS models are not usable on this key — one requires the org admin to accept terms, the
other is decommissioned. Hence the local engines.

Also note: Cloudflare in front of Groq returns `403` (error 1010) for Python's default `urllib`
User-Agent, so every outbound request sets `User-Agent` explicitly.

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

## Embeddings are semantic

`main.py` loads **`BAAI/bge-small-en-v1.5`** through fastembed (ONNX runtime, no torch) and serves
384-dimension unit vectors. It is genuinely semantic, which matters for retrieval:

| Pair | Score |
| --- | --- |
| "How much do I owe for tuition this semester?" vs "What is my fee amount?" | 0.731 |
| "When do admission applications close?" vs "What is the last date to apply?" | 0.833 |
| "My advisor is Dr. Sadia Khan" vs "Who supervises my studies?" | 0.654 |
| Unrelated pairs | 0.56 – 0.63 |
| Same text | 1.000 |

Because the scores sit in a 0.4 – 0.9 band rather than 0 – 1, `RAG_MIN_SCORE` is a safety net and
`RAG_TOP_K` does most of the filtering.

If the Python service is not running, `embedders.js` falls back to `embedder.js` — hashed TF-IDF
vectors over unigrams and bigrams. It needs no model, but it only matches words, not meaning. The
collection prefix follows the embedder (`sem-` vs `ns-`), so the two never share a collection.

## Running it

```bash
pip install flask flask-cors fastembed chromadb
python main.py
```

One command runs the whole Python side. `main.py` finds the `chroma` CLI wherever pip put it,
starts it as a child process on `CHROMA_PORT` (8000) if nothing is already listening, waits for its
heartbeat, and stops it again when you Ctrl+C. Chroma's output goes to `AI/data/chroma.log`, so this
console stays readable.

- `CHROMA_AUTOSTART=false` — do not manage Chroma; expect it to be running already.
- `CHROMA_DATA_DIR`, `CHROMA_PORT`, `CHROMA_HOST` — where Chroma stores data and listens.
- If Chroma is already up, `main.py` notices and leaves it alone.

```
GET  /health    embedder model, dimensions and Chroma status
POST /embed     {"texts": ["...", "..."]}                  -> dense vectors
POST /ingest    {"namespace", "sourceId", "title", "text"}
POST /search    {"query", "namespaces": [...], "topK"}
POST /ask       {"query", "namespaces": [...]}              -> Groq answer
```

The Node backend only needs `/health` and `/embed`; `/ingest`, `/search` and `/ask` make the whole
pipeline runnable and testable from Python alone.

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
