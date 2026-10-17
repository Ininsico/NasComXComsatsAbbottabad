# Python AI service: semantic embeddings, vector search, voice, audio queue worker.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # keep the downloaded embedding model on the mounted volume
    FASTEMBED_CACHE_PATH=/app/data/models

WORKDIR /app

# libgomp1 is required by onnxruntime, which fastembed uses for inference.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY AI/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY AI/ ./

RUN mkdir -p /app/data/audio-queue /app/data/chroma

EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8100/health || exit 1

# Exactly one process. The single consumer inside it, with prefetch_count=1, is what
# guarantees one audio turn is processed at a time — scaling this service would break
# that guarantee, so it is deliberately not replicated.
CMD ["python", "main.py"]
