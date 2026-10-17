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

import atexit
import base64
import os
import re
import shutil
import site
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request

import audio_queue as audio_queue_layer
import voice as voice_layer

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

# This service owns the vector database too: `python main.py` starts Chroma as a
# child process when it is not already listening, and stops it on exit.
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CHROMA_DATA_DIR = Path(os.getenv("CHROMA_DATA_DIR", DATA_DIR / "chroma"))
CHROMA_LOG = DATA_DIR / "chroma.log"
CHROMA_AUTOSTART = os.getenv("CHROMA_AUTOSTART", "true").lower() not in ("0", "false", "no")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_ENDPOINT = os.getenv("GROQ_ENDPOINT", "https://api.groq.com/openai/v1/chat/completions")

CHUNK_TARGET = int(os.getenv("RAG_CHUNK_TARGET", "900"))
CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "150"))

# Audio turns are serialised through RabbitMQ: one job in flight at a time, so two
# uploads can never be transcribed or spoken over each other.
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "")
RABBITMQ_QUEUE = os.getenv("RABBITMQ_AUDIO_QUEUE", "voice.audio")
RABBITMQ_JOB_TIMEOUT = int(os.getenv("RABBITMQ_JOB_TIMEOUT", "180"))

audio_queue = audio_queue_layer.AudioQueue(
    RABBITMQ_URL,
    queue_name=RABBITMQ_QUEUE,
    job_timeout=RABBITMQ_JOB_TIMEOUT,
)

# Belt and braces: even with no broker, two turns still cannot run together.
TURN_LOCK = threading.Lock()

SYSTEM_PROMPT = (
    "You are the friendly assistant for COMSATS Abbottabad, replying in a chat. "
    "Keep replies short: one to three sentences, or a short list. Plain text only.\n\n"
    "Campus notes may be provided below. If they answer the question, answer from them and stay "
    "faithful to them. If they are unrelated, ignore them completely. If the question is not about "
    "the campus at all — general knowledge, arithmetic, definitions, small talk — answer it normally "
    "and helpfully from your own knowledge.\n\n"
    "Never reply that you cannot answer, and never tell someone to contact an office unless the "
    "question is specifically about campus business and no note covers it. Even then, share what you "
    "do know first."
)

# Spoken replies are read aloud, so they must be short and free of markup.
VOICE_SYSTEM_PROMPT = (
    "You are the voice assistant for COMSATS Abbottabad. Your reply will be spoken aloud by a "
    "text-to-speech engine, so write one or two plain sentences — no lists, no markdown, no "
    "headings, no emoji, no URLs.\n\n"
    "If the campus notes answer the question, answer from them. If they are unrelated, ignore them. "
    "For anything that is not campus business, answer normally from your own knowledge. Never say "
    "you cannot answer."
)

app = Flask(__name__)

if CORS is not None:
    CORS(app)

# Print immediately whether the output is a terminal, a pipe or a log file.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(line_buffering=True)
    except Exception:
        pass


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


def groq_answer(question: str, context: str, system: str | None = None) -> dict:
    import json
    import urllib.request

    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set")

    payload = json.dumps(
        {
            "model": GROQ_MODEL,
            "temperature": 0.3,
            "max_tokens": 400,
            "messages": [
                {
                    "role": "system",
                    "content": f"{system or SYSTEM_PROMPT}\n\nCampus notes (possibly relevant — ignore them if they are not):\n{context}"
                    if context
                    else f"{system or SYSTEM_PROMPT}\n\nNo campus notes matched this question, so answer it from your own knowledge.",
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
            # Cloudflare 1010 blocks urllib's default User-Agent.
            "User-Agent": "comsats-ai/1.0 (+local)",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request_object, timeout=90) as response:
            body = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        detail = error.read()[:300].decode(errors="ignore")
        raise RuntimeError(f"Groq rejected the request ({error.code}): {detail}") from error

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


# --------------------------------------------------------------------------- #
# Voice
# --------------------------------------------------------------------------- #


def _voice_namespaces() -> list[str]:
    raw = request.form.get("namespaces") or ""
    items = [part.strip() for part in raw.split(",") if part.strip()]
    user_id = (request.form.get("user_id") or "").strip()

    if user_id:
        personal = f"user:{user_id}"
        if personal not in items:
            items.insert(0, personal)

    if "shared:campus" not in items:
        items.append("shared:campus")

    return items


def _read_upload():
    uploaded = request.files.get("audio")

    if uploaded is None:
        return None, (jsonify({"error": "Attach the recording as form field 'audio'"}), 400)

    data = uploaded.read()

    if len(data) < 800:
        return None, (jsonify({"error": "That recording is too short to use"}), 400)

    return data, None


def _prepare_audio(raw: bytes):
    """Trim silence with the VAD when the upload is WAV.

    Returns (audio_for_stt, vad_report, elapsed_ms). Browsers that send webm/ogg
    skip the VAD but are still transcribed — Whisper decodes them directly.
    """
    started = time.time()

    try:
        samples, rate, _ = voice_layer.read_wav(raw)
        samples, rate = voice_layer.resample_to_target(samples, rate)
        analysis = voice_layer.analyse_speech(samples, rate)
        trimmed = voice_layer.trim_to_speech(samples, rate, analysis)
        prepared = voice_layer.write_wav(trimmed, rate)

        vad = {
            "segments": len(analysis["segments"]),
            "speech_seconds": analysis["speech_seconds"],
            "noise_db": analysis["noise_db"],
            "threshold_db": analysis["threshold_db"],
            "trimmed_seconds": round(len(trimmed) / rate, 2),
        }
    except ValueError:
        prepared = raw
        vad = {"segments": 0, "note": "not 16-bit WAV; server-side VAD skipped"}

    return prepared, vad, round((time.time() - started) * 1000)


@app.get("/voice/health")
def voice_health():
    return jsonify(
        {
            "stt": {
                "provider": "groq-whisper",
                "model": voice_layer.STT_MODEL,
                "configured": bool(voice_layer.groq_api_key()),
            },
            "tts": voice_layer.tts_engine_status(),
            "vad": {
                "frame_ms": voice_layer.VAD_FRAME_MS,
                "min_speech_ms": voice_layer.VAD_MIN_SPEECH_MS,
                "hangover_ms": voice_layer.VAD_HANGOVER_MS,
                "threshold_db": voice_layer.VAD_THRESHOLD_DB,
            },
            "target_sample_rate": voice_layer.TARGET_SAMPLE_RATE,
            "queue": audio_queue.stats(),
        }
    )


@app.post("/voice/stt")
def voice_stt():
    raw, error = _read_upload()
    if error:
        return error

    prepared, vad, vad_ms = _prepare_audio(raw)

    try:
        result = voice_layer.transcribe(prepared)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502

    return jsonify({**result, "vad": vad, "vad_ms": vad_ms})


@app.post("/voice/tts")
def voice_tts():
    body = request.get_json(silent=True) or {}
    text = str(body.get("text") or "").strip()

    if not text:
        return jsonify({"error": "Pass some 'text' to speak"}), 400

    try:
        audio, mime, engine = voice_layer.synthesize(
            text,
            voice=body.get("voice"),
            prefer=body.get("engine"),
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503

    return Response(
        audio,
        mimetype=mime,
        headers={"X-TTS-Engine": engine, "Cache-Control": "no-store"},
    )


def run_voice_turn(raw: bytes, user_id: str, namespaces: list[str]) -> tuple[dict, int]:
    """VAD -> STT -> RAG -> answer -> speech. Returns (payload, status).

    Deliberately free of Flask request objects so the queue worker can call it.
    """
    if not GROQ_API_KEY:
        return {"error": "GROQ_API_KEY is not set"}, 503

    timings: dict[str, Any] = {}

    prepared, vad, vad_ms = _prepare_audio(raw)
    timings["vad_ms"] = vad_ms

    started = time.time()

    try:
        stt = voice_layer.transcribe(prepared)
    except Exception as exc:
        return {"error": f"Speech recognition failed: {exc}"}, 502

    timings["stt_ms"] = round((time.time() - started) * 1000)
    transcript = stt["text"]

    if len(transcript) < 2:
        return {"error": "I did not catch any speech in that recording", "vad": vad}, 422

    started = time.time()

    try:
        hits = database.query(namespaces, transcript, 3)
        context = "\n\n".join(
            f"[{index + 1}] ({hit['title']}) {hit['text']}" for index, hit in enumerate(hits)
        )
        result = groq_answer(transcript, context, system=VOICE_SYSTEM_PROMPT)
    except Exception as exc:
        return {"error": f"Answering failed: {exc}"}, 502

    timings["llm_ms"] = round((time.time() - started) * 1000)
    answer = result["answer"]

    started = time.time()
    encoded = None
    mime = None
    engine = None

    try:
        audio, mime, engine = voice_layer.synthesize(answer)
        encoded = base64.b64encode(audio).decode("ascii")
    except Exception as exc:
        timings["tts_error"] = str(exc)

    timings["tts_ms"] = round((time.time() - started) * 1000)

    return (
        {
            "transcript": transcript,
            "answer": answer,
            "model": result["model"],
            "sources": [
                {"title": hit["title"], "namespace": hit["namespace"], "score": hit["score"]}
                for hit in hits
            ],
            "audio": encoded,
            "audio_mime": mime,
            "tts_engine": engine,
            "vad": vad,
            "timings": timings,
        },
        200,
    )


def queued_voice_job(job: dict) -> tuple[dict, int]:
    """Worker side: turn one queue message back into a finished voice turn."""
    try:
        raw = base64.b64decode(job.get("audio") or "")
    except Exception as exc:
        return {"error": f"the queued audio could not be decoded: {exc}"}, 400

    namespaces = job.get("namespaces") or ["shared:campus"]

    return run_voice_turn(raw, job.get("user_id") or "", namespaces)


@app.post("/voice/chat")
def voice_chat():
    """One conversational turn, serialised through RabbitMQ when configured."""
    raw, error = _read_upload()
    if error:
        return error

    namespaces = _voice_namespaces()
    user_id = (request.form.get("user_id") or "").strip()

    if audio_queue.enabled:
        try:
            envelope = audio_queue.submit(
                {
                    "audio": base64.b64encode(raw).decode("ascii"),
                    "user_id": user_id,
                    "namespaces": namespaces,
                    "submitted_at": time.time(),
                }
            )

            payload = envelope.get("payload") or {"error": "the queue returned nothing"}
            status = int(envelope.get("status") or 200)
            payload["queued"] = True
            payload["queue"] = audio_queue.queue_name

            return jsonify(payload), status
        except Exception as exc:
            # Keeping the assistant usable matters more than insisting on the
            # broker, so a failure here falls through to inline processing.
            print(f"  queue         submit failed, running inline instead: {exc}")

    with TURN_LOCK:
        payload, status = run_voice_turn(raw, user_id, namespaces)

    payload["queued"] = False

    return jsonify(payload), status


@app.get("/voice/queue")
def voice_queue():
    """Queue depth, worker state and job counters."""
    return jsonify({"stats": audio_queue.stats(), "broker": audio_queue.ping()})


# --------------------------------------------------------------------------- #
# Chroma process management
# --------------------------------------------------------------------------- #

_chroma_process: "subprocess.Popen[bytes] | None" = None


def chroma_heartbeat(timeout: float = 1.5) -> bool:
    """True when something is already serving the Chroma HTTP API."""
    try:
        url = f"http://{CHROMA_HOST}:{CHROMA_PORT}/api/v2/heartbeat"
        with urllib.request.urlopen(url, timeout=timeout):
            return True
    except Exception:
        return False


def find_chroma_binary() -> str | None:
    """Locate the `chroma` console script, wherever pip put it."""
    found = shutil.which("chroma")
    if found:
        return found

    exe_name = "chroma.exe" if os.name == "nt" else "chroma"
    candidates: list[Path] = [
        Path(sys.executable).parent / "Scripts" / exe_name,
        Path(sys.executable).parent / exe_name,
    ]

    try:
        userbase = Path(site.getuserbase())
        candidates.append(
            userbase / f"Python{sys.version_info.major}{sys.version_info.minor}" / "Scripts" / exe_name
        )
        candidates.append(userbase / "Scripts" / exe_name)

        for candidate in candidates:
            if candidate.exists():
                return str(candidate)

        # pip installed it under a user site directory with a version we did not guess
        for hit in sorted(userbase.glob(f"Python*/Scripts/{exe_name}")):
            return str(hit)
    except Exception:
        pass

    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    return None


def ensure_chroma() -> bool:
    """Start Chroma if it is not already listening. Returns True when we own it."""
    global _chroma_process

    if chroma_heartbeat():
        return False

    if not CHROMA_AUTOSTART:
        return False

    binary = find_chroma_binary()

    if binary is None:
        print("  chroma        not running, and the `chroma` command was not found")
        print("                pip install chromadb")
        return False

    CHROMA_DATA_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    log = open(CHROMA_LOG, "ab", buffering=0)
    command = [binary, "run", "--path", str(CHROMA_DATA_DIR), "--port", str(CHROMA_PORT)]

    try:
        _chroma_process = subprocess.Popen(  # noqa: S603 - fixed argv, no shell
            command,
            stdout=log,
            stderr=subprocess.STDOUT,
            cwd=str(BASE_DIR),
        )
    except OSError as exc:
        print(f"  chroma        could not start: {exc}")
        return False

    print(f"  chroma        starting {binary}")
    print(f"                log: {CHROMA_LOG}")

    deadline = time.time() + 60

    while time.time() < deadline:
        if chroma_heartbeat():
            return True

        if _chroma_process.poll() is not None:
            print("  chroma        exited during startup — see the log above")
            _chroma_process = None
            return False

        time.sleep(1)

    print("  chroma        timed out waiting for it to answer")
    return False


def stop_chroma() -> None:
    """Stop Chroma only if this process started it."""
    global _chroma_process

    if _chroma_process is None or _chroma_process.poll() is not None:
        _chroma_process = None
        return

    print("  stopping chroma...")
    _chroma_process.terminate()

    try:
        _chroma_process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        _chroma_process.kill()

    _chroma_process = None


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #


def safe_amqp_url(url: str) -> str:
    """Broker URLs carry a password — never print it."""
    return re.sub(r"://([^:/@]+):[^@]*@", r"://\1:***@", url or "")


def banner(started_chroma: bool, embedder_ready: bool, queue_started: bool) -> None:
    print("=" * 72)
    print("  COMSATS Abbottabad — AI service (embeddings + vectors + voice)")
    print("=" * 72)

    if embedder_ready:
        print(f"  embedder      {embedder.model_name}")
        print(f"                {embedder.dimensions} dimensions · kind={embedder.kind}")
    else:
        print(f"  embedder      UNAVAILABLE: {embedder.error}")
        print("                pip install fastembed")

    print(f"  chroma        http://{CHROMA_HOST}:{CHROMA_PORT}  prefix={CHROMA_PREFIX}")
    print(f"                {'reachable' if database.healthy() else 'NOT reachable'}")
    print(f"                {'started by this process' if started_chroma else 'already running'}")

    print(f"  groq          {GROQ_MODEL}  {'configured' if GROQ_API_KEY else 'NO API KEY'}")

    if queue_started:
        print(f"  queue         {audio_queue.queue_name} · prefetch=1 (one turn at a time)")
        print(f"                {safe_amqp_url(audio_queue.url)}")
    else:
        print(f"  queue         disabled ({audio_queue.reason}) — turns serialised by an in-process lock")

    print(f"  listen        http://{EMBED_HOST}:{EMBED_PORT}")
    print("-" * 72)
    print("  POST /embed        {\"texts\": [\"...\"]}")
    print("  POST /ingest       {\"namespace\", \"sourceId\", \"title\", \"text\"}")
    print("  POST /search       {\"query\", \"namespaces\": [...], \"topK\"}")
    print("  POST /ask          {\"query\", \"namespaces\": [...]}")
    print("  POST /voice/stt    multipart audio")
    print("  POST /voice/tts    {\"text\"} -> audio bytes")
    print("  POST /voice/chat   multipart audio -> transcript, answer and spoken reply")
    print("  GET  /voice/health engines, VAD settings and queue state")
    print("  GET  /voice/queue  queue depth and job counters")
    print("=" * 72)
    print("  Ctrl+C stops this service, the Chroma process and the queue worker.")
    print("=" * 72)


if __name__ == "__main__":
    atexit.register(stop_chroma)
    atexit.register(audio_queue.stop)

    started_chroma = ensure_chroma()
    embedder_ready = embedder.load()
    queue_started = audio_queue.start(queued_voice_job)

    banner(started_chroma, embedder_ready, queue_started)

    try:
        app.run(host=EMBED_HOST, port=EMBED_PORT, debug=False, threaded=True)
    except KeyboardInterrupt:
        pass
    finally:
        stop_chroma()
