import { createClient } from 'redis';

/**
 * One shared Redis connection, created lazily.
 *
 * Redis is optional. With no REDIS_URL every helper here quietly returns null / does
 * nothing, so a checkout or a deployment without Redis behaves exactly as it did
 * before. Nothing in the app connects until something actually asks for it.
 *
 * Usage from a route:
 *
 *   import { withCache } from '../lib/redis.js';
 *   const data = await withCache('dashboard:stats', 30, loadExpensiveStats);
 */
let client = null;
let connecting = null;

export function redisEnabled() {
  return Boolean(process.env.REDIS_URL);
}

export async function getRedis() {
  if (!redisEnabled()) return null;

  if (client?.isReady) return client;

  if (!connecting) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (error) => console.error(`[redis] ${error.message}`));
    client.on('reconnecting', () => console.warn('[redis] reconnecting'));

    connecting = client
      .connect()
      .then(() => client)
      .catch((error) => {
        console.error(`[redis] unavailable: ${error.message}`);
        client = null;
        connecting = null;
        return null;
      });
  }

  return connecting;
}

/** { configured, reachable } for health checks. Never throws. */
export async function redisStatus() {
  if (!redisEnabled()) {
    return { configured: false, reachable: false };
  }

  try {
    const connection = await getRedis();
    if (!connection) return { configured: true, reachable: false };

    await connection.ping();

    return { configured: true, reachable: true };
  } catch (error) {
    return { configured: true, reachable: false, error: error.message };
  }
}

export async function cacheGet(key) {
  const connection = await getRedis();
  if (!connection) return null;

  try {
    const raw = await connection.get(key);

    return raw === null ? null : JSON.parse(raw);
  } catch (error) {
    console.error(`[redis] get ${key} failed: ${error.message}`);
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 60) {
  const connection = await getRedis();
  if (!connection) return false;

  try {
    await connection.set(key, JSON.stringify(value), { EX: Math.max(1, Math.round(ttlSeconds)) });

    return true;
  } catch (error) {
    console.error(`[redis] set ${key} failed: ${error.message}`);
    return false;
  }
}

export async function cacheDel(key) {
  const connection = await getRedis();
  if (!connection) return false;

  try {
    await connection.del(key);

    return true;
  } catch (error) {
    console.error(`[redis] del ${key} failed: ${error.message}`);
    return false;
  }
}

/**
 * Return the cached value, or run `loader`, cache its result and return that.
 * A cache problem must never break the request, so every failure path calls the loader.
 */
export async function withCache(key, ttlSeconds, loader) {
  const cached = await cacheGet(key);

  if (cached !== null && cached !== undefined) {
    return { value: cached, cached: true };
  }

  const value = await loader();
  await cacheSet(key, value, ttlSeconds);

  return { value, cached: false };
}

/** Close on shutdown so a container restart does not leave the socket hanging. */
export async function closeRedis() {
  if (client?.isOpen) {
    await client.quit().catch(() => {});
  }

  client = null;
  connecting = null;
}
