import { Router } from 'express';
import { config } from '../config.js';
import { DEFAULT_PLAN_ID, findPlan, PLANS } from '../data/plans.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { accountBalances, depositAddress, depositHistory } from '../lib/binance.js';
import { workspaceContext } from '../lib/context.js';
import {
  createIntent,
  findIntent,
  findIntentByReference,
  listIntents,
  markIntentPaid,
  markIntentStatus,
  reconcilePayments,
  setIntentCheckout,
} from '../lib/payments.js';
import {
  createCheckoutSession,
  currency,
  retrieveCheckoutSession,
  stripeConfigured,
  stripeMode,
  verifyWebhookSignature,
} from '../lib/stripe.js';

const router = Router();

const ADDRESS_TTL_MS = 10 * 60 * 1000;
let addressCache = { value: null, fetchedAt: 0 };

/** Where Stripe sends the browser back to. The SPA reads the query string. */
function siteOrigin() {
  return (process.env.PUBLIC_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');
}

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

/**
 * The payment options this deployment can actually take right now. The UI offers only
 * these, so a workspace is never shown a provider the server cannot process.
 */
function availableProviders() {
  return [
    {
      id: 'stripe',
      label: 'Card',
      detail: stripeConfigured()
        ? `Visa, Mastercard and Amex via Stripe (${stripeMode()} mode). Card details never touch this server.`
        : 'Stripe is not configured on the server.',
      available: stripeConfigured(),
      asset: currency().toUpperCase(),
      mode: stripeMode(),
      instant: true,
    },
    {
      id: 'crypto',
      label: `Crypto (${config.binance.coin})`,
      detail: config.binance.configured
        ? `Send ${config.binance.coin} on ${config.binance.network}; the deposit is matched automatically.`
        : 'Binance is not configured on the server.',
      available: config.binance.configured,
      asset: config.binance.coin,
      network: config.binance.network,
      instant: false,
    },
  ];
}

router.get('/config', requireAuth, (req, res) => {
  res.json({
    configured: config.binance.configured || stripeConfigured(),
    asset: config.binance.coin,
    network: config.binance.network,
    tolerancePercent: config.payments.tolerancePercent,
    pollSeconds: config.payments.pollSeconds,
    stripe: { configured: stripeConfigured(), mode: stripeMode(), currency: currency() },
  });
});

/** Plans plus which providers can settle them. */
router.get('/providers', requireAuth, (req, res) => {
  res.json({
    plans: PLANS,
    defaultPlanId: DEFAULT_PLAN_ID,
    providers: availableProviders(),
    tolerancePercent: config.payments.tolerancePercent,
  });
});

router.get('/plans', requireAuth, (req, res) => {
  res.json({
    plans: PLANS,
    defaultPlanId: DEFAULT_PLAN_ID,
    providers: availableProviders(),
    asset: config.binance.coin,
    network: config.binance.network,
    tolerancePercent: config.payments.tolerancePercent,
  });
});

router.get('/intents', requireAuth, async (req, res) => {
  const all = await listIntents();
  const visible = req.user.role === 'admin' ? all : all.filter((intent) => intent.userId === req.user.id);
  res.json({ intents: visible });
});

router.post('/intents', requireAuth, workspaceContext, async (req, res) => {
  const provider = String(req.body?.provider ?? 'crypto').toLowerCase();
  const plan = findPlan(String(req.body?.planId ?? DEFAULT_PLAN_ID));

  if (!plan) {
    return res.status(400).json({ error: 'Choose a valid subscription plan' });
  }

  if (!['stripe', 'crypto'].includes(provider)) {
    return res.status(400).json({ error: 'Choose either card (stripe) or crypto' });
  }

  if (provider === 'stripe') {
    if (!stripeConfigured()) {
      return res.status(503).json({ error: 'Card payments are not configured on the server' });
    }

    const intent = await createIntent({
      user: req.user,
      plan,
      provider: 'stripe',
      asset: currency(),
    });

    let session;

    try {
      session = await createCheckoutSession({
        plan,
        intentId: intent.id,
        workspaceId: req.workspace?.id ?? null,
        email: req.user.email,
        // No {CHECKOUT_SESSION_ID} token: the session id is already stored on the intent,
        // so the return trip has nothing to tamper with.
        successUrl: `${siteOrigin()}/payments?checkout=success`,
        cancelUrl: `${siteOrigin()}/payments?checkout=cancelled`,
      });
    } catch (error) {
      return res.status(502).json({ error: `Stripe could not open a checkout session: ${error.message}` });
    }

    const saved = await setIntentCheckout(intent.id, { sessionId: session.id, url: session.url });

    return res.status(201).json({ intent: saved, checkoutUrl: session.url });
  }

  if (!config.binance.configured) {
    return res.status(503).json({ error: 'Crypto payments are not configured on the server' });
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
    provider: 'crypto',
    asset: config.binance.coin,
    network: config.binance.network,
    address: address.address,
  });

  return res.status(201).json({ intent, addressTag: address.tag ?? null });
});

/**
 * Settle one intent. Crypto asks Binance what arrived; a card session is read back from
 * Stripe, so the browser cannot mark anything paid by editing the URL.
 */
router.post('/intents/:id/check', requireAuth, async (req, res) => {
  const target = await findIntent(req.params.id);

  if (!target) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  if (target.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'This is not your payment' });
  }

  if (target.provider === 'stripe' && target.checkoutSessionId) {
    let session;

    try {
      session = await retrieveCheckoutSession(target.checkoutSessionId);
    } catch (error) {
      return res.status(502).json({ error: `Stripe could not be reached: ${error.message}` });
    }

    if (session.payment_status === 'paid') {
      const paid = (session.amount_total ?? 0) / 100;
      const intent = await markIntentPaid({
        id: target.id,
        reference: session.payment_intent ?? session.id,
        amount: paid,
        note: `Card payment of ${paid.toFixed(2)} ${String(session.currency ?? currency()).toUpperCase()} confirmed by Stripe. Your ${target.planName} subscription is active.`,
      });

      return res.json({ intent, updated: true });
    }

    return res.json({
      intent: {
        ...target,
        statusMessage: `Stripe reports this session as ${session.status} / ${session.payment_status}. Nothing has been charged yet.`,
      },
      updated: false,
    });
  }

  if (target.provider === 'stripe' && !target.checkoutSessionId) {
    return res.status(409).json({ error: 'This payment has no Stripe session. Start a new one.' });
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

/**
 * Stripe webhook. Mounted with a raw body parser ahead of the JSON middleware, because
 * the signature covers the exact bytes Stripe sent — a re-serialised body would never
 * verify. Without a configured webhook secret this refuses rather than trusting.
 */
export async function stripeWebhookHandler(req, res) {
  const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const check = verifyWebhookSignature({ payload, header: req.get('stripe-signature') });

  if (!check.ok) {
    console.warn(`[stripe] webhook rejected: ${check.reason}`);
    return res.status(400).json({ error: `Invalid signature: ${check.reason}` });
  }

  let event;

  try {
    event = JSON.parse(payload);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  try {
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object ?? {};
      const intentId = session.metadata?.intentId ?? session.client_reference_id;
      const paid = (session.amount_total ?? 0) / 100;

      if (intentId) {
        await markIntentPaid({
          id: intentId,
          reference: session.payment_intent ?? session.id,
          amount: paid,
          note: `Card payment of ${paid.toFixed(2)} ${String(session.currency ?? currency()).toUpperCase()} confirmed by Stripe.`,
        });
      }
    }

    // The failure and reversal statuses the spec asks to show: a checkout the customer
    // abandoned, a card that was declined, and a refund made in the Stripe dashboard.
    if (event.type === 'checkout.session.expired') {
      const session = event.data.object ?? {};
      const intentId = session.metadata?.intentId ?? session.client_reference_id;

      if (intentId) {
        await markIntentStatus({
          id: intentId,
          status: 'abandoned',
          note: 'The checkout session expired before it was paid.',
        });
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object ?? {};
      const intentId = paymentIntent.metadata?.intentId;
      const target = intentId
        ? await findIntent(intentId)
        : await findIntentByReference(paymentIntent.id);

      if (target) {
        await markIntentStatus({
          id: target.id,
          status: 'failed',
          note:
            paymentIntent.last_payment_error?.message ??
            'Stripe reported the card payment as failed.',
          reference: paymentIntent.id,
        });
      }
    }

    if (event.type === 'charge.refunded' || event.type === 'charge.refund.updated') {
      const charge = event.data.object ?? {};
      const target = await findIntentByReference(charge.payment_intent ?? charge.id);

      if (target && target.status !== 'refunded') {
        const refunded = (charge.amount_refunded ?? charge.amount ?? 0) / 100;

        await markIntentStatus({
          id: target.id,
          status: 'refunded',
          note: `Refunded ${refunded.toFixed(2)} ${String(charge.currency ?? currency()).toUpperCase()} by Stripe. This payment no longer counts as collected revenue.`,
          reference: charge.payment_intent ?? charge.id,
        });
      }
    }

    return res.json({ received: true, type: event.type });
  } catch (error) {
    console.error('[stripe] webhook failed', error);
    return res.status(500).json({ error: error.message });
  }
}

export default router;
