/**
 * Subscription plans for the CRM.
 *
 * Priced in USD. A card payment charges that figure directly; a crypto payment expects
 * the same number in USDT, which is how the deposit matcher compares what arrived
 * against what was expected.
 */
export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    amountUsdt: 19,
    period: 'per month',
    summary: 'One pipeline, three seats, round-robin assignment.',
    features: ['One pipeline, three seats', 'Round-robin assignment', 'Lead activity trail'],
  },
  {
    id: 'growth',
    name: 'Growth',
    amountUsdt: 49,
    period: 'per month',
    summary: 'Escalation ladders, alert channels and the audit log.',
    features: [
      'Everything in Starter',
      'Acknowledgement and escalation ladder',
      'Slack, Telegram and webhook alerts',
      'Tamper-evident audit log',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    amountUsdt: 129,
    period: 'per month',
    summary: 'Unlimited seats, every integration, priority support.',
    features: [
      'Everything in Growth',
      'Unlimited seats and pipelines',
      'Stripe, Google Calendar and Twilio',
      'Priority support',
    ],
  },
];

export const DEFAULT_PLAN_ID = PLANS[0].id;

export function findPlan(id) {
  return PLANS.find((plan) => plan.id === id) ?? null;
}

/** How long a deposit window stays open before the intent expires. */
export const PAYMENT_WINDOW_MINUTES = 60;

/** Binance deposit status codes that mean the funds actually landed. */
export const CREDITED_STATUSES = new Set([1, 6]);

/** The providers a workspace can pay with, in the order the UI offers them. */
export const PROVIDERS = ['stripe', 'crypto'];
