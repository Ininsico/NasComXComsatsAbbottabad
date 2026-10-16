import {
  ArrowRight,
  BookOpen,
  Clock,
  GraduationCap,
  MapPin,
  Megaphone,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AsyncSection from '../components/AsyncSection.jsx';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';

const HIGHLIGHTS = [
  {
    icon: GraduationCap,
    title: 'Admissions & enrolment',
    body: 'Apply online, upload documents and track your application status without queuing at the registrar office.',
    to: '/admissions',
    linkText: 'See the process',
  },
  {
    icon: BookOpen,
    title: 'Academics',
    body: 'Programme outlines, credit hours and semester plans across four faculties.',
    to: '/academics',
    linkText: 'Browse programmes',
  },
  {
    icon: TrendingUp,
    title: 'Results & attendance',
    body: 'Students and parents see marks, GPA and attendance percentages the moment faculty publish them.',
    to: '/login',
    linkText: 'Open the portal',
  },
  {
    icon: Users,
    title: 'Faculty directory',
    body: 'Find supervisors, office hours and research areas across every department on campus.',
    to: '/faculty',
    linkText: 'Meet the faculty',
  },
];

const TESTIMONIALS = [
  {
    quote:
      'I stopped chasing the notice board. Attendance, results and my fee voucher are all in the portal the same day.',
    name: 'Hamza Riaz',
    role: 'BS Computer Science, 6th semester',
  },
  {
    quote:
      'As a parent I can finally see what my daughter owes and when her exams are, without calling the office.',
    name: 'Rubina Aslam',
    role: 'Parent, Abbottabad',
  },
  {
    quote:
      'Publishing results used to take a week of spreadsheets. Now the department uploads once and it is done.',
    name: 'Dr. Sadia Khan',
    role: 'Head, Department of Computer Science',
  },
];

const STATS = [
  { value: '12,400+', label: 'Students enrolled' },
  { value: '48', label: 'Degree programmes' },
  { value: '310', label: 'Faculty members' },
  { value: '4', label: 'Faculties' },
];

const loadAnnouncements = () => api.announcements();

export default function Home() {
  const { data, error, loading, reload } = useApiResource(loadAnnouncements);
  const announcements = data?.announcements?.slice(0, 3) ?? [];

  return (
    <>
      <section className="hero">
        <div className="container">
          <div>
            <span className="eyebrow">Fall 2026 admissions open</span>
            <h1>
              One campus. <em>Every record.</em> Fully connected.
            </h1>
            <p className="hero__lede">
              COMSATS Abbottabad runs admissions, academics, attendance, examinations and finance
              through a single campus management system — for students, parents and faculty alike.
            </p>

            <div className="btn-row" style={{ marginTop: '1.5rem' }}>
              <Link className="btn btn-primary" to="/signup">
                Create your account
              </Link>
              <Link className="btn btn-secondary" to="/admissions">
                Admission process
              </Link>
            </div>

            <ul className="hero__meta">
              <li>HEC recognised</li>
              <li>Semester system</li>
              <li>Merit &amp; need-based scholarships</li>
            </ul>
          </div>

          <aside className="hero__card">
            <h2>Campus at a glance</h2>
            <div className="hero__stats">
              {STATS.map((stat) => (
                <div className="hero__stat" key={stat.label}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
            <hr />
            <p className="hero__card-note">
              <MapPin size={15} aria-hidden="true" />
              <span>Park Road, Abbottabad — COMSATS University Islamabad, Abbottabad Campus.</span>
            </p>
            <p className="hero__card-note" style={{ marginBottom: 0 }}>
              <Clock size={15} aria-hidden="true" />
              <span>Administration open Monday to Friday, 8:30 AM – 4:30 PM.</span>
            </p>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">What you can do here</span>
            <h2>Everything the campus needs, in one portal</h2>
            <p className="lede">
              Each account type gets a tailored view: students track progress, parents follow
              payments and attendance, and faculty publish records in seconds.
            </p>
          </div>

          <div className="grid grid-4">
            {HIGHLIGHTS.map(({ icon: Icon, title, body, to, linkText }) => (
              <article className="card card--hover" key={title}>
                <span className="tile__icon" aria-hidden="true">
                  <Icon size={17} />
                </span>
                <h3>{title}</h3>
                <p className="muted" style={{ fontSize: '0.8125rem' }}>
                  {body}
                </p>
                <p className="card__more">
                  <Link to={to}>
                    {linkText}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {error ? null : (
        <section className="section section--soft">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">
                <Megaphone size={12} aria-hidden="true" />
                Notice board
              </span>
              <h2>Latest from campus</h2>
              <p className="lede">Published straight from the campus management system.</p>
            </div>

            <AsyncSection
              loading={loading}
              error={error}
              onRetry={reload}
              shape="cards"
              count={3}
              label="Loading announcements"
              errorTitle="Announcements are unavailable"
            >
              <div className="grid grid-3">
                {announcements.map((item) => (
                  <article className="card" key={item.id}>
                    <div className="notice__meta">
                      <span className="badge">{item.category}</span>
                      <time dateTime={item.date}>{formatDate(item.date)}</time>
                    </div>
                    <h3>{item.title}</h3>
                    <p className="muted" style={{ fontSize: '0.8125rem' }}>
                      {item.body}
                    </p>
                    <p className="hint" style={{ marginBottom: 0 }}>
                      For {item.audience.toLowerCase()}
                    </p>
                  </article>
                ))}
              </div>
            </AsyncSection>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container split">
          <div>
            <span className="eyebrow">Why a portal</span>
            <h2>Fewer queues, fewer phone calls, fewer surprises</h2>
            <p className="lede">
              Paper registers and notice boards lose information. The portal keeps a single record
              of every student that every department can trust.
            </p>
            <ul className="list-check">
              <li>Fee reminders reach parents before the due date, not after.</li>
              <li>Attendance below 75% raises a warning automatically.</li>
              <li>Exam results publish for the whole campus at once.</li>
              <li>Announcements are archived instead of torn off a board.</li>
            </ul>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/about">
                About the campus
              </Link>
              <Link className="btn btn-secondary" to="/contact">
                Talk to administration
              </Link>
            </div>
          </div>

          <div className="panel">
            <span className="label-micro">Semester flow</span>
            <h3 style={{ marginTop: '0.25rem' }}>A typical semester</h3>
            <ol className="stack" style={{ paddingLeft: '1.15rem', marginBottom: 0 }}>
              <li>Course registration opens and students confirm credit hours.</li>
              <li>Faculty mark attendance online after every lecture.</li>
              <li>Mid-term results appear in the student dashboard.</li>
              <li>Fee vouchers generate automatically with due dates.</li>
              <li>Final results and GPA publish to the transcript.</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="section section--soft">
        <div className="container">
          <div className="section-head section-head--center">
            <span className="eyebrow">Voices from campus</span>
            <h2>Built around real academic workflows</h2>
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
              <h2>Ready to get your campus account?</h2>
              <p>Sign up in under a minute, or apply for admission for Fall 2026.</p>
            </div>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/signup">
                Sign up now
              </Link>
              <Link className="btn btn-secondary" to="/admissions">
                Apply for admission
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
