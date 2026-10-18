import { ArrowRight, CircleCheckBig, Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BRAND, FEATURES, HERO_STATS, STEPS, TESTIMONIALS } from '../data/site.js';

const PIPELINE = [
  ['New', 14],
  ['Contacted', 9],
  ['Qualified', 6],
  ['Applied', 3],
  ['Enrolled', 2],
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <div>
            <span className="eyebrow">
              <Rocket size={12} aria-hidden="true" />
              CRM for teams of two to twenty
            </span>
            <h1>
              Every lead. <em>Every follow-up.</em> One pipeline.
            </h1>
            <p className="hero__lede">{BRAND.description}</p>

            <div className="btn-row" style={{ marginTop: '1.5rem' }}>
              <Link className="btn btn-primary" to="/signup">
                Start free
              </Link>
              <Link className="btn btn-secondary" to="/contact">
                Book a demo
              </Link>
            </div>

            <ul className="hero__meta">
              <li>No credit card</li>
              <li>Import in minutes</li>
              <li>Cancel anytime</li>
            </ul>
          </div>

          <aside className="hero__card">
            <h2>What the team sees</h2>
            <div className="hero__stats">
              {HERO_STATS.map((stat) => (
                <div className="hero__stat" key={stat.label}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
            <hr />
            <p className="label-micro">Pipeline right now</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
              {PIPELINE.map(([stage, count]) => (
                <li
                  key={stage}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.35rem 0',
                    borderBottom: '1px solid var(--line)',
                    fontSize: '0.8125rem',
                  }}
                >
                  <span>{stage}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">What is inside</span>
            <h2>Everything a small sales team actually uses</h2>
            <p className="lede">
              No twenty-module configuration project. Capture, qualify, follow up, and see what is
              working.
            </p>
          </div>

          <div className="grid grid-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
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

          <div className="btn-row" style={{ marginTop: '1.5rem' }}>
            <Link className="btn btn-secondary" to="/features">
              All features
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="section section--soft">
        <div className="container split">
          <div>
            <span className="eyebrow">How it works</span>
            <h2>Three steps, then it runs itself</h2>
            <p className="lede">
              The point of a CRM is that the next action is obvious. That only works if capturing and
              updating takes seconds.
            </p>
            <ul className="list-check">
              <li>The website form creates a lead, with a source, before anyone checks an inbox.</li>
              <li>A call or an email is one field: it attaches to the lead with who and when.</li>
              <li>Changing a stage writes to the activity trail, so the history explains itself.</li>
              <li>Reports read the same records your team already updates.</li>
            </ul>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/pricing">
                See pricing
              </Link>
              <Link className="btn btn-secondary" to="/contact">
                Talk to us
              </Link>
            </div>
          </div>

          <div className="panel">
            <span className="label-micro">The flow</span>
            <ol className="stack" style={{ paddingLeft: '1.15rem', marginBottom: 0 }}>
              {STEPS.map((step) => (
                <li key={step.title}>
                  <strong>{step.title}.</strong> {step.body}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head section-head--center">
            <span className="eyebrow">From the teams using it</span>
            <h2>Updated because it takes one click</h2>
          </div>

          <div className="grid grid-3">
            {TESTIMONIALS.map((item) => (
              <blockquote className="quote" key={item.name}>
                <p>{item.quote}</p>
                <footer>
                  {item.name}
                  <br />
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {item.role}
                  </span>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta-band">
            <div>
              <h2>Your pipeline, set up before lunch</h2>
              <p>
                <CircleCheckBig size={14} aria-hidden="true" /> Create an account, import a CSV,
                invite the team.
              </p>
            </div>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/signup">
                Create your account
              </Link>
              <Link className="btn btn-secondary" to="/contact">
                Book a demo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
