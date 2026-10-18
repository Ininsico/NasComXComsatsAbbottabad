import { CircleCheckBig } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FAQ, PLANS } from '../data/site.js';

export default function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      <section className="section">
        <div className="container">
          <div className="section-head section-head--center">
            <span className="eyebrow">Pricing</span>
            <h1>Per seat, no implementation fee</h1>
            <p className="lede">
              Every plan is a real pipeline. The difference is seats, lead volume and the controls a
              growing team needs.
            </p>

            <div className="btn-row" style={{ justifyContent: 'center', marginTop: '1rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${annual ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => setAnnual(false)}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`btn btn-sm ${annual ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setAnnual(true)}
              >
                Annual · save 20%
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="grid grid-3">
            {PLANS.map((plan) => (
              <article
                className="card"
                key={plan.name}
                style={
                  plan.highlight
                    ? { borderColor: 'var(--blue-300, #93c5fd)', boxShadow: 'var(--shadow-card)' }
                    : undefined
                }
              >
                {plan.highlight ? <span className="badge">Most popular</span> : null}

                <h3 style={{ marginTop: plan.highlight ? '0.5rem' : 0 }}>{plan.name}</h3>
                <p className="muted" style={{ fontSize: '0.8125rem' }}>
                  {plan.summary}
                </p>

                <p style={{ margin: '0.75rem 0 0' }}>
                  <strong style={{ fontSize: '2rem', lineHeight: 1 }}>
                    ${annual ? plan.annual : plan.price}
                  </strong>
                  <span className="muted"> / user / month</span>
                </p>
                <p className="hint" style={{ marginTop: '0.25rem' }}>
                  {annual ? 'billed yearly' : 'billed monthly'}
                </p>

                <ul className="list-check" style={{ marginTop: '0.75rem' }}>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>

                <div className="btn-row" style={{ marginTop: '1rem' }}>
                  <Link
                    className={`btn ${plan.highlight ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    to="/signup"
                  >
                    Start with {plan.name}
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <p className="hint" style={{ textAlign: 'center', marginTop: '1.25rem' }}>
            Prices in USD. Cancel any time; annual plans are refunded pro rata.
          </p>
        </div>
      </section>

      <section className="section section--soft">
        <div className="container">
          <div className="section-head section-head--center">
            <span className="eyebrow">Questions</span>
            <h2>Before you sign up</h2>
          </div>

          <div className="grid grid-2" style={{ gap: '0.75rem' }}>
            {FAQ.map((item) => (
              <details className="card" key={item.question}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  <CircleCheckBig size={14} aria-hidden="true" /> {item.question}
                </summary>
                <p className="muted" style={{ fontSize: '0.8125rem', marginBottom: 0 }}>
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
