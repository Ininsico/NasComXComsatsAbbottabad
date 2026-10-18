import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyWebhookSignature } from '../src/lib/stripe.js';

/**
 * The webhook is the only path that can mark a subscription paid without a human, so the
 * signature check is tested directly. It is pure: bytes in, verdict out.
 */

const SECRET = 'whsec_test_secret';
const NOW = Date.parse('2026-10-18T10:00:00Z');
const stamp = Math.floor(NOW / 1000);
const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });

const sign = (body, timestamp = stamp) =>
  `t=${timestamp},v1=${createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex')}`;

test('a correctly signed payload is accepted', () => {
  const result = verifyWebhookSignature({ payload, header: sign(payload), secret: SECRET, now: NOW });

  assert.equal(result.ok, true);
  assert.equal(result.timestamp, stamp);
});

test('a tampered body is rejected', () => {
  const header = sign(payload);
  const tampered = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', amount_total: 1 });

  const result = verifyWebhookSignature({ payload: tampered, header, secret: SECRET, now: NOW });

  assert.equal(result.ok, false);
  assert.match(result.reason, /signature mismatch/);
});

test('a signature made with a different secret is rejected', () => {
  const forged = `t=${stamp},v1=${createHmac('sha256', 'whsec_attacker').update(`${stamp}.${payload}`).digest('hex')}`;

  assert.equal(verifyWebhookSignature({ payload, header: forged, secret: SECRET, now: NOW }).ok, false);
});

test('a replayed signature outside the tolerance window is rejected', () => {
  const stale = stamp - 3600;

  const result = verifyWebhookSignature({
    payload,
    header: sign(payload, stale),
    secret: SECRET,
    now: NOW,
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /tolerance/);
});

test('a header without a v1 signature is rejected', () => {
  assert.equal(verifyWebhookSignature({ payload, header: `t=${stamp}`, secret: SECRET, now: NOW }).ok, false);
});

test('a missing header is rejected', () => {
  assert.equal(verifyWebhookSignature({ payload, header: null, secret: SECRET, now: NOW }).ok, false);
});

test('without a configured secret nothing is trusted', () => {
  const result = verifyWebhookSignature({ payload, header: sign(payload), secret: '', now: NOW });

  assert.equal(result.ok, false);
  assert.match(result.reason, /no webhook secret/);
});
