import { config } from '../config.js';
import { CREDITED_STATUSES } from '../data/plans.js';
import { accountBalances, depositHistory, tickerPrices } from './binance.js';
import { listIntents } from './payments.js';

const STABLECOINS = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI', 'TUSD']);

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

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
 * The whole portfolio: wallet holdings valued in USDT, everything ever deposited,
 * and what the subscriptions have brought in. Never throws — the admin console
 * shows an unavailable state instead of failing outright.
 */
export async function loadPortfolio() {
  const subscriptions = await subscriptionTotals();

  if (!config.binance.configured) {
    return { available: false, reason: 'Binance is not configured', subscriptions };
  }

  try {
    const [account, deposits, prices] = await Promise.all([
      accountBalances(),
      depositHistory({ coin: config.binance.coin, limit: 100 }),
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

    const holdings = account.balances
      .map((balance) => {
        const free = Number(balance.free);
        const locked = Number(balance.locked);
        const total = free + locked;
        const price = priceFor(balance.asset);

        return {
          asset: balance.asset,
          free,
          locked,
          total,
          price,
          value: price === null ? null : round(total * price),
        };
      })
      .filter((holding) => holding.total > 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const depositList = (Array.isArray(deposits) ? deposits : []).filter((deposit) =>
      CREDITED_STATUSES.has(Number(deposit.status)),
    );

    const walletValue = holdings.reduce((total, holding) => total + (holding.value ?? 0), 0);
    const depositsReceived = depositList.reduce(
      (total, deposit) => total + Number(deposit.amount),
      0,
    );

    return {
      available: true,
      generatedAt: new Date().toISOString(),
      asset: config.binance.coin,
      network: config.binance.network,
      permissions: {
        canTrade: account.canTrade,
        canWithdraw: account.canWithdraw,
        canDeposit: account.canDeposit,
      },
      totals: {
        walletValue: round(walletValue),
        depositsReceived: round(depositsReceived),
        subscriptionRevenue: subscriptions.revenue,
        portfolioValue: round(walletValue),
      },
      holdings,
      unpriced: holdings.filter((holding) => holding.value === null).map((holding) => holding.asset),
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
  } catch (error) {
    return { available: false, reason: error.message, subscriptions };
  }
}
