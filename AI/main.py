"""
COMSATS Abbottabad — semantic embeddings and vector search service.

Run it with:

    python main.py

Then:

    GET  /health     model, dimensions and Chroma status
    POST /embed      {"texts": ["...", "..."]}  -> dense vectors
    POST /ingest     {"namespace", "sourceId", "title", "text"}
    POST /search     {"query", "namespaces": [...], "topK"}
    POST /ask        {"query", "namespaces": [...], "topK"} -> Groq answer

Embeddings come from a real sentence-transformer (ONNX via fastembed, no torch):
BAAI/bge-small-en-v1.5 by default, which is genuinely semantic — paraphrase,
synonym and cross-lingual matches work, unlike a bag-of-words vector.

Groq is the generator. Groq does not serve embedding models, so it is used for
the answer step only.
"""

from __future__ import annotations

import os
import re
from typing import Any

from flask import Flask, jsonify, request

try:  # optional, only used when the browser calls this service directly
    from flask_cors import CORS
except ImportError:  # pragma: no cover
    CORS = None

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #


def load_env_file(path: str) -> None:
    """Minimal .env reader so this service shares the backend's configuration."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())
    except OSError:
        pass


load_env_file(
    os.getenv(
        "ENV_FILE",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", ".env"),
    )
)

EMBED_MODEL = os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
EMBED_HOST = os.getenv("EMBED_HOST", "127.0.0.1")
EMBED_PORT = int(os.getenv("EMBED_PORT", "8100"))

CHROMA_HOST = os.getenv("CHROMA_HOST", "localhost")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8000"))
CHROMA_PREFIX = os.getenv("CHROMA_COLLECTION_PREFIX", "sem-")
CHROMA_TENANT = os.getenv("CHROMA_TENANT", "default_tenant")
CHROMA_DATABASE = os.getenv("CHROMA_DATABASE", "default_database")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_ENDPOINT = os.getenv("GROQ_ENDPOINT", "https://api.groq.com/openai/v1/chat/completions")

CHUNK_TARGET = int(os.getenv("RAG_CHUNK_TARGET", "900"))
CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "150"))

SYSTEM_PROMPT = (
    "You are the campus assistant for COMSATS Abbottabad. Answer the question using the "
    "retrieved context below and nothing else. If the context does not contain the answer, say "
    "so plainly and suggest contacting the administration office. Be concise: at most four short "
    "sentences, or a short list."
)

app = Flask(__name__)

if CORS is not None:
    CORS(app)


# --------------------------------------------------------------------------- #
# Embeddings
# --------------------------------------------------------------------------- #


class SemanticEmbedder:
    """Sentence-transformer embeddings via fastembed (ONNX runtime, no torch)."""

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self.kind = "semantic"
        self._model: Any = None
        self._dimensions: int | None = None
        self.error: str | None = None

    def load(self) -> bool:
        if self._model is not None:
            return True
        if self.error is not None:
            return False

        try:
            from fastembed import TextEmbedding

            self._model = TextEmbedding(model_name=self.model_name)
        except Exception as exc:  # missing package or model download failure
            self.error = str(exc)
            return False

        return True

    @property
    def dimensions(self) -> int:
        if self._dimensions is None:
            probe = list(self._model.embed(["dimension probe"]))
            self._dimensions = len(probe[0])
        return self._dimensions

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not self.load():
            raise RuntimeError(f"Embedding model unavailable: {self.error}")

        return [list(map(float, vector)) for vector in self._model.embed(texts)]


embedder = SemanticEmbedder(EMBED_MODEL)


# --------------------------------------------------------------------------- #
# Chunking
# --------------------------------------------------------------------------- #


def chunk_text(text: str, target: int = CHUNK_TARGET, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Paragraph- then sentence-aware splitting with a small overlap tail."""
    normalised = re.sub(r"[ \t]+", " ", (text or "").replace("\r\n", "\n")).strip()
    if not normalised:
        return []

    paragraphs = [p.replace("\n", " ").strip() for p in re.split(r"\n{2,}", normalised)]
    pieces: list[str] = []

    for paragraph in [p for p in paragraphs if p]:
        if len(paragraph) <= target:
            pieces.append(paragraph)
            continue

        current = ""
        for sentence in re.split(r"(?<=[.!?])\s+", paragraph):
            if current and len(current) + len(sentence) + 1 > target:
                pieces.append(current)
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        if current:
            pieces.append(current)

    merged: list[str] = []
    for piece in pieces:
        if merged and len(merged[-1]) + len(piece) + 1 <= target:
            merged[-1] = f"{merged[-1]} {piece}"
        else:
            merged.append(piece)

    if len(merged) <= 1:
        return merged

    out = [merged[0]]
    for previous, piece in zip(merged, merged[1:]):
        tail = previous[-overlap:] if overlap else ""
        out.append(f"{tail} {piece}".strip() if tail else piece)

    return out


# --------------------------------------------------------------------------- #
# Chroma
# --------------------------------------------------------------------------- #


class VectorDatabase:
    """Thin wrapper over the Chroma HTTP client — one collection per namespace."""

    def __init__(self) -> None:
        self._client: Any = None
        self._collections: dict[str, Any] = {}
        self.error: str | None = None

    def client(self) -> Any:
        if self._client is None:
            import chromadb

            self._client = chromadb.HttpClient(
                host=CHROMA_HOST,
                port=CHROMA_PORT,
                tenant=CHROMA_TENANT,
                database=CHROMA_DATABASE,
            )
        return self._client

    def healthy(self) -> bool:
        try:
            self.client().heartbeat()
            self.error = None
            return True
        except Exception as exc:
            self.error = str(exc)
            return False

    def _name_for(self, namespace: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9._-]", "-", namespace)
        return f"{CHROMA_PREFIX}{safe}"[:63].lower()

    def collection(self, namespace: str) -> Any:
        name = self._name_for(namespace)

        if name not in self._collections:
            self._collections[name] = self.client().get_or_create_collection(
                name=name,
                metadata={"namespace": namespace, "hnsw:space": "cosine"},
            )

        return self._collections[name]

    def upsert(self, namespace: str, source_id: str, title: str, text: str) -> dict:
        pieces = chunk_text(text)
        collection = self.collection(namespace)

        try:
            collection.delete(where={"sourceId": source_id})
        except Exception:
            pass

        if not pieces:
            return {"namespace": namespace, "sourceId": source_id, "chunks": 0}

        vectors = embedder.embed(pieces)

        collection.add(
            ids=[f"{source_id}::{i}" for i in range(len(pieces))],
            embeddings=vectors,
            documents=pieces,
            metadatas=[
                {"namespace": namespace, "sourceId": source_id, "title": title, "index": i}
                for i in range(len(pieces))
            ],
        )

        return {"namespace": namespace, "sourceId": source_id, "title": title, "chunks": len(pieces)}

    def query(self, namespaces: list[str], query: str, top_k: int) -> list[dict]:
        vector = embedder.embed([query])[0]
        hits: list[dict] = []

        for namespace in namespaces:
            collection = self.collection(namespace)
            result = collection.query(
                query_embeddings=[vector],
                n_results=top_k,
                include=["documents", "metadatas", "distances"],
            )

            for position, _ in enumerate(result["ids"][0]):
                distance = float(result["distances"][0][position])
                metadata = result["metadatas"][0][position] or {}

                hits.append(
                    {
                        "id": result["ids"][0][position],
                        "namespace": namespace,
                        "sourceId": metadata.get("sourceId"),
                        "title": metadata.get("title"),
                        "text": result["documents"][0][position],
                        "score": round(1.0 - distance, 4),
                    }
                )

        hits.sort(key=lambda hit: hit["score"], reverse=True)
        return hits[:top_k]


database = VectorDatabase()


# --------------------------------------------------------------------------- #
# Groq
# --------------------------------------------------------------------------- #


def groq_answer(question: str, context: str) -> dict:
    import json
    import urllib.request

    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set")

    payload = json.dumps(
        {
            "model": GROQ_MODEL,
            "temperature": 0.2,
            "max_tokens": 600,
            "messages": [
                {
                    "role": "system",
                    "content": f"{SYSTEM_PROMPT}\n\nRetrieved context:\n{context}",
                },
                {"role": "user", "content": question},
            ],
        }
    ).encode()

    request_object = urllib.request.Request(
        GROQ_ENDPOINT,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_API_KEY}",
        },
        method="POST",
    )

    with urllib.request.urlopen(request_object, timeout=90) as response:
        body = json.loads(response.read().decode())

    return {
        "answer": body["choices"][0]["message"]["content"].strip(),
        "model": body.get("model", GROQ_MODEL),
    }


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #


@app.get("/health")
def health():
    loaded = embedder.load()

    return jsonify(
        {
            "status": "ok" if loaded else "degraded",
            "embedder": {
                "kind": embedder.kind,
                "model": embedder.model_name,
                "dimensions": embedder.dimensions if loaded else None,
                "error": embedder.error,
            },
            "chroma": {
                "host": CHROMA_HOST,
                "port": CHROMA_PORT,
                "prefix": CHROMA_PREFIX,
                "healthy": database.healthy(),
                "error": database.error,
            },
            "groq": {
                "model": GROQ_MODEL,
                "configured": bool(GROQ_API_KEY),
            },
        }
    )


@app.post("/embed")
def embed():
    body = request.get_json(silent=True) or {}
    texts = body.get("texts")

    if not isinstance(texts, list) or not texts:
        return jsonify({"error": "Pass a non-empty 'texts' array"}), 400

    if len(texts) > 128:
        return jsonify({"error": "Batch at most 128 texts per call"}), 400

    try:
        vectors = embedder.embed([str(text) for text in texts])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503

    return jsonify(
        {
            "embeddings": vectors,
            "dimensions": len(vectors[0]),
            "model": embedder.model_name,
            "kind": embedder.kind,
        }
    )


@app.post("/ingest")
def ingest():
    body = request.get_json(silent=True) or {}
    namespace = str(body.get("namespace") or "").strip()
    source_id = str(body.get("sourceId") or "").strip()
    text = str(body.get("text") or "").strip()
    title = str(body.get("title") or source_id).strip()

    if not namespace or not source_id:
        return jsonify({"error": "namespace and sourceId are required"}), 400
    if len(text) < 20:
        return jsonify({"error": "Provide at least a sentence of text"}), 400

    if not database.healthy():
        return jsonify({"error": f"Chroma is unavailable: {database.error}"}), 503

    try:
        return jsonify({"document": database.upsert(namespace, source_id, title, text)}), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/search")
def search():
    body = request.get_json(silent=True) or {}
    query = str(body.get("query") or "").strip()
    namespaces = body.get("namespaces") or []
    top_k = int(body.get("topK") or 4)

    if not query:
        return jsonify({"error": "Pass a 'query'"}), 400
    if not isinstance(namespaces, list) or not namespaces:
        return jsonify({"error": "Pass a 'namespaces' array"}), 400

    if not database.healthy():
        return jsonify({"error": f"Chroma is unavailable: {database.error}"}), 503

    try:
        hits = database.query([str(item) for item in namespaces], query, top_k)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify({"query": query, "namespaces": namespaces, "hits": hits})


@app.post("/ask")
def ask():
    body = request.get_json(silent=True) or {}
    query = str(body.get("query") or "").strip()
    namespaces = body.get("namespaces") or []
    top_k = int(body.get("topK") or 4)

    if not query or not namespaces:
        return jsonify({"error": "Pass a 'query' and a 'namespaces' array"}), 400

    try:
        hits = database.query([str(item) for item in namespaces], query, top_k)
        context = "\n\n".join(
            f"[{index + 1}] ({hit['title']}) {hit['text']}" for index, hit in enumerate(hits)
        )
        result = groq_answer(query, context)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502

    return jsonify(
        {
            "answer": result["answer"],
            "model": result["model"],
            "retrieved": len(hits),
            "sources": [
                {"title": hit["title"], "namespace": hit["namespace"], "score": hit["score"]}
                for hit in hits
            ],
        }
    )


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #


def banner() -> None:
    print("=" * 72)
    print("  COMSATS Abbottabad — semantic embedding service")
    print("=" * 72)
    print(f"  listen        http://{EMBED_HOST}:{EMBED_PORT}")
    print(f"  embedder      {EMBED_MODEL} (fastembed / ONNX, no torch)")

    if embedder.load():
        print(f"                dimensions={embedder.dimensions}  kind={embedder.kind}")
    else:
        print(f"                UNAVAILABLE: {embedder.error}")
        print("                pip install fastembed")

    print(f"  chroma        http://{CHROMA_HOST}:{CHROMA_PORT}  prefix={CHROMA_PREFIX}")
    print(f"                {'reachable' if database.healthy() else 'NOT reachable'}")
    print(f"  groq          {GROQ_MODEL}  {'configured' if GROQ_API_KEY else 'NO API KEY'}")
    print("-" * 72)
    print("  POST /embed    {\"texts\": [\"...\"]}")
    print("  POST /ingest   {\"namespace\", \"sourceId\", \"title\", \"text\"}")
    print("  POST /search   {\"query\", \"namespaces\": [...], \"topK\"}")
    print("  POST /ask      {\"query\", \"namespaces\": [...]}")
    print("=" * 72)


if __name__ == "__main__":
    banner()
    app.run(host=EMBED_HOST, port=EMBED_PORT, debug=False, threaded=True)
