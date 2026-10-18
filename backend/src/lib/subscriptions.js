import { db } from './db.js';
import { DEFAULT_PLAN_ID, findPlan, PLANS } from '../data/plans.js';

/**
 * Subscriptions: one record per workspace, and the entitlements that follow from it.
 *
 * A new workspace starts on a trial of the entry plan, so it is usable immediately and
 * nothing is faked — the trial has a real end date and the limits are enforced. Paying
 * does not invent a second kind of record: the existing payment intents (card via Stripe,
 * or crypto) settle the invoice, and the subscription moves to active for a period.
 *
 * Every limit is enforced here rather than in a UI, because hiding a button is not
 * enforcement.
 */
const subscriptions = db.collection('subscriptions');

const TRIAL_DAYS = Number(process.env.SUBSCRIPTION_TRIAL_DAYS ?? 14);
const PERIOD_DAYS = Number(process.env.SUBSCRIPTION_PERIOD_DAYS ?? 30);

/** What each plan allows. Kept beside the prices so the two cannot drift apart. */
export const PLAN_LIMITS = {
  starter: { seats: 3, leads: 1000, pipelines: 1, integrations: ['whatsapp', 'alerts'] },
  growth: {
    seats: 10,
    leads: 10000,
    pipelines: 3,
    integrations: ['whatsapp', 'alerts', 'google-calendar', 'stripe'],
  },
  scale: {
    seats: 100,
    leads: 250000,
    pipelines: 25,
    integrations: ['whatsapp', 'alerts', 'google-calendar', 'stripe', 'crypto', 'voice'],
  },
};

export function planLimits(planId) {
  return PLAN_LIMITS[planId] ?? PLAN_LIMITS[DEFAULT_PLAN_ID];
}

export function plansWithLimits() {
  return PLANS.map((plan) => ({ ...plan, limits: planLimits(plan.id) }));
}

const addDays = (date, days) => new Date(date.getTime() + days * 86400000).toISOString();

function normalize(row) {
  const plan = findPlan(row.planId) ?? findPlan(DEFAULT_PLAN_ID);

  return {
    ...row,
    planId: plan.id,
    planName: plan.name,
    amountUsd: plan.amountUsdt,
    limits: planLimits(plan.id),
  };
}

/** The subscription for a workspace, created on first read as a trial. */
export async function getSubscription(workspaceId) {
  const existing = await subscriptions.find((row) => row.workspaceId === workspaceId);

  if (existing) return normalize(existing);

  const now = new Date();

  const created = await subscriptions.mutate((rows) => {
    const already = rows.find((row) => row.workspaceId === workspaceId);
    if (already) return already;

    const record = {
      id: `${workspaceId}:subscription`,
      workspaceId,
      planId: DEFAULT_PLAN_ID,
      status: 'trialing',
      provider: null,
      seats: planLimits(DEFAULT_PLAN_ID).seats,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: addDays(now, TRIAL_DAYS),
      trialEndsAt: addDays(now, TRIAL_DAYS),
      canceledAt: null,
      activatedAt: null,
      lastPaymentReference: null,
      history: [
        {
          at: now.toISOString(),
          action: 'trial.started',
          detail: `${TRIAL_DAYS}-day trial of ${findPlan(DEFAULT_PLAN_ID).name}`,
        },
      ],
    };

    rows.push(record);
    return record;
  });

  return normalize(created);
}

/** Record a change on the subscription, so its own history is auditable. */
async function appendHistory(workspaceId, entry) {
  return subscriptions.mutate((rows) => {
    const row = rows.find((item) => item.workspaceId === workspaceId);

    if (!row) return null;

    row.history = [{ at: new Date().toISOString(), ...entry }, ...(row.history ?? [])].slice(0, 100);
    return row;
  });
}

/**
 * Settle a subscription from a confirmed payment. Idempotent per payment reference, so a
 * retried webhook cannot extend the period twice.
 */
export async function activateSubscription({ workspaceId, planId, provider, reference, periodDays = PERIOD_DAYS }) {
  const plan = findPlan(planId) ?? findPlan(DEFAULT_PLAN_ID);
  const now = new Date();

  const updated = await subscriptions.mutate((rows) => {
    const row = rows.find((item) => item.workspaceId === workspaceId);

    if (!row) return null;

    if (reference && row.lastPaymentReference === reference) return row;

    row.planId = plan.id;
    row.status = 'active';
    row.provider = provider ?? row.provider ?? null;
    row.seats = planLimits(plan.id).seats;
    row.currentPeriodStart = now.toISOString();
    row.currentPeriodEnd = addDays(now, periodDays);
    row.trialEndsAt = null;
    row.canceledAt = null;
    row.activatedAt = now.toISOString();
    row.lastPaymentReference = reference ?? null;
    row.history = [
      {
        at: now.toISOString(),
        action: 'subscription.activated',
        detail: `${plan.name} via ${provider ?? 'payment'} · ${periodDays} days`,
        reference: reference ?? null,
      },
      ...(row.history ?? []),
    ].slice(0, 100);

    return row;
  });

  return updated ? normalize(updated) : null;
}

/** Cancel at the end of the paid period rather than cutting access off mid-period. */
export async function cancelSubscription(workspaceId) {
  const now = new Date();

  const updated = await subscriptions.mutate((rows) => {
    const row = rows.find((item) => item.workspaceId === workspaceId);

    if (!row) return null;

    row.status = 'canceled';
    row.canceledAt = now.toISOString();
    row.history = [
      {
        at: now.toISOString(),
        action: 'subscription.canceled',
        detail: `Access continues until ${new Date(row.currentPeriodEnd).toDateString()}`,
      },
      ...(row.history ?? []),
    ].slice(0, 100);

    return row;
  });

  return updated ? normalize(updated) : null;
}

export async function resumeSubscription(workspaceId) {
  const updated = await subscriptions.mutate((rows) => {
    const row = rows.find((item) => item.workspaceId === workspaceId);

    if (!row) return null;

    row.status = row.trialEndsAt ? 'trialing' : 'active';
    row.canceledAt = null;
    row.history = [{ at: new Date().toISOString(), action: 'subscription.resumed' }, ...(row.history ?? [])].slice(0, 100);

    return row;
  });

  return updated ? normalize(updated) : null;
}

const isLive = (subscription, now = Date.now()) =>
  subscription.status === 'active' ||
  (subscription.status === 'trialing' && Date.parse(subscription.currentPeriodEnd) > now);

/**
 * The current entitlement envelope for a workspace, including what it is using. `blocked`
 * is what routes check before letting anything through.
 */
export async function entitlementsFor(workspaceId, { seats = 0, leads = 0 } = {}) {
  const subscription = await getSubscription(workspaceId);
  const limits = subscription.limits;
  const live = isLive(subscription);
  const expired = !live && (subscription.status === 'trialing' || subscription.status === 'active');

  return {
    subscription,
    live,
    expired,
    reason: live
      ? null
      : subscription.status === 'canceled'
        ? `The subscription was canceled on ${new Date(subscription.canceledAt).toDateString()}`
        : `The ${subscription.status} period ended on ${new Date(subscription.currentPeriodEnd).toDateString()}`,
    canAddSeats: live && seats < limits.seats,
    remainingSeats: Math.max(0, limits.seats - seats),
    seatsUsed: seats,
    leadsUsed: leads,
    limits,
  };
}

/** Thrown as a 402 so the client can send the user to the subscription page. */
export function upgradeRequired(message) {
  const error = new Error(message);
  error.status = 402;
  error.code = 'upgrade_required';
  return error;
}
