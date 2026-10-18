import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Stripe, over the REST API.
 *
 * Deliberately dependency-free: the surface used here is three calls and one HMAC, and
 * keeping it that way means no SDK version to track and nothing extra in the image.
 *
 * Card data never reaches this server. The browser is sent to Stripe's hosted checkout
 * and comes back with a session id; the session is then read back from the API, so a
 * forged redirect cannot mark anything paid. Webhooks are signature-verified against the
 * raw request body.
 */
const API = 'https://api.stripe.com/v1';

export function stripeConfigured() {
  return Boolean(config.stripe.secretKey);
}

/** Which key is loaded, so the UI can label itself honestly. */
export function stripeMode() {
  const key = config.stripe.secretKey;

  if (key.startsWith('sk_live_')) return 'live';
  if (key.startsWith('sk_test_')) return 'test';
  return 'unknown';
}

export function currency() {
  return config.stripe.currency;
}

async function call(path, { method = 'GET', body } = {}) {
  if (!stripeConfigured()) throw new Error('Stripe is not configured on the server');

  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.stripe.secretKey}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      'User-Agent': 'nascon-crm/1.0',
    },
    body: body ? body.toString() : undefined,
    signal: AbortSignal.timeout(20000),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Stripe answered ${response.status}`);
  }

  return payload;
}

/** Stripe wants nested keys as line_items[0][price_data][currency]. */
function encode(params, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    const name = prefix ? `${prefix}[${key}]` : key;

    if (typeof value === 'object') encode(value, name, out);
    else out.append(name, String(value));
  }

  return out;
}

export async function createCheckoutSession({ plan, intentId, workspaceId, email, successUrl, cancelUrl }) {
  const body = encode({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: intentId,
    customer_email: email || undefined,
    metadata: { intentId, workspaceId, planId: plan.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency(),
          unit_amount: Math.round(plan.amountUsdt * 100),
          product_data: {
            name: `${plan.name} — ${plan.period}`,
            description: plan.summary,
          },
        },
      },
    ],
  });

  return call('/checkout/sessions', { method: 'POST', body });
}

export async function retrieveCheckoutSession(id) {
  return call(`/checkout/sessions/${encodeURIComponent(id)}`);
}

/**
 * Verify a Stripe-Signature header.
 *
 * Pure on purpose — no I/O, injectable clock — so the money-critical check is unit
 * tested rather than trusted. Returns a reason instead of throwing so the route can log
 * exactly why it refused.
 */
export function verifyWebhookSignature({
  payload,
  header,
  secret = config.stripe.webhookSecret,
  toleranceSeconds = 300,
  now = Date.now(),
}) {
  if (!secret) return { ok: false, reason: 'no webhook secret configured' };
  if (!header) return { ok: false, reason: 'missing signature header' };

  const parts = {};

  for (const piece of String(header).split(',')) {
    const index = piece.indexOf('=');

    if (index > 0) parts[piece.slice(0, index).trim()] = piece.slice(index + 1).trim();
  }

  const timestamp = Number(parts.t);
  const signature = parts.v1;

  if (!Number.isFinite(timestamp) || !signature) return { ok: false, reason: 'malformed signature header' };

  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) {
    return { ok: false, reason: 'timestamp outside the tolerance window' };
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const givenBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== givenBuffer.length) return { ok: false, reason: 'signature mismatch' };

  return timingSafeEqual(expectedBuffer, givenBuffer)
    ? { ok: true, timestamp }
    : { ok: false, reason: 'signature mismatch' };
}
