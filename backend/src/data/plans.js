/** Subscription plans. Priced in USDT so the deposit check is straightforward. */
export const PLANS = [
  {
    id: 'semester-standard',
    name: 'Semester Fee — Standard',
    amountUsdt: 25,
    period: 'per semester',
    summary: 'Tuition instalment, library access and examination fees.',
    features: ['Tuition instalment', 'Library and lab access', 'Examination fees'],
  },
  {
    id: 'semester-plus',
    name: 'Semester Fee — Plus',
    amountUsdt: 45,
    period: 'per semester',
    summary: 'Everything in Standard, plus hostel and transport.',
    features: ['Everything in Standard', 'Hostel seat', 'Campus transport'],
  },
  {
    id: 'campus-annual',
    name: 'Campus Annual Plan',
    amountUsdt: 120,
    period: 'per year',
    summary: 'Full academic year, billed once.',
    features: ['Both semesters', 'Hostel and transport', 'Priority course registration'],
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
