import { Router } from 'express';
import { config } from '../config.js';
import { DEFAULT_PLAN_ID, findPlan } from '../data/plans.js';
import { requireAuth } from '../lib/auth.js';
import { depositAddress } from '../lib/binance.js';
import { requirePermission, workspaceContext } from '../lib/context.js';
import { listLeads } from '../lib/leads.js';
import { listMembers } from '../lib/members.js';
import { createIntent, findIntent, listIntents, markIntentPaid, reconcilePayments } from '../lib/payments.js';
import { createCheckoutSession, currency, retrieveCheckoutSession, stripeConfigured, stripeMode } from '../lib/stripe.js';
import {
  activateSubscription,
  cancelSubscription,
  entitlementsFor,
  getSubscription,
  plansWithLimits,
  resumeSubscription,
} from '../lib/subscriptions.js';

const router = Router();

router.use(requireAuth, workspaceContext);

async function usageFor(workspaceId) {
  const [members, leads] = await Promise.all([listMembers(workspaceId), listLeads(workspaceId)]);

  return { seats: members.length, leads: leads.length };
}

/** The whole billing state of a workspace in one read. */
router.get('/', async (req, res) => {
  const workspaceId = req.workspace.id;
  const usage = await usageFor(workspaceId);

  const [entitlements, intents] = await Promise.all([
    entitlementsFor(workspaceId, usage),
    listIntents(),
  ]);

  const open = intents.find(
    (intent) => intent.workspaceId === workspaceId && intent.status === 'awaiting_payment',
  );

  res.json({
    workspace: { id: workspaceId, name: req.workspace.name },
    ...entitlements,
    usage,
    plans: plansWithLimits(),
    providers: [
      {
        id: 'stripe',
        label: 'Card',
        available: stripeConfigured(),
        mode: stripeMode(),
        asset: currency().toUpperCase(),
      },
      {
        id: 'crypto',
        label: `Crypto (${config.binance.coin})`,
        available: config.binance.configured,
        asset: config.binance.coin,
        network: config.binance.network,
      },
    ],
    openIntent: open ?? null,
    invoices: intents
      .filter((intent) => intent.workspaceId === workspaceId)
      .slice(0, 25)
      .map((intent) => ({
        id: intent.id,
        reference: intent.reference,
        planName: intent.planName,
        provider: intent.provider,
        amount: intent.matchedTotal || intent.expectedAmount,
        asset: intent.asset,
        status: intent.status,
        createdAt: intent.createdAt,
        confirmedAt: intent.confirmedAt,
        paymentReference: intent.paymentReference,
      })),
  });
});

/**
 * Start a paid period. The money still goes through the payment intents — this route only
 * decides what happens once it lands.
 */
router.post('/checkout', requirePermission('integrations.manage'), async (req, res) => {
  const workspaceId = req.workspace.id;
  const provider = String(req.body?.provider ?? 'stripe').toLowerCase();
  const plan = findPlan(String(req.body?.planId ?? DEFAULT_PLAN_ID));

  if (!plan) return res.status(400).json({ error: 'Choose a valid plan' });
  if (!['stripe', 'crypto'].includes(provider)) {
    return res.status(400).json({ error: 'Choose either card (stripe) or crypto' });
  }

  const existing = await listIntents();
  const open = existing.find(
    (intent) => intent.workspaceId === workspaceId && intent.status === 'awaiting_payment',
  );

  if (open) {
    return res.status(409).json({
      error: 'This workspace already has a payment waiting',
      intent: open,
    });
  }

  if (provider === 'stripe') {
    if (!stripeConfigured()) return res.status(503).json({ error: 'Card payments are not configured' });

    const intent = await createIntent({
      user: req.user,
      plan,
      provider: 'stripe',
      asset: currency(),
      workspaceId,
    });

    const origin = (process.env.PUBLIC_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');

    let session;

    try {
      session = await createCheckoutSession({
        plan,
        intentId: intent.id,
        workspaceId,
        email: req.user.email,
        successUrl: `${origin}/subscription?checkout=success`,
        cancelUrl: `${origin}/subscription?checkout=cancelled`,
      });
    } catch (error) {
      return res.status(502).json({ error: `Stripe could not open a checkout session: ${error.message}` });
    }

    const { setIntentCheckout } = await import('../lib/payments.js');
    await setIntentCheckout(intent.id, { sessionId: session.id, url: session.url });

    return res.status(201).json({ checkoutUrl: session.url, intentId: intent.id });
  }

  if (!config.binance.configured) return res.status(503).json({ error: 'Crypto payments are not configured' });

  let address;

  try {
    address = await depositAddress({ coin: config.binance.coin, network: config.binance.network });
  } catch (error) {
    return res.status(502).json({ error: `Could not load the deposit address: ${error.message}` });
  }

  const intent = await createIntent({
    user: req.user,
    plan,
    provider: 'crypto',
    asset: config.binance.coin,
    network: config.binance.network,
    address: address.address,
    workspaceId,
  });

  return res.status(201).json({ intent });
});

/**
 * Confirm the open payment and, if it landed, start the period. Reads the truth from
 * Stripe or from deposit history — never from the request body.
 */
router.post('/confirm', requirePermission('integrations.manage'), async (req, res) => {
  const workspaceId = req.workspace.id;
  const intentId = String(req.body?.intentId ?? '');

  const target = intentId
    ? await findIntent(intentId)
    : (await listIntents()).find(
        (intent) => intent.workspaceId === workspaceId && intent.status === 'awaiting_payment',
      );

  if (!target || target.workspaceId !== workspaceId) {
    return res.status(404).json({ error: 'No payment is waiting for this workspace' });
  }

  if (target.provider === 'stripe') {
    if (!target.checkoutSessionId) {
      return res.status(409).json({ error: 'That payment has no Stripe session' });
    }

    let session;

    try {
      session = await retrieveCheckoutSession(target.checkoutSessionId);
    } catch (error) {
      return res.status(502).json({ error: `Stripe could not be reached: ${error.message}` });
    }

    if (session.payment_status !== 'paid') {
      return res.json({
        settled: false,
        intent: {
          ...target,
          statusMessage: `Stripe reports ${session.status} / ${session.payment_status}. Nothing charged yet.`,
        },
      });
    }

    const paid = (session.amount_total ?? 0) / 100;

    await markIntentPaid({
      id: target.id,
      reference: session.payment_intent ?? session.id,
      amount: paid,
      note: `Card payment of ${paid.toFixed(2)} ${String(session.currency ?? currency()).toUpperCase()} confirmed by Stripe.`,
    });

    const subscription = await activateSubscription({
      workspaceId,
      planId: target.planId,
      provider: 'stripe',
      reference: session.payment_intent ?? session.id,
    });

    return res.json({ settled: true, subscription });
  }

  const result = await reconcilePayments();
  const updated = result.intents.find((intent) => intent.id === target.id) ?? target;

  if (updated.status !== 'confirmed' && updated.status !== 'overpaid') {
    return res.json({ settled: false, intent: updated });
  }

  const subscription = await activateSubscription({
    workspaceId,
    planId: updated.planId,
    provider: 'crypto',
    reference: updated.consumedTxIds?.[0] ?? updated.reference,
  });

  return res.json({ settled: true, intent: updated, subscription });
});

router.post('/cancel', requirePermission('integrations.manage'), async (req, res) => {
  const subscription = await cancelSubscription(req.workspace.id);
  res.json({ subscription });
});

router.post('/resume', requirePermission('integrations.manage'), async (req, res) => {
  const subscription = await resumeSubscription(req.workspace.id);
  res.json({ subscription });
});

/** Kept so the integrations page can show the plan without the full billing payload. */
router.get('/plan', async (req, res) => {
  res.json({ subscription: await getSubscription(req.workspace.id) });
});

export default router;
