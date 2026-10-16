import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { CREDITED_STATUSES, PAYMENT_WINDOW_MINUTES } from '../data/plans.js';
import { depositHistory } from './binance.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', 'data');
const dbFile = join(dataDir, 'payments.json');

let writeQueue = Promise.resolve();

const round = (value, digits = 8) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

async function readAll() {
  try {
    const raw = await readFile(dbFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAll(intents) {
  await mkdir(dataDir, { recursive: true });
  const tmpFile = join(dataDir, `.payments.${randomUUID()}.tmp`);
  await writeFile(tmpFile, `${JSON.stringify(intents, null, 2)}\n`, 'utf8');
  await rename(tmpFile, dbFile);
}

function withLock(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function listIntents() {
  const intents = await readAll();
  return [...intents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findIntent(id) {
  const intents = await readAll();
  return intents.find((intent) => intent.id === id) ?? null;
}

export async function createIntent({ user, plan, asset, network, address }) {
  return withLock(async () => {
    const intents = await readAll();
    const tolerancePercent = config.payments.tolerancePercent;
    const createdAt = new Date();

    const intent = {
      id: randomUUID(),
      reference: `CMX-${createdAt.getTime().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      planId: plan.id,
      planName: plan.name,
      planPeriod: plan.period,
      expectedAmount: plan.amountUsdt,
      tolerancePercent,
      minAmount: round(plan.amountUsdt * (1 - tolerancePercent / 100), 2),
      maxAmount: round(plan.amountUsdt * (1 + tolerancePercent / 100), 2),
      asset,
      network,
      address,
      status: 'awaiting_payment',
      statusMessage: 'Send the exact amount to the address below. This page checks for it automatically.',
      matchedTotal: 0,
      consumedTxIds: [],
      attemptCount: 0,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + PAYMENT_WINDOW_MINUTES * 60000).toISOString(),
      checkedAt: null,
      confirmedAt: null,
    };

    intents.push(intent);
    await writeAll(intents);
    return intent;
  });
}

/**
 * Pure matching core — no I/O, so the money rules can be tested directly.
 *
 * Deposits are credited oldest-intent-first, and a transaction can only ever be
 * claimed once across all intents, so two subscriptions cannot share one deposit.
 */
export function reconcileIntents({ intents, deposits, now = Date.now() }) {
  const usedTxIds = new Set();

  for (const intent of intents) {
    for (const txId of intent.consumedTxIds ?? []) usedTxIds.add(txId);
  }

  const working = intents.map((intent) => ({ ...intent }));
  const changed = [];

  const credit = (deposit) =>
    CREDITED_STATUSES.has(Number(deposit.status)) &&
    Number(deposit.amount) > 0 &&
    !usedTxIds.has(deposit.txId);

  const oldestFirst = [...working].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const intent of oldestFirst) {
    if (intent.status === 'confirmed' || intent.status === 'overpaid') continue;

    intent.attemptCount = (intent.attemptCount ?? 0) + 1;
    intent.checkedAt = new Date(now).toISOString();

    const windowStart = new Date(intent.createdAt).getTime() - 60000;
    const candidates = deposits
      .filter(
        (deposit) =>
          credit(deposit) && new Date(deposit.insertTime ?? deposit.time).getTime() >= windowStart,
      )
      .sort(
        (a, b) => Number(a.insertTime ?? a.time) - Number(b.insertTime ?? b.time),
      );

    // Claim deposits until this subscription is covered, so one subscription
    // cannot swallow deposits that belong to the next one.
    const claimed = [];
    let total = 0;

    for (const candidate of candidates) {
      if (total >= intent.expectedAmount) break;
      claimed.push(candidate);
      total += Number(candidate.amount);
    }

    if (total >= intent.minAmount) {
      intent.status = total > intent.maxAmount ? 'overpaid' : 'confirmed';
      intent.matchedTotal = round(total);
      intent.consumedTxIds = claimed.map((deposit) => deposit.txId);
      intent.confirmedAt = new Date(now).toISOString();
      intent.statusMessage =
        total > intent.maxAmount
          ? `Received ${round(total)} ${intent.asset} — more than expected. Contact the finance office to reconcile the difference.`
          : `Payment of ${round(total)} ${intent.asset} confirmed. Your subscription is active.`;

      for (const deposit of claimed) usedTxIds.add(deposit.txId);
      changed.push(intent.id);
      continue;
    }

    if (total > 0) {
      intent.status = 'mismatch';
      intent.matchedTotal = round(total);
      intent.statusMessage = `Received ${round(total)} ${intent.asset}, which is below the ${intent.minAmount} ${intent.asset} minimum. Send the remaining ${round(intent.expectedAmount - total)} ${intent.asset} to complete it.`;
      changed.push(intent.id);
      continue;
    }

    if (new Date(intent.expiresAt).getTime() < now) {
      intent.status = 'expired';
      intent.statusMessage = 'This payment window closed before the deposit arrived. Start a new payment.';
      changed.push(intent.id);
    }
  }

  return { intents: working, changed };
}

/** Fetch live deposits and settle whatever can be settled. */
export async function reconcilePayments({ deposits, now } = {}) {
  const intents = await listIntents();
  const open = intents.filter(
    (intent) => intent.status !== 'confirmed' && intent.status !== 'overpaid',
  );

  let depositList = deposits;

  if (!depositList) {
    if (!config.binance.configured || open.length === 0) {
      return { changed: [], intents };
    }

    const earliest = Math.min(...open.map((intent) => new Date(intent.createdAt).getTime()));
    depositList = await depositHistory({ coin: config.binance.coin, startTime: earliest });
  }

  const { intents: updated, changed } = reconcileIntents({ intents, deposits: depositList, now });

  if (changed.length > 0) {
    await withLock(() => writeAll(updated));
  }

  return { changed, intents: updated };
}
