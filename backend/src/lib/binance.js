/**
 * Binance READ-ONLY client.
 *
 * Every call here is a signed GET against a read endpoint (balances, deposit
 * history, deposit address). There is deliberately no generic request helper,
 * so nothing in this module can reach an order, transfer or withdrawal route.
 */
import { createHmac } from 'node:crypto';
import { config } from '../config.js';

function sign(query) {
  return createHmac('sha256', config.binance.apiSecret).update(query).digest('hex');
}

async function signedGet(path, params = {}) {
  if (!config.binance.configured) {
    throw new Error('Binance is not configured');
  }

  const query = new URLSearchParams({
    ...params,
    recvWindow: '5000',
    timestamp: String(Date.now()),
  }).toString();

  const url = `${config.binance.baseUrl}${path}?${query}&signature=${sign(query)}`;

  let response;

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'X-MBX-APIKEY': config.binance.apiKey },
    });
  } catch {
    throw new Error('Binance is unreachable from this server');
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.msg ?? `Binance replied with status ${response.status}`);
    error.binanceCode = payload?.code ?? null;
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  return payload;
}

/** Read-only: server time — connectivity and clock sanity check. */
export async function serverTime() {
  const response = await fetch(`${config.binance.baseUrl}/api/v3/time`);
  if (!response.ok) throw new Error(`Binance time check failed with ${response.status}`);
  return response.json();
}

/** Read-only: spot wallet balances, including the key's own permissions. */
export function accountBalances() {
  return signedGet('/api/v3/account');
}

/**
 * Read-only: the Funding wallet, which is where crypto deposits actually land.
 * Binance only exposes this one as a POST, so it is signed and sent as a form
 * body. It is still a read — there is no order, transfer or withdrawal path here.
 */
export async function fundingWallet() {
  if (!config.binance.configured) {
    throw new Error('Binance is not configured');
  }

  const query = new URLSearchParams({
    recvWindow: '5000',
    timestamp: String(Date.now()),
  }).toString();

  let response;

  try {
    response = await fetch(`${config.binance.baseUrl}/sapi/v3/asset/getUserAsset`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': config.binance.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${query}&signature=${sign(query)}`,
    });
  } catch {
    throw new Error('Binance is unreachable from this server');
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.msg ?? `Binance replied with status ${response.status}`);
    error.binanceCode = payload?.code ?? null;
    throw error;
  }

  return payload;
}

/** Read-only: deposit history for one coin. */
export function depositHistory({ coin, startTime, limit = 100 } = {}) {
  const params = { limit: String(limit) };

  if (coin) params.coin = coin;
  if (startTime) params.startTime = String(Math.max(0, startTime - 60000));

  return signedGet('/sapi/v1/capital/deposit/hisrec', params);
}

/** Read-only: the deposit address for a coin/network pair. */
export function depositAddress({ coin, network }) {
  return signedGet('/sapi/v1/capital/deposit/address', { coin, network });
}

/** Read-only public price feed, used to value the portfolio in USDT. */
export async function tickerPrices() {
  const response = await fetch(`${config.binance.baseUrl}/api/v3/ticker/price`);

  if (!response.ok) {
    throw new Error(`Binance price feed replied with status ${response.status}`);
  }

  return response.json();
}
