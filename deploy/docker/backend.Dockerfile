# Express API: auth, profiles, documents, payments, WhatsApp bridge.
FROM node:20-slim AS deps

WORKDIR /app

# WhatsApp runs through puppeteer, which would otherwise download a ~150 MB Chromium
# at install time. WhatsApp is disabled in containers by default, so skip it and keep
# the image small. To enable it, install chromium and set WHATSAPP_CHROME_PATH.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev


FROM node:20-slim

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# Chromium is what the WhatsApp bridge drives. Installing it from the distribution
# rather than letting puppeteer download a build keeps the image reproducible and
# means WHATSAPP_CHROME_PATH can simply point at /usr/bin/chromium.
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./

# The API imports the RAG modules as '../../../AI/src/index.js', which resolves to
# /AI inside the container. Those modules import only node: builtins — the Chroma
# client is injected — so they need no node_modules of their own.
COPY AI/ /AI/

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
