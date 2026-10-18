import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BRAND, FEATURES, MODULES } from '../data/site.js';

export default function Features() {
  return (
    <>
      <section className="section">
        <div className="container">
          <div className="section-head section-head--center">
            <span className="eyebrow">{BRAND.product}</span>
            <h1>Built for the work between “new lead” and “signed”</h1>
            <p className="lede">
              Eight things that are in the product on day one, without a consultant or a rollout
              plan.
            </p>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="grid grid-3">
            {MODULES.map(({ icon: Icon, title, body }) => (
              <article className="card card--hover" key={title}>
                <span className="tile__icon" aria-hidden="true">
                  <Icon size={17} />
                </span>
                <h3>{title}</h3>
                <p className="muted" style={{ fontSize: '0.8125rem' }}>
                  {body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--soft">
        <div className="container split">
          <div>
            <span className="eyebrow">In every plan</span>
            <h2>The basics are not add-ons</h2>
            <p className="lede">
              Some things should not be priced separately, because a CRM without them is a
              spreadsheet with extra steps.
            </p>
            <ul className="list-check">
              <li>Unlimited activity history on every lead.</li>
              <li>Stage changes recorded with who made them and when.</li>
              <li>Search across name, email, phone and notes.</li>
              <li>Export your data whenever you want it.</li>
            </ul>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/pricing">
                See pricing
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <Link className="btn btn-secondary" to="/contact">
                Ask a question
              </Link>
            </div>
          </div>

          <div className="panel">
            <span className="label-micro">The six stages</span>
            <ol className="stack" style={{ paddingLeft: '1.15rem', marginBottom: 0 }}>
              <li>
                <strong>New.</strong> Captured, nobody has spoken to them yet.
              </li>
              <li>
                <strong>Contacted.</strong> A first conversation happened.
              </li>
              <li>
                <strong>Qualified.</strong> They have a need and a budget.
              </li>
              <li>
                <strong>Applied.</strong> Paperwork is moving.
              </li>
              <li>
                <strong>Enrolled.</strong> Won. Counted in revenue.
              </li>
              <li>
                <strong>Lost.</strong> Closed without a sale, with a reason.
              </li>
            </ol>
            <p className="hint" style={{ marginBottom: 0 }}>
              {FEATURES.length} capture channels and rules sit around these, but the stages are the
              spine.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
