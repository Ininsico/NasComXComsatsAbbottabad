import {
  BadgeCheck,
  Bitcoin,
  Clock,
  Copy,
  CreditCard,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import AsyncSection from '../components/AsyncSection.jsx';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';

const STATUS_TONES = {
  confirmed: 'pill--done',
  overpaid: 'pill--pending',
  mismatch: 'pill--problem',
  expired: 'pill--neutral',
  awaiting_payment: 'pill--info',
};

const STATUS_LABELS = {
  confirmed: 'Confirmed',
  overpaid: 'Overpaid',
  mismatch: 'Amount mismatch',
  expired: 'Expired',
  awaiting_payment: 'Awaiting deposit',
};

function timeLeft(iso, now) {
  const remaining = new Date(iso).getTime() - now;

  if (remaining <= 0) return 'expired';

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export default function Payments() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const loadPlansAndIntents = useCallback(async () => {
    const [plans, intents, config] = await Promise.all([
      api.paymentPlans(token),
      api.paymentIntents(token),
      api.paymentConfig(token),
    ]);

    return { plans, intents, config };
  }, [token]);

  const { data, error, loading, reload } = useApiResource(loadPlansAndIntents);

  const [busyPlan, setBusyPlan] = useState(null);
  const [checking, setChecking] = useState(false);
  const [tick, setTick] = useState(0);

  const intents = data?.intents?.intents ?? [];
  const plans = data?.plans?.plans ?? [];
  const config = data?.config ?? null;
  const active = intents.find((intent) => intent.status === 'awaiting_payment') ?? intents[0] ?? null;
  const pollSeconds = Math.max(10, config?.pollSeconds ?? 30);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const checkIntent = useCallback(
    async (intentId, { quiet = false } = {}) => {
      if (!intentId) return;

      if (!quiet) setChecking(true);

      try {
        const result = await api.checkPaymentIntent(token, intentId);

        if (!quiet) {
          showToast({
            tone: result.intent.status === 'confirmed' ? 'success' : 'info',
            title: STATUS_LABELS[result.intent.status] ?? 'Checked',
            message: result.intent.statusMessage,
          });
        }

        if (result.updated) reload();
      } catch (checkError) {
        if (!quiet) {
          showToast({ tone: 'error', title: 'Could not check', message: checkError.message });
        }
      } finally {
        if (!quiet) setChecking(false);
      }
    },
    [token, showToast, reload],
  );

  // The backend watcher polls Binance on its own; this keeps the open page in step.
  const openIntentId = active?.status === 'awaiting_payment' ? active.id : null;

  useEffect(() => {
    if (!openIntentId) return undefined;

    const id = setInterval(() => {
      void checkIntent(openIntentId, { quiet: true });
    }, pollSeconds * 1000);

    return () => clearInterval(id);
  }, [openIntentId, pollSeconds, checkIntent]);

  async function startPayment(planId) {
    setBusyPlan(planId);

    try {
      const result = await api.createPaymentIntent(token, planId);
      showToast({
        tone: 'success',
        title: 'Payment window opened',
        message: `Send exactly ${result.intent.expectedAmount} ${result.intent.asset} within the next hour.`,
      });
      reload();
    } catch (createError) {
      showToast({ tone: 'error', title: 'Could not start payment', message: createError.message });
    } finally {
      setBusyPlan(null);
    }
  }

  async function copyAddress(address) {
    try {
      await navigator.clipboard.writeText(address);
      showToast({ tone: 'success', title: 'Address copied', message: address });
    } catch {
      showToast({ tone: 'pending', title: 'Copy failed', message: 'Select the address and copy it manually.' });
    }
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Payments &amp; subscriptions</h1>
          <p>
            {config
              ? `Deposits in ${config.asset} on ${config.network} · ±${config.tolerancePercent}% accepted · checked every ${config.pollSeconds}s`
              : 'Crypto fee payments'}
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <p className="alert alert--info" style={{ marginBottom: '1.5rem' }}>
        <ShieldCheck size={15} aria-hidden="true" />
        Read-only integration. This portal never trades and never moves funds — it only reads
        Binance deposit history to confirm what you sent.
      </p>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={reload}
        shape="cards"
        count={3}
        label="Loading payment options"
        errorTitle="We could not load payment options"
      >
        {active && active.status === 'awaiting_payment' ? (
          <section className="card pay-panel">
            <div className="pay-panel__head">
              <div>
                <span className="label-micro">Open payment window</span>
                <h3 style={{ margin: '0.25rem 0 0' }}>{active.planName}</h3>
              </div>
              <span className={`pill ${STATUS_TONES[active.status]}`}>
                {STATUS_LABELS[active.status]}
              </span>
            </div>

            <div className="pay-grid">
              <div className="pay-cell">
                <span className="label-micro">Send exactly</span>
                <strong className="pay-cell__value">
                  {active.expectedAmount} {active.asset}
                </strong>
                <span className="hint">
                  Accepted range {active.minAmount} – {active.maxAmount} ({active.asset})
                </span>
              </div>

              <div className="pay-cell">
                <span className="label-micro">Network</span>
                <strong className="pay-cell__value">{active.network}</strong>
                <span className="hint">Send only {active.asset} on {active.network}</span>
              </div>

              <div className="pay-cell">
                <span className="label-micro">Reference</span>
                <strong className="pay-cell__value pay-cell__value--mono">{active.reference}</strong>
                <span className="hint">Quote this if you contact the finance office</span>
              </div>

              <div className="pay-cell">
                <span className="label-micro">Window closes in</span>
                <strong className="pay-cell__value">
                  <Clock size={14} aria-hidden="true" />
                  {tick ? timeLeft(active.expiresAt, tick) : 'just opened'}
                </strong>
                <span className="hint">Closes {formatDateTime(active.expiresAt)}</span>
              </div>
            </div>

            <div className="pay-address">
              <div>
                <span className="label-micro">Deposit address</span>
                <code className="pay-address__value">{active.address}</code>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => copyAddress(active.address)}
              >
                <Copy size={14} aria-hidden="true" />
                Copy
              </button>
            </div>

            <div className="btn-row" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => checkIntent(active.id)}
                disabled={checking}
              >
                <RefreshCw size={15} aria-hidden="true" />
                {checking ? 'Checking…' : 'Check for my deposit now'}
              </button>
              <span className="hint" style={{ alignSelf: 'center' }}>
                The backend also watches for it automatically every {pollSeconds}s.
              </span>
            </div>
          </section>
        ) : null}

        {intents.length > 1 ? (
          <section className="dash-section">
            <h2 className="dash-section__title">
              <CreditCard size={17} aria-hidden="true" />
              Payment history
            </h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Plan</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Started</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {intents.map((intent) => (
                    <tr key={intent.id}>
                      <th scope="row" style={{ fontFamily: 'var(--font-mono)' }}>
                        {intent.reference}
                      </th>
                      <td>{intent.planName}</td>
                      <td>
                        {intent.expectedAmount} {intent.asset}
                      </td>
                      <td>{formatDateTime(intent.createdAt)}</td>
                      <td>
                        <span className={`pill ${STATUS_TONES[intent.status] ?? 'pill--neutral'}`}>
                          {STATUS_LABELS[intent.status] ?? intent.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="dash-section">
          <h2 className="dash-section__title">
            <Wallet size={17} aria-hidden="true" />
            Subscription plans
          </h2>

          <div className="grid grid-3">
            {plans.map((plan) => (
              <article className="card card--hover" key={plan.id}>
                <span className="tile__icon" aria-hidden="true">
                  <Bitcoin size={17} />
                </span>
                <h3>{plan.name}</h3>
                <p className="pay-plan__amount">
                  {plan.amountUsdt} <span>{config?.asset ?? 'USDT'}</span>
                </p>
                <p className="hint" style={{ marginBottom: '0.75rem' }}>
                  {plan.period}
                </p>
                <ul className="list-check" style={{ fontSize: '0.8125rem' }}>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => startPayment(plan.id)}
                  disabled={busyPlan !== null}
                >
                  <BadgeCheck size={15} aria-hidden="true" />
                  {busyPlan === plan.id ? 'Opening…' : 'Start payment'}
                </button>
              </article>
            ))}
          </div>
        </section>
      </AsyncSection>
    </>
  );
}
