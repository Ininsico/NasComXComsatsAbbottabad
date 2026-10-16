import { ArrowRight, Eye, Handshake, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero.jsx';

const TIMELINE = [
  {
    year: '1998',
    title: 'Foundation',
    body: 'COMSATS establishes its Abbottabad campus to serve the Hazara division with quality higher education.',
  },
  {
    year: '2005',
    title: 'Faculties expand',
    body: 'Engineering and computing programmes are added alongside the existing sciences faculty.',
  },
  {
    year: '2014',
    title: 'Management sciences',
    body: 'Business and management degrees launch, widening the campus beyond pure sciences.',
  },
  {
    year: '2026',
    title: 'Digital campus',
    body: 'A unified portal replaces paper registers for admissions, attendance, examinations and fees.',
  },
];

const VALUES = [
  {
    icon: Target,
    title: 'Our mission',
    body: 'Deliver affordable, industry-relevant education that raises the standard of living in Khyber Pakhtunkhwa.',
  },
  {
    icon: Eye,
    title: 'Our vision',
    body: 'Be the region’s most trusted institution for computing, engineering, sciences and management education.',
  },
  {
    icon: Handshake,
    title: 'Our values',
    body: 'Merit, transparency, academic honesty and service to the community guide every decision we make.',
  },
];

const LEADERSHIP = [
  { name: 'Prof. Dr. Aftab Ahmad', role: 'Campus Director' },
  { name: 'Dr. Sadia Khan', role: 'Head, Department of Computer Science' },
  { name: 'Dr. Imran Yousaf', role: 'Head, Department of Electrical Engineering' },
  { name: 'Ms. Nadia Bashir', role: 'Registrar' },
];

function initials(name) {
  return name
    .replace(/^(Prof\.|Dr\.|Ms\.|Mr\.|Mrs\.)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

export default function About() {
  return (
    <>
      <PageHero
        title="About the campus"
        description="COMSATS University Islamabad, Abbottabad Campus — a public university campus serving the Hazara division since 1998."
      />

      <section className="section">
        <div className="container split">
          <div>
            <span className="eyebrow">Who we are</span>
            <h2>A public campus with a regional purpose</h2>
            <p className="lede">
              The Abbottabad campus is part of COMSATS University Islamabad, a federally chartered
              public university. We run a semester system, admit on open merit and publish results
              through a transparent examination process.
            </p>
            <p className="muted" style={{ fontSize: '0.875rem' }}>
              Our graduates work in software houses, telecom operators, power utilities, banks and
              public administration across Pakistan. Nearly a third continue into postgraduate
              study.
            </p>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/academics">
                See our programmes
              </Link>
              <Link className="btn btn-secondary" to="/faculty">
                Meet the faculty
              </Link>
            </div>
          </div>

          <div className="panel">
            <span className="label-micro">At a glance</span>
            <h3 style={{ marginTop: '0.25rem' }}>Campus facts</h3>
            <ul className="info-list">
              <li>
                <strong>Established</strong>
                <span>1998</span>
              </li>
              <li>
                <strong>Charter</strong>
                <span>COMSATS University Islamabad</span>
              </li>
              <li>
                <strong>Location</strong>
                <span>Park Road, Abbottabad, Khyber Pakhtunkhwa</span>
              </li>
              <li>
                <strong>Faculties</strong>
                <span>Computing, Engineering, Sciences, Management</span>
              </li>
              <li>
                <strong>Intake</strong>
                <span>Fall and Spring semesters</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section section--soft">
        <div className="container">
          <div className="section-head section-head--center">
            <span className="eyebrow">Mission &amp; vision</span>
            <h2>What we are here to do</h2>
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
            <span className="eyebrow">Our history</span>
            <h2>From one faculty to four</h2>
            <p className="muted" style={{ fontSize: '0.875rem' }}>
              Three decades of steady growth, without losing the focus on teaching quality.
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

      <section className="section section--soft">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Leadership</span>
            <h2>Who runs the campus</h2>
          </div>

          <div className="grid grid-2">
            {LEADERSHIP.map((person) => (
              <article className="person" key={person.name}>
                <span className="person__avatar" aria-hidden="true">
                  {initials(person.name)}
                </span>
                <div>
                  <h3>{person.name}</h3>
                  <p className="person__role">{person.role}</p>
                  <p className="muted" style={{ fontSize: '0.8125rem', marginBottom: 0 }}>
                    Available for student consultations during published office hours.
                  </p>
                </div>
              </article>
            ))}
          </div>

          <p className="card__more" style={{ marginTop: '1.75rem' }}>
            <Link className="btn btn-primary" to="/faculty">
              Full faculty directory
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
