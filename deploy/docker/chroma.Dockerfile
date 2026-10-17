# Chroma vector database, pinned to the version the backend's `chromadb` 3.5 client
# is built against. Built from the same base image as the AI service so there is no
# ambiguity about which server the client is talking to.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    ANONYMIZED_TELEMETRY=FALSE

RUN pip install --no-cache-dir "chromadb==1.5.9"

RUN mkdir -p /data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v2/heartbeat', timeout=4).status == 200 else 1)"

CMD ["chroma", "run", "--path", "/data", "--host", "0.0.0.0", "--port", "8000"]
