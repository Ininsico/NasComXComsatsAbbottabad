import assert from 'node:assert/strict';
import test from 'node:test';
import { CREDITED_STATUSES } from '../src/data/plans.js';
import { reconcileIntents } from '../src/lib/payments.js';

/**
 * The subscription matcher is the one piece of this system that touches money, so it is
 * tested directly. reconcileIntents is pure: deposits go in, decisions come out, no I/O.
 */

const NOW = Date.parse('2026-10-17T12:00:00Z');

function intent(overrides = {}) {
  return {
    id: 'intent-1',
    status: 'pending',
    createdAt: new Date(NOW - 5 * 60 * 1000).toISOString(),
    expiresAt: new Date(NOW + 30 * 60 * 1000).toISOString(),
    // A 25 USDT plan with the configured ±10% band.
    expectedAmount: 25,
    minAmount: 22.5,
    maxAmount: 27.5,
    asset: 'USDT',
    attemptCount: 0,
    ...overrides,
  };
}

function deposit(overrides = {}) {
  return {
    txId: 'tx-1',
    amount: '25',
    status: 1,
    insertTime: NOW - 60 * 1000,
    ...overrides,
  };
}

test('an exact payment confirms the subscription', () => {
  const { intents, changed } = reconcileIntents({
    intents: [intent()],
    deposits: [deposit()],
    now: NOW,
  });

  assert.equal(intents[0].status, 'confirmed');
  assert.equal(intents[0].matchedTotal, 25);
  assert.deepEqual(intents[0].consumedTxIds, ['tx-1']);
  assert.equal(intents[0].attemptCount, 1);
  assert.deepEqual(changed, ['intent-1']);
});

test('a payment at the top of the tolerance band is confirmed, not overpaid', () => {
  const { intents } = reconcileIntents({
    intents: [intent()],
    deposits: [deposit({ amount: '27.5' })],
    now: NOW,
  });

  assert.equal(intents[0].status, 'confirmed');
});

test('a payment above the band is accepted but flagged as overpaid', () => {
  const { intents } = reconcileIntents({
    intents: [intent()],
    deposits: [deposit({ amount: '30' })],
    now: NOW,
  });

  assert.equal(intents[0].status, 'overpaid');
  assert.equal(intents[0].matchedTotal, 30);
  assert.match(intents[0].statusMessage, /more than expected/i);
});

test('a payment below the band is left pending with the shortfall stated', () => {
  const { intents } = reconcileIntents({
    intents: [intent()],
    deposits: [deposit({ amount: '20' })],
    now: NOW,
  });

  assert.equal(intents[0].status, 'mismatch');
  assert.equal(intents[0].matchedTotal, 20);
  assert.match(intents[0].statusMessage, /remaining 5 USDT/);
});

test('no deposit leaves the intent pending and records the attempt', () => {
  const { intents, changed } = reconcileIntents({
    intents: [intent()],
    deposits: [],
    now: NOW,
  });

  assert.equal(intents[0].status, 'pending');
  assert.equal(intents[0].attemptCount, 1);
  assert.deepEqual(changed, []);
});

test('an intent whose window closed expires', () => {
  const { intents } = reconcileIntents({
    intents: [intent({ expiresAt: new Date(NOW - 1000).toISOString() })],
    deposits: [],
    now: NOW,
  });

  assert.equal(intents[0].status, 'expired');
});

test('one deposit cannot settle two subscriptions', () => {
  const { intents } = reconcileIntents({
    intents: [intent({ id: 'a' }), intent({ id: 'b', createdAt: new Date(NOW - 4 * 60 * 1000).toISOString() })],
    deposits: [deposit()],
    now: NOW,
  });

  const confirmed = intents.filter((entry) => entry.status !== 'pending');

  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].id, 'a');
});

test('two deposits settle two subscriptions without one swallowing both', () => {
  // The regression this was written for: the first intent used to claim every matching
  // deposit, leaving the second subscription unpaid.
  const { intents } = reconcileIntents({
    intents: [
      intent({ id: 'a' }),
      intent({ id: 'b', createdAt: new Date(NOW - 4 * 60 * 1000).toISOString() }),
    ],
    deposits: [
      deposit({ txId: 'first', insertTime: NOW - 3 * 60 * 1000 }),
      deposit({ txId: 'second', insertTime: NOW - 2 * 60 * 1000 }),
    ],
    now: NOW,
  });

  const byId = Object.fromEntries(intents.map((entry) => [entry.id, entry]));

  assert.equal(byId.a.status, 'confirmed');
  assert.equal(byId.b.status, 'confirmed');
  assert.deepEqual(byId.a.consumedTxIds, ['first']);
  assert.deepEqual(byId.b.consumedTxIds, ['second']);
});

test('a transaction already consumed is never credited twice', () => {
  const { intents } = reconcileIntents({
    intents: [intent({ consumedTxIds: ['tx-1'] })],
    deposits: [deposit()],
    now: NOW,
  });

  assert.equal(intents[0].status, 'pending');
});

test('deposits that did not land are ignored', () => {
  const pendingStatus = [...CREDITED_STATUSES].includes(0) ? null : 0;

  assert.notEqual(pendingStatus, null, 'the fixture assumes 0 is not a credited status');

  const { intents } = reconcileIntents({
    intents: [intent()],
    deposits: [deposit({ status: pendingStatus })],
    now: NOW,
  });

  assert.equal(intents[0].status, 'pending');
});

test('a zero-amount deposit is ignored', () => {
  const { intents } = reconcileIntents({
    intents: [intent()],
    deposits: [deposit({ amount: '0' })],
    now: NOW,
  });

  assert.equal(intents[0].status, 'pending');
});

test('a deposit made before the window opened is ignored', () => {
  const { intents } = reconcileIntents({
    intents: [intent()],
    deposits: [deposit({ insertTime: NOW - 60 * 60 * 1000 })],
    now: NOW,
  });

  assert.equal(intents[0].status, 'pending');
});

test('an already settled intent is not touched again', () => {
  const { intents, changed } = reconcileIntents({
    intents: [intent({ status: 'confirmed', consumedTxIds: ['tx-1'], attemptCount: 3 })],
    deposits: [deposit()],
    now: NOW,
  });

  assert.equal(intents[0].attemptCount, 3);
  assert.deepEqual(changed, []);
});
