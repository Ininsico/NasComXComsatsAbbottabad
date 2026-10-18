import { Handshake, Rocket, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero.jsx';
import { BRAND, HERO_STATS } from '../data/site.js';

const VALUES = [
  {
    icon: Target,
    title: 'The problem we picked',
    body: 'Small teams do not lose deals because they cannot sell. They lose them because the follow-up lives in someone’s head, and nobody can see what is actually in play.',
  },
  {
    icon: Rocket,
    title: 'What we build',
    body: 'A pipeline fast enough to update during a call, and reporting built from those same records — no parallel spreadsheet.',
  },
  {
    icon: Handshake,
    title: 'How we work',
    body: 'No implementation project, no per-lead pricing games, and an export button that works on day one. If leaving is easy, staying has to be earned.',
  },
];

const TIMELINE = [
  {
    year: 'Day 1',
    title: 'Capture',
    body: 'The website form, WhatsApp and manual entry all create the same kind of lead, with a source.',
  },
  {
    year: 'Week 1',
    title: 'Qualify',
    body: 'Calls and notes attach to the lead. Stages change with a click, and the change is recorded.',
  },
  {
    year: 'Month 1',
    title: 'Close',
    body: 'Conversion by stage shows where deals leak, so the next month is spent on the right problem.',
  },
];

export default function About() {
  return (
    <>
      <PageHero
        title="Built for the follow-up"
        description={`${BRAND.product} is a CRM for teams that sell in the field as much as the office — the pipeline is the product, not a dashboard bolted onto one.`}
      />

      <section className="section">
        <div className="container split">
          <div>
            <span className="eyebrow">Why this exists</span>
            <h2>The follow-up is the product</h2>
            <p className="lede">
              Most CRMs are built for a sales operations team that a ten-person company does not
              have. The result is a tool nobody updates, and a forecast nobody trusts.
            </p>
            <p className="muted" style={{ fontSize: '0.875rem' }}>
              {BRAND.product} starts from the other end: make the update one click, keep the history
              attached to the lead, and derive every report from those records. If a rep will not do
              it from a phone at an event, it does not belong in the product.
            </p>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/signup">
                Create an account
              </Link>
              <Link className="btn btn-secondary" to="/contact">
                Talk to us
              </Link>
            </div>
          </div>

          <div className="panel">
            <span className="label-micro">What teams see</span>
            <h3 style={{ marginTop: '0.25rem' }}>The numbers we care about</h3>
            <ul className="info-list">
              {HERO_STATS.map((stat) => (
                <li key={stat.label}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </li>
              ))}
              <li>
                <strong>One click</strong>
                <span>to move a lead between stages</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section section--soft">
        <div className="container">
          <div className="section-head section-head--center">
            <span className="eyebrow">Principles</span>
            <h2>Three decisions that shape the product</h2>
          </div>

          <div className="grid grid-3">
            {VALUES.map(({ icon: Icon, title, body }) => (
              <article className="card" key={title}>
                <span className="tile__icon" aria-hidden="true">
                  <Icon size={17} />
                </span>
                <h3>{title}</h3>
                <p className="muted" style={{ fontSize: '0.8125rem', marginBottom: 0 }}>
                  {body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div>
            <span className="eyebrow">What the first month looks like</span>
            <h2>Useful on the first afternoon</h2>
            <p className="muted" style={{ fontSize: '0.875rem' }}>
              There is no onboarding phase that has to finish before the product is worth opening.
            </p>
          </div>

          <ol className="timeline">
            {TIMELINE.map((entry) => (
              <li key={entry.year}>
                <span className="timeline__year">{entry.year}</span>
                <h3>{entry.title}</h3>
                <p>{entry.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta-band">
            <div>
              <h2>See it with your own leads</h2>
              <p>Import a CSV and run one week. If the pipeline is not better, export and leave.</p>
            </div>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/signup">
                Start free
              </Link>
              <Link className="btn btn-secondary" to="/pricing">
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
