import { Router } from 'express';
import { config } from '../config.js';
import { DEFAULT_PLAN_ID, findPlan, PLANS } from '../data/plans.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { accountBalances, depositAddress, depositHistory } from '../lib/binance.js';
import { createIntent, listIntents, reconcilePayments } from '../lib/payments.js';

const router = Router();

const ADDRESS_TTL_MS = 10 * 60 * 1000;
let addressCache = { value: null, fetchedAt: 0 };

async function currentDepositAddress() {
  if (addressCache.value && Date.now() - addressCache.fetchedAt < ADDRESS_TTL_MS) {
    return addressCache.value;
  }

  const result = await depositAddress({
    coin: config.binance.coin,
    network: config.binance.network,
  });

  addressCache = { value: result, fetchedAt: Date.now() };
  return result;
}

router.get('/config', requireAuth, (req, res) => {
  res.json({
    configured: config.binance.configured,
    asset: config.binance.coin,
    network: config.binance.network,
    tolerancePercent: config.payments.tolerancePercent,
    pollSeconds: config.payments.pollSeconds,
  });
});

router.get('/plans', requireAuth, (req, res) => {
  res.json({
    plans: PLANS,
    defaultPlanId: DEFAULT_PLAN_ID,
    asset: config.binance.coin,
    network: config.binance.network,
    tolerancePercent: config.payments.tolerancePercent,
  });
});

router.get('/intents', requireAuth, async (req, res) => {
  const all = await listIntents();
  const visible = req.user.role === 'admin' ? all : all.filter((i) => i.userId === req.user.id);
  res.json({ intents: visible });
});

router.post('/intents', requireAuth, async (req, res) => {
  if (!config.binance.configured) {
    return res.status(503).json({ error: 'Crypto payments are not configured on the server' });
  }

  const plan = findPlan(String(req.body?.planId ?? DEFAULT_PLAN_ID));

  if (!plan) {
    return res.status(400).json({ error: 'Choose a valid subscription plan' });
  }

  let address;

  try {
    address = await currentDepositAddress();
  } catch (error) {
    return res.status(502).json({ error: `Could not load the deposit address: ${error.message}` });
  }

  if (!address?.address) {
    return res.status(502).json({ error: 'Binance did not return a deposit address' });
  }

  const intent = await createIntent({
    user: req.user,
    plan,
    asset: config.binance.coin,
    network: config.binance.network,
    address: address.address,
  });

  return res.status(201).json({ intent, addressTag: address.tag ?? null });
});

router.post('/intents/:id/check', requireAuth, async (req, res) => {
  const all = await listIntents();
  const target = all.find((intent) => intent.id === req.params.id);

  if (!target) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  if (target.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'This is not your payment' });
  }

  let result;

  try {
    result = await reconcilePayments();
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }

  const intent = result.intents.find((item) => item.id === target.id) ?? target;

  return res.json({ intent, updated: result.changed.includes(target.id) });
});

/** Admin view of the read-only wallet state. */
router.get('/wallet', requireAuth, requireRole('admin'), async (req, res) => {
  if (!config.binance.configured) {
    return res.status(503).json({ error: 'Binance is not configured' });
  }

  try {
    const [account, deposits] = await Promise.all([
      accountBalances(),
      depositHistory({ coin: config.binance.coin, limit: 20 }),
    ]);

    res.json({
      readOnly: true,
      permissions: {
        canTrade: account.canTrade,
        canWithdraw: account.canWithdraw,
        canDeposit: account.canDeposit,
      },
      balances: account.balances
        .filter((balance) => Number(balance.free) + Number(balance.locked) > 0)
        .map((balance) => ({
          asset: balance.asset,
          free: Number(balance.free),
          locked: Number(balance.locked),
          total: Number(balance.free) + Number(balance.locked),
        })),
      deposits: (Array.isArray(deposits) ? deposits : []).map((deposit) => ({
        txId: deposit.txId,
        amount: Number(deposit.amount),
        coin: deposit.coin,
        network: deposit.network,
        status: Number(deposit.status),
        insertTime: Number(deposit.insertTime),
      })),
    });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

export default router;
