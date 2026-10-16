import { config } from '../config.js';
import { CREDITED_STATUSES } from '../data/plans.js';
import {
  accountBalances,
  depositHistory,
  earnFlexiblePositions,
  earnLockedPositions,
  fundingWallet,
  futuresBalance,
  marginAccount,
  tickerPrices,
} from './binance.js';
import { listIntents } from './payments.js';

const STABLECOINS = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI', 'TUSD']);

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Every wallet this key can hold funds in. Each reader yields plain
 * `{ asset, free, locked }` rows; a reader that fails is reported as unreadable
 * rather than being silently counted as zero.
 */
function walletReaders(spotAccount) {
  return [
    {
      id: 'spot',
      label: 'Spot',
      read: async () => {
        if (!spotAccount) throw new Error('Spot balances could not be read');
        return spotAccount.balances.map((balance) => ({
          asset: balance.asset,
          free: Number(balance.free),
          locked: Number(balance.locked),
        }));
      },
    },
    {
      id: 'funding',
      label: 'Funding',
      read: async () =>
        (await fundingWallet()).map((asset) => ({
          asset: asset.asset,
          free:
            Number(asset.free ?? 0) + Number(asset.freeze ?? 0) + Number(asset.withdrawing ?? 0),
          locked: Number(asset.locked ?? 0),
        })),
    },
    {
      id: 'margin',
      label: 'Cross Margin',
      read: async () =>
        (await marginAccount()).userAssets.map((asset) => ({
          // netAsset is free + locked − borrowed − interest, so debt lowers the total.
          asset: asset.asset,
          free: Number(asset.netAsset ?? 0),
          locked: 0,
        })),
    },
    {
      id: 'futures',
      label: 'USDT-M Futures',
      read: async () =>
        (await futuresBalance()).map((balance) => ({
          asset: balance.asset,
          free: Number(balance.balance ?? 0),
          locked: 0,
        })),
    },
    {
      id: 'earn',
      label: 'Simple Earn',
      read: async () => {
        const [flexible, locked] = await Promise.all([
          earnFlexiblePositions().catch(() => ({ rows: [] })),
          earnLockedPositions().catch(() => ({ rows: [] })),
        ]);

        return [...(flexible?.rows ?? []), ...(locked?.rows ?? [])].map((position) => ({
          asset: position.asset,
          free: Number(position.totalAmount ?? position.amount ?? 0),
          locked: 0,
        }));
      },
    },
  ];
}

/** Total value of the subscription side of the ledger. */
export async function subscriptionTotals() {
  const intents = await listIntents();
  const settled = intents.filter(
    (intent) => intent.status === 'confirmed' || intent.status === 'overpaid',
  );

  return {
    revenue: round(settled.reduce((total, intent) => total + Number(intent.matchedTotal ?? 0), 0)),
    settledCount: settled.length,
    pendingCount: intents.filter((intent) => intent.status === 'awaiting_payment').length,
    mismatchedCount: intents.filter((intent) => intent.status === 'mismatch').length,
    intents: intents.map((intent) => ({
      reference: intent.reference,
      planName: intent.planName,
      userEmail: intent.userEmail,
      expectedAmount: intent.expectedAmount,
      matchedTotal: intent.matchedTotal ?? 0,
      asset: intent.asset,
      status: intent.status,
      createdAt: intent.createdAt,
    })),
  };
}

/**
 * Whole-account portfolio: every wallet Binance exposes for this key, marked to
 * market in USDT. Never throws — unreadable wallets are listed with the reason.
 */
export async function loadPortfolio() {
  const subscriptions = await subscriptionTotals();

  if (!config.binance.configured) {
    return { available: false, reason: 'Binance is not configured', subscriptions };
  }

  const [spotAccount, prices] = await Promise.all([
    accountBalances().catch(() => null),
    tickerPrices().catch(() => []),
  ]);

  const priceBySymbol = new Map(
    (Array.isArray(prices) ? prices : []).map((entry) => [entry.symbol, Number(entry.price)]),
  );

  const priceFor = (asset) => {
    if (STABLECOINS.has(asset)) return 1;
    const price = priceBySymbol.get(`${asset}USDT`);
    return Number.isFinite(price) ? price : null;
  };

  const readers = walletReaders(spotAccount);
  const settled = await Promise.allSettled(readers.map((wallet) => wallet.read()));

  const wallets = [];
  const holdings = [];
  const unreadable = [];
  const byWallet = {};

  settled.forEach((outcome, index) => {
    const wallet = readers[index];

    if (outcome.status === 'rejected') {
      const reason = outcome.reason?.message ?? 'Could not be read';
      wallets.push({ id: wallet.id, label: wallet.label, status: 'error', error: reason, value: 0, count: 0 });
      unreadable.push({ id: wallet.id, label: wallet.label, error: reason });
      return;
    }

    const rows = (outcome.value ?? []).filter((row) => Number(row.free) + Number(row.locked) !== 0);
    let value = 0;

    for (const row of rows) {
      const total = Number(row.free) + Number(row.locked);
      const price = priceFor(row.asset);
      const rowValue = price === null ? null : round(total * price);

      if (rowValue !== null) value += rowValue;

      holdings.push({
        asset: row.asset,
        wallet: wallet.id,
        walletLabel: wallet.label,
        free: round(row.free, 8),
        locked: round(row.locked, 8),
        total: round(total, 8),
        price,
        value: rowValue,
      });
    }

    byWallet[wallet.id] = round(value);
    wallets.push({
      id: wallet.id,
      label: wallet.label,
      status: 'ok',
      value: round(value),
      count: rows.length,
    });
  });

  holdings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const deposits = await depositHistory({ coin: config.binance.coin, limit: 100 }).catch(() => []);
  const depositList = (Array.isArray(deposits) ? deposits : []).filter((deposit) =>
    CREDITED_STATUSES.has(Number(deposit.status)),
  );

  return {
    available: true,
    scope: 'global',
    generatedAt: new Date().toISOString(),
    asset: config.binance.coin,
    network: config.binance.network,
    permissions: spotAccount
      ? {
          canTrade: spotAccount.canTrade,
          canWithdraw: spotAccount.canWithdraw,
          canDeposit: spotAccount.canDeposit,
        }
      : null,
    totals: {
      totalValue: round(Object.values(byWallet).reduce((total, value) => total + value, 0)),
      byWallet,
      depositsReceived: round(
        depositList.reduce((total, deposit) => total + Number(deposit.amount), 0),
      ),
      subscriptionRevenue: subscriptions.revenue,
    },
    wallets,
    unreadable,
    holdings,
    unpriced: [...new Set(holdings.filter((h) => h.value === null).map((h) => h.asset))],
    depositCount: depositList.length,
    deposits: depositList.slice(0, 10).map((deposit) => ({
      txId: deposit.txId,
      amount: Number(deposit.amount),
      coin: deposit.coin,
      network: deposit.network,
      insertTime: Number(deposit.insertTime),
    })),
    subscriptions,
  };
}
