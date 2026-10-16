import {
  Award,
  BadgeCheck,
  CalendarDays,
  CircleCheckBig,
  ClipboardList,
  CreditCard,
  FileText,
  Handshake,
  UserRound,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AsyncSection from '../components/AsyncSection.jsx';
import PageHero from '../components/PageHero.jsx';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';
import { formatCurrency } from '../lib/format.js';

const STEPS = [
  {
    icon: UserRound,
    title: 'Create your applicant account',
    body: 'Sign up with your name, email and a password. You will use this account for the whole process.',
    action: { to: '/signup', label: 'Create account' },
  },
  {
    icon: FileText,
    title: 'Submit the online form',
    body: 'Enter your academic record, choose up to three programme preferences, and confirm your contact details.',
  },
  {
    icon: ClipboardList,
    title: 'Upload documents',
    body: 'Attach your matric and intermediate transcripts, CNIC or B-form, domicile and a recent photograph.',
  },
  {
    icon: CreditCard,
    title: 'Pay the processing fee',
    body: 'A challan is generated for the processing fee. Payment is accepted at designated bank branches.',
  },
  {
    icon: BadgeCheck,
    title: 'Merit list & interview',
    body: 'Merit lists are published on the portal. Shortlisted candidates are called for verification.',
  },
  {
    icon: CircleCheckBig,
    title: 'Confirm your admission',
    body: 'Pay the semester fee within the deadline to lock your seat and receive your registration number.',
  },
];

const DATES = [
  { label: 'Applications open', value: '1 June 2026' },
  { label: 'Application deadline', value: '31 July 2026' },
  { label: 'Entrance test', value: '9 August 2026' },
  { label: 'First merit list', value: '18 August 2026' },
  { label: 'Classes begin', value: '8 September 2026' },
];

const FUNDING = [
  {
    icon: Wallet,
    title: 'Semester fee',
    body: 'Tuition is charged per credit hour and billed at the start of every semester. Vouchers are generated in your portal.',
  },
  {
    icon: Award,
    title: 'Merit scholarships',
    body: 'Students holding the top position in each semester receive a tuition waiver for the following semester.',
  },
  {
    icon: Handshake,
    title: 'Need-based support',
    body: 'Means-tested support and interest-free instalment plans are available on written application to the campus director.',
  },
];

const loadPrograms = () => api.programs();

export default function Admissions() {
  const { data, error, loading, reload } = useApiResource(loadPrograms);
  const programs = data?.programs ?? [];

  return (
    <>
      <PageHero
        title="Admissions"
        description="Fall 2026 admissions are open. Apply online, upload your documents and track your application from one account."
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Six steps</span>
            <h2>The admission process</h2>
            <p className="lede">
              Everything happens on the portal. You will get an email at each stage, and your
              dashboard always shows the current status.
            </p>
          </div>

          <div className="grid grid-3">
            {STEPS.map(({ icon: Icon, title, body, action }) => (
              <article className="card card--hover" key={title}>
                <span className="tile__icon" aria-hidden="true">
                  <Icon size={17} />
                </span>
                <h3>{title}</h3>
                <p className="muted" style={{ fontSize: '0.8125rem' }}>
                  {body}
                </p>
                {action ? (
                  <p className="card__more">
                    <Link to={action.to}>{action.label} →</Link>
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--soft">
        <div className="container split">
          <div>
            <span className="eyebrow">Eligibility</span>
            <h2>Minimum requirements by programme</h2>
            <p className="muted" style={{ fontSize: '0.875rem' }}>
              Meeting the minimum does not guarantee admission — seats are filled on open merit,
              highest aggregate first.
            </p>
            <ul className="list-check">
              <li>Original documents are verified at the time of interview.</li>
              <li>Result-awaiting candidates may apply with a hope certificate.</li>
              <li>Reserved seats follow federal government policy.</li>
            </ul>
          </div>

          <div className="panel">
            <span className="label-micro">Key dates</span>
            <h3 style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <CalendarDays size={17} aria-hidden="true" />
              Fall 2026
            </h3>
            <ul className="info-list">
              {DATES.map((date) => (
                <li key={date.label}>
                  <strong>{date.label}</strong>
                  <span>{date.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="container" style={{ marginTop: '2.25rem' }}>
          <AsyncSection
            loading={loading}
            error={error}
            onRetry={reload}
            shape="rows"
            count={5}
            label="Loading eligibility criteria"
            errorTitle="We could not load the eligibility criteria"
          >
            <div className="table-wrap">
              <table className="table">
                <caption>Programme-wise eligibility</caption>
                <thead>
                  <tr>
                    <th scope="col">Programme</th>
                    <th scope="col">Level</th>
                    <th scope="col">Academic requirement</th>
                    <th scope="col">Admission test</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((programme) => (
                    <tr key={programme.id}>
                      <th scope="row">{programme.name}</th>
                      <td>
                        <span className="pill pill--neutral">{programme.level}</span>
                      </td>
                      <td>{programme.requirement}</td>
                      <td>{programme.test}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AsyncSection>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Fees &amp; scholarships</span>
            <h2>Paying for your degree</h2>
            <p className="lede">
              A full semester at undergraduate level currently costs about {formatCurrency(142000)},
              covering tuition and campus charges.
            </p>
          </div>

          <div className="grid grid-3">
            {FUNDING.map(({ icon: Icon, title, body }) => (
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

      <section className="section section--soft">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Questions</span>
            <h2>Admission FAQs</h2>
          </div>

          <div className="faq">
            <details open>
              <summary>Do I need to create an account before applying?</summary>
              <p>
                Yes. The application form lives inside your account so you can save progress, upload
                documents later and track status.
              </p>
            </details>
            <details>
              <summary>Can I apply to more than one programme?</summary>
              <p>
                You can list up to three programme preferences in a single application, ranked in
                order of your choice.
              </p>
            </details>
            <details>
              <summary>How will I know I have been selected?</summary>
              <p>
                Your dashboard status changes to “Merit list — selected” and you receive an email at
                your registered address.
              </p>
            </details>
            <details>
              <summary>Is there an age limit?</summary>
              <p>There is no upper age limit for undergraduate or postgraduate programmes.</p>
            </details>
          </div>

          <div className="cta-band" style={{ marginTop: '2.25rem' }}>
            <div>
              <h2>Start your application</h2>
              <p>Create your applicant account to begin. It takes about a minute.</p>
            </div>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/signup">
                Sign up
              </Link>
              <Link className="btn btn-secondary" to="/contact">
                Contact admissions
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
