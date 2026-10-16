import 'dotenv/config';

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
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
