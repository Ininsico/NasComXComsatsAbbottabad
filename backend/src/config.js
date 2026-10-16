import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = join(here, '..');

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value, fallback) => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
};

const stripSlash = (value) => value.replace(/\/+$/, '');

const binanceBaseUrl = stripSlash(process.env.BINANCE_BASE_URL ?? 'https://api.binance.com');

/** Futures live on a different host (fapi instead of api), derived unless overridden. */
const binanceFuturesUrl = stripSlash(
  process.env.BINANCE_FUTURES_URL ?? binanceBaseUrl.replace('//api.', '//fapi.'),
);

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
    folder: process.env.CLOUDINARY_FOLDER ?? 'comsats-abbottabad',
    maxUploadBytes: 8 * 1024 * 1024,
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY ?? '',
    model: process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b',
    fastModel: process.env.GROQ_FAST_MODEL ?? process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b',
    // gpt-oss models reason before answering; "low" removes most of that latency.
    reasoningEffort: process.env.GROQ_REASONING_EFFORT ?? 'low',
    maxTokens: toInt(process.env.GROQ_MAX_TOKENS, 320),
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  },
  binance: {
    baseUrl: binanceBaseUrl,
    futuresUrl: binanceFuturesUrl,
    apiKey: process.env.BINANCE_API_KEY ?? '',
    apiSecret: process.env.BINANCE_API_SECRET ?? '',
    coin: process.env.BINANCE_DEPOSIT_COIN ?? 'USDT',
    network: process.env.BINANCE_DEPOSIT_NETWORK ?? 'TRX',
  },
  payments: {
    tolerancePercent: Number(process.env.PAYMENT_TOLERANCE_PERCENT ?? 10),
    pollSeconds: Number(process.env.PAYMENT_POLL_SECONDS ?? 30),
  },
  rag: {
    topK: toInt(process.env.RAG_TOP_K, 4),
    minScore: toFloat(process.env.RAG_MIN_SCORE, 0.05),
    chromaUrl: process.env.CHROMA_URL ?? 'http://localhost:8000',
    useChroma: toBool(process.env.RAG_USE_CHROMA, true),
    embeddingsUrl: process.env.EMBEDDINGS_URL ?? 'http://127.0.0.1:8100',
    useSemantic: toBool(process.env.RAG_USE_SEMANTIC, true),
    dataDir: process.env.RAG_DATA_DIR ?? '',
  },
  whatsapp: {
    enabled: toBool(process.env.WHATSAPP_ENABLED, false),
    sessionPath: process.env.WHATSAPP_SESSION_PATH ?? join(backendDir, 'data', 'whatsapp-session'),
    chromePath: process.env.WHATSAPP_CHROME_PATH ?? '',
    replyToGroups: toBool(process.env.WHATSAPP_REPLY_TO_GROUPS, false),
    allowUnknown: toBool(process.env.WHATSAPP_ALLOW_UNKNOWN, true),
  },
};

config.cloudinary.configured = Boolean(
  config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret,
);

config.groq.configured = Boolean(config.groq.apiKey);

/** Binance is used read-only, so both halves of the key pair are required. */
config.binance.configured = Boolean(config.binance.apiKey && config.binance.apiSecret);

if (config.env === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production');
}
