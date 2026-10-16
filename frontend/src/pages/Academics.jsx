import { ChartColumn, CodeXml, Cog, FlaskConical, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import AsyncSection from '../components/AsyncSection.jsx';
import PageHero from '../components/PageHero.jsx';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';

const FACULTY_ICONS = {
  'Faculty of Computing': CodeXml,
  'Faculty of Engineering': Cog,
  'Faculty of Sciences': FlaskConical,
  'Faculty of Management': ChartColumn,
};

const SEMESTER_PLAN = [
  { term: 'Semester 1', credits: 17, focus: 'Foundation courses, programming basics, communication skills' },
  { term: 'Semester 2', credits: 18, focus: 'Discrete mathematics, object oriented programming' },
  { term: 'Semester 3', credits: 18, focus: 'Data structures, digital logic design' },
  { term: 'Semester 4', credits: 17, focus: 'Databases, operating systems, linear algebra' },
  { term: 'Semester 5', credits: 18, focus: 'Networks, software design, electives begin' },
  { term: 'Semester 6', credits: 17, focus: 'Web engineering, artificial intelligence' },
  { term: 'Semester 7', credits: 16, focus: 'Final year project part I, internship' },
  { term: 'Semester 8', credits: 15, focus: 'Final year project part II, specialisation electives' },
];

const FACILITIES = [
  { title: 'Central library', body: 'Over 42,000 titles, digital journal access and quiet study halls open until 8 PM.' },
  { title: 'Computing labs', body: 'Six labs with 240 workstations, gigabit campus network and licensed tooling.' },
  { title: 'Engineering workshops', body: 'Electronics, power and fabrication workshops for lab and project work.' },
  { title: 'Girls’ common room', body: 'Dedicated common room, prayer area and transport point inside the campus.' },
  { title: 'Sports complex', body: 'Cricket ground, futsal court, badminton hall and gymnasium.' },
  { title: 'Cafeteria', body: 'Subsidised cafeteria serving hot meals and snacks throughout the day.' },
];

const loadPrograms = () => api.programs();

function groupByFaculty(programs) {
  const groups = new Map();

  for (const programme of programs) {
    if (!groups.has(programme.faculty)) groups.set(programme.faculty, []);
    groups.get(programme.faculty).push(programme);
  }

  return [...groups.entries()].map(([name, items]) => ({ name, items }));
}

export default function Academics() {
  const { data, error, loading, reload } = useApiResource(loadPrograms);
  const programs = data?.programs ?? [];
  const faculties = groupByFaculty(programs);

  return (
    <>
      <PageHero
        title="Academics"
        description="Four faculties and a semester system built on continuous assessment, with a mandatory final year project and internship."
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Faculties</span>
            <h2>Where you can study</h2>
            <p className="lede">
              Every programme follows the HEC curriculum framework. Requirements for each are listed
              on the <Link to="/admissions">admissions page</Link>.
            </p>
          </div>

          <AsyncSection
            loading={loading}
            error={error}
            onRetry={reload}
            shape="cards"
            count={4}
            label="Loading programmes"
            errorTitle="We could not load the programme catalogue"
          >
            <div className="grid grid-2">
              {faculties.map((faculty) => {
                const Icon = FACULTY_ICONS[faculty.name] ?? GraduationCap;

                return (
                  <article className="card card--hover" key={faculty.name}>
                    <span className="tile__icon" aria-hidden="true">
                      <Icon size={17} />
                    </span>
                    <h3>{faculty.name}</h3>
                    <p className="hint" style={{ marginBottom: '0.875rem' }}>
                      {faculty.items.length} programmes offered
                    </p>
                    <ul className="programme-list">
                      {faculty.items.map((programme) => (
                        <li key={programme.id}>
                          <span className="programme-list__name">{programme.name}</span>
                          <span className="programme-list__meta">
                            {programme.level} · {programme.duration} · {programme.credits} credit
                            hours
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>

            {programs.length > 0 ? (
              <div className="stat-band" style={{ marginTop: '1.75rem' }}>
                <div className="stat-band__item">
                  <strong>{programs.length}</strong>
                  <span>Programmes</span>
                </div>
                <div className="stat-band__item">
                  <strong>{faculties.length}</strong>
                  <span>Faculties</span>
                </div>
                <div className="stat-band__item">
                  <strong>{Math.max(...programs.map((programme) => programme.seats))}</strong>
                  <span>Largest intake</span>
                </div>
                <div className="stat-band__item">
                  <strong>{Math.round(programs.reduce((total, p) => total + p.credits, 0) / programs.length)}</strong>
                  <span>Average credit hours</span>
                </div>
              </div>
            ) : null}
          </AsyncSection>
        </div>
      </section>

      <section className="section section--soft">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Degree structure</span>
            <h2>An eight-semester roadmap</h2>
            <p className="lede">
              Credit hours and course sequencing for a typical bachelor’s programme. Exact plans
              vary by department.
            </p>
          </div>

          <div className="table-wrap">
            <table className="table">
              <caption>Bachelor’s programme — indicative plan</caption>
              <thead>
                <tr>
                  <th scope="col">Term</th>
                  <th scope="col">Credit hours</th>
                  <th scope="col">Focus</th>
                </tr>
              </thead>
              <tbody>
                {SEMESTER_PLAN.map((row) => (
                  <tr key={row.term}>
                    <th scope="row">{row.term}</th>
                    <td>{row.credits}</td>
                    <td>{row.focus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="hint" style={{ marginTop: '0.75rem' }}>
            A minimum of 136 credit hours and a CGPA of 2.0 are required to graduate.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Campus facilities</span>
            <h2>Support beyond the classroom</h2>
          </div>

          <div className="grid grid-3">
            {FACILITIES.map((facility) => (
              <article className="card" key={facility.title}>
                <h3>{facility.title}</h3>
                <p className="muted" style={{ fontSize: '0.8125rem', marginBottom: 0 }}>
                  {facility.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--soft">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Examinations</span>
            <h2>How assessment works</h2>
          </div>

          <div className="faq">
            <details open>
              <summary>How is the final grade calculated?</summary>
              <p>
                Each course carries sessional marks (quizzes, assignments, attendance) and a final
                examination. Sessional weightage is typically 40–50% depending on the department.
              </p>
            </details>
            <details>
              <summary>When are results published?</summary>
              <p>
                Mid-term results appear in the portal within two weeks of the exam. Final semester
                results are published after the examination committee approves them.
              </p>
            </details>
            <details>
              <summary>What is the minimum attendance requirement?</summary>
              <p>
                Students must maintain at least 75% attendance in every course. The portal flags any
                student who falls below this threshold.
              </p>
            </details>
            <details>
              <summary>Can I repeat a failed course?</summary>
              <p>
                Yes. Failed courses can be repeated in the next offering, and the improved grade
                replaces the earlier one in the CGPA calculation.
              </p>
            </details>
          </div>

          <div className="btn-row" style={{ marginTop: '1.75rem' }}>
            <Link className="btn btn-primary" to="/admissions">
              Admission requirements
            </Link>
            <Link className="btn btn-secondary" to="/faculty">
              Faculty directory
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
