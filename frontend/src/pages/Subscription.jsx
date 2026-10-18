import {
  BadgeCheck,
  Bitcoin,
  CalendarClock,
  CreditCard,
  Copy,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { subscriptionApi } from '../lib/api.js';

const STATUS_TONES = {
  active: 'pill--done',
  trialing: 'pill--info',
  canceled: 'pill--neutral',
  past_due: 'pill--problem',
};

const STATUS_LABELS = {
  active: 'Active',
  trialing: 'Trial',
  canceled: 'Canceled',
  past_due: 'Past due',
};

const INVOICE_TONES = {
  confirmed: 'pill--done',
  overpaid: 'pill--pending',
  mismatch: 'pill--problem',
  expired: 'pill--neutral',
  abandoned: 'pill--neutral',
  failed: 'pill--problem',
  refunded: 'pill--problem',
  awaiting_payment: 'pill--info',
};

function Meter({ label, used, limit, note }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const full = used >= limit;

  return (
    <div>
      <span className="label-micro">
        {label} — {used} of {limit}
      </span>
      <div className="meter" role="presentation">
        <span className={`meter__fill${full ? ' is-full' : ''}`} style={{ width: `${percent}%` }} />
      </div>
      {note ? <span className="hint">{note}</span> : null}
    </div>
  );
}

export default function Subscription() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState(null);
  const [providerChoice, setProviderChoice] = useState(null);
  const [busy, setBusy] = useState('');
  const settledReturn = useRef(false);

  const apply = useCallback((payload) => setData(payload), []);
  const fetchAll = useCallback(() => subscriptionApi.get(token), [token]);

  const refresh = useCallback(
    () =>
      fetchAll()
        .then(apply)
        .catch((error) =>
          showToast({ tone: 'error', title: 'Could not load billing', message: error.message }),
        ),
    [fetchAll, apply, showToast],
  );

  useEffect(() => {
    let active = true;

    fetchAll()
      .then((payload) => {
        if (active) apply(payload);
      })
      .catch((error) => {
        if (active) showToast({ tone: 'error', title: 'Could not load billing', message: error.message });
      });

    const result = new URLSearchParams(window.location.search).get('checkout');

    if (result === 'cancelled') {
      settledReturn.current = true;
      window.history.replaceState({}, '', window.location.pathname);
      showToast({ tone: 'info', title: 'Checkout cancelled', message: 'Nothing was charged.' });
    }

    if (result === 'success' && !settledReturn.current) {
      settledReturn.current = true;
      window.history.replaceState({}, '', window.location.pathname);

      subscriptionApi
        .confirm(token, null)
        .then((outcome) => {
          showToast({
            tone: outcome.settled ? 'success' : 'info',
            title: outcome.settled ? 'Subscription active' : 'Stripe has not confirmed it yet',
            message: outcome.settled
              ? `${outcome.subscription.planName} is active until ${new Date(outcome.subscription.currentPeriodEnd).toDateString()}`
              : outcome.intent?.statusMessage,
          });

          return refresh();
        })
        .catch((error) =>
          showToast({ tone: 'error', title: 'Could not confirm the payment', message: error.message }),
        );
    }

    return () => {
      active = false;
    };
  }, [fetchAll, apply, refresh, showToast, token]);

  const offered = useMemo(
    () => (data?.providers ?? []).filter((provider) => provider.available),
    [data],
  );
  const activeProvider =
    offered.find((provider) => provider.id === providerChoice)?.id ?? offered[0]?.id ?? null;

  async function run(key, action, successTitle) {
    setBusy(key);

    try {
      const result = await action();

      if (result?.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      if (successTitle) showToast({ tone: 'success', title: successTitle });
      await refresh();
    } catch (error) {
      showToast({ tone: 'error', title: 'That did not work', message: error.message });
    } finally {
      setBusy('');
    }
  }

  if (!data) return <p className="hint">Loading billing…</p>;

  const subscription = data.subscription;
  const status = subscription.status;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Subscription</h1>
          <p>
            {subscription.planName} · {STATUS_LABELS[status] ?? status}
            {subscription.currentPeriodEnd
              ? ` · ${status === 'canceled' ? 'access ends' : 'renews'} ${new Date(subscription.currentPeriodEnd).toDateString()}`
              : ''}
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {!data.live ? (
        <p className="alert alert--error" style={{ marginBottom: '1.25rem' }}>
          <TriangleAlert size={15} aria-hidden="true" />
          {data.reason}. The workspace keeps working, but new seats and paid plans need a payment.
        </p>
      ) : null}

      <section className="grid grid-2" style={{ marginBottom: '1.25rem' }}>
        <article className="card">
          <span className="label-micro">Current plan</span>
          <h3 style={{ marginTop: '0.25rem' }}>
            {subscription.planName}
            <span className={`pill ${STATUS_TONES[status] ?? 'pill--neutral'}`} style={{ marginLeft: '0.5rem' }}>
              {STATUS_LABELS[status] ?? status}
            </span>
          </h3>

          <div className="detail-grid">
            <Meter label="Seats" used={data.usage.seats} limit={data.limits.seats} />
            <Meter label="Leads stored" used={data.usage.leads} limit={data.limits.leads} />
            <div>
              <span className="label-micro">Integrations on this plan</span>
              <p style={{ margin: 0, fontSize: '0.8125rem' }}>{data.limits.integrations.join(', ')}</p>
            </div>
            <div>
              <span className="label-micro">Pipelines</span>
              <p style={{ margin: 0, fontSize: '0.8125rem' }}>{data.limits.pipelines}</p>
            </div>
          </div>

          <div className="btn-row">
            {status === 'canceled' ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy === 'resume'}
                onClick={() => run('resume', () => subscriptionApi.resume(token), 'Subscription resumed')}
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy === 'cancel'}
                onClick={() => run('cancel', () => subscriptionApi.cancel(token), 'Subscription canceled')}
              >
                Cancel at period end
              </button>
            )}
          </div>
        </article>

        <article className="card">
          <span className="label-micro">
            <CalendarClock size={12} aria-hidden="true" /> Open payment
          </span>

          {data.openIntent ? (
            <>
              <h3 style={{ marginTop: '0.25rem' }}>{data.openIntent.planName}</h3>
              <div className="detail-grid">
                <div>
                  <span className="label-micro">
                    {data.openIntent.provider === 'stripe' ? 'Amount' : 'Send exactly'}
                  </span>
                  <p style={{ margin: 0 }}>
                    {data.openIntent.expectedAmount} {data.openIntent.asset}
                  </p>
                </div>
                <div>
                  <span className="label-micro">Reference</span>
                  <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    {data.openIntent.reference}
                  </p>
                </div>
              </div>

              {data.openIntent.address ? (
                <div className="pay-address">
                  <div>
                    <span className="label-micro">
                      Deposit address ({data.openIntent.network})
                    </span>
                    <code className="pay-address__value">{data.openIntent.address}</code>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigator.clipboard.writeText(data.openIntent.address)}
                  >
                    <Copy size={14} aria-hidden="true" />
                    Copy
                  </button>
                </div>
              ) : (
                <p className="hint">
                  The card payment is waiting on Stripe. Use the link you were given, or check again below.
                </p>
              )}

              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginTop: '0.75rem' }}
                disabled={busy === 'confirm'}
                onClick={() =>
                  run(
                    'confirm',
                    async () => {
                      const outcome = await subscriptionApi.confirm(token, data.openIntent.id);

                      if (!outcome.settled) {
                        showToast({
                          tone: 'info',
                          title: 'Not settled yet',
                          message: outcome.intent?.statusMessage,
                        });
                      }

                      return outcome;
                    },
                    'Subscription active',
                  )
                }
              >
                <RefreshCw size={14} aria-hidden="true" />
                {busy === 'confirm' ? 'Checking…' : 'Check the payment now'}
              </button>
            </>
          ) : (
            <p className="hint">No payment is waiting. Choose a plan below to start one.</p>
          )}
        </article>
      </section>

      <section className="dash-section">
        <h2 className="dash-section__title">
          <BadgeCheck size={17} aria-hidden="true" />
          Change plan
        </h2>

        <div className="provider-pick">
          <span className="label-micro">Pay with</span>

          {offered.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className={`provider-pick__option${activeProvider === provider.id ? ' is-active' : ''}`}
              onClick={() => setProviderChoice(provider.id)}
              aria-pressed={activeProvider === provider.id}
            >
              {provider.id === 'stripe' ? <CreditCard size={15} aria-hidden="true" /> : <Bitcoin size={15} aria-hidden="true" />}
              <span>
                <strong>{provider.label}</strong>
                <em>
                  {provider.mode ? `Stripe ${provider.mode} mode` : `Deposits on ${provider.network}`}
                </em>
              </span>
            </button>
          ))}

          {offered.length === 0 ? (
            <p className="alert alert--pending" style={{ margin: 0 }}>
              No payment method is configured on the server yet.
            </p>
          ) : null}
        </div>

        <div className="grid grid-3">
          {data.plans.map((plan) => (
            <article className="card card--hover" key={plan.id}>
              <h3>{plan.name}</h3>
              <p className="pay-plan__amount">
                {plan.amountUsdt} <span>{activeProvider === 'stripe' ? 'USD' : (offered[0]?.asset ?? 'USDT')}</span>
              </p>
              <p className="hint" style={{ marginBottom: '0.75rem' }}>
                {plan.period}
              </p>
              <ul className="list-check" style={{ fontSize: '0.8125rem' }}>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
                <li>{plan.limits.seats} seats included</li>
                <li>{plan.limits.leads.toLocaleString()} leads stored</li>
              </ul>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={busy === plan.id || offered.length === 0 || Boolean(data.openIntent)}
                onClick={() =>
                  run(
                    plan.id,
                    () => subscriptionApi.checkout(token, plan.id, activeProvider),
                    'Payment started',
                  )
                }
              >
                <Users size={15} aria-hidden="true" />
                {busy === plan.id
                  ? 'Opening…'
                  : data.openIntent
                    ? 'Waiting on the open payment'
                    : subscription.planId === plan.id
                      ? 'Renew this plan'
                      : 'Switch to this plan'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section__title">Invoices</h2>

        {data.invoices.length === 0 ? (
          <p className="hint">No payments yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Method</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Started</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <th scope="row" style={{ fontFamily: 'var(--font-mono)' }}>
                      {invoice.reference}
                    </th>
                    <td>{invoice.planName}</td>
                    <td>{invoice.provider}</td>
                    <td>
                      {invoice.amount} {invoice.asset}
                    </td>
                    <td>{new Date(invoice.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`pill ${INVOICE_TONES[invoice.status] ?? 'pill--neutral'}`}>
                        {invoice.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="hint">
          <ShieldCheck size={12} aria-hidden="true" /> Card details are entered on Stripe and never reach
          this server. Card numbers are never stored or logged here.
        </p>
      </section>
    </>
  );
}
