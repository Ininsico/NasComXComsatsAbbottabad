import { Building, Mail, MapPin } from 'lucide-react';
import AsyncSection from '../components/AsyncSection.jsx';
import PageHero from '../components/PageHero.jsx';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';

const loadFaculty = () => api.faculty();

function initials(name) {
  return name
    .replace(/^(Prof\.|Dr\.|Ms\.|Mr\.|Mrs\.)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function summariseDepartments(faculty) {
  const departments = new Map();

  for (const member of faculty) {
    const entry = departments.get(member.department) ?? {
      name: member.department,
      listed: 0,
      head: null,
    };

    entry.listed += 1;
    if (/Head|Director|Registrar/i.test(member.designation)) entry.head = member.name;
    departments.set(member.department, entry);
  }

  return [...departments.values()].sort((a, b) => b.listed - a.listed);
}

export default function Faculty() {
  const { data, error, loading, reload } = useApiResource(loadFaculty);
  const faculty = data?.faculty ?? [];
  const departments = summariseDepartments(faculty);

  return (
    <>
      <PageHero
        title="Faculty &amp; departments"
        crumb="Faculty"
        description="Office hours are published every semester and can be booked through the portal."
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Departments</span>
            <h2>Academic departments on campus</h2>
          </div>

          <AsyncSection
            loading={loading}
            error={error}
            onRetry={reload}
            shape="rows"
            count={5}
            label="Loading departments"
            errorTitle="We could not load the department list"
          >
            <div className="table-wrap">
              <table className="table">
                <caption>Departmental overview</caption>
                <thead>
                  <tr>
                    <th scope="col">Department</th>
                    <th scope="col">Members listed</th>
                    <th scope="col">Head of Department</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((department) => (
                    <tr key={department.name}>
                      <th scope="row">{department.name}</th>
                      <td>{department.listed}</td>
                      <td>{department.head ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AsyncSection>
        </div>
      </section>

      <section className="section section--soft">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Directory</span>
            <h2>Teaching staff</h2>
            <p className="lede">
              Contact details for the current directory. Visiting faculty are listed inside the
              portal.
            </p>
          </div>

          <AsyncSection
            loading={loading}
            error={error}
            onRetry={reload}
            shape="cards"
            count={4}
            label="Loading the faculty directory"
            errorTitle="We could not load the faculty directory"
          >
            <div className="grid grid-2">
              {faculty.map((member) => (
                <article className="person" key={member.id}>
                  <span className="person__avatar" aria-hidden="true">
                    {initials(member.name)}
                  </span>
                  <div>
                    <h3>{member.name}</h3>
                    <p className="person__role">{member.designation}</p>
                    <ul className="info-list info-list--inline">
                      <li>
                        <Building size={15} aria-hidden="true" />
                        <span>{member.department}</span>
                      </li>
                      <li>
                        <MapPin size={15} aria-hidden="true" />
                        <span>{member.office}</span>
                      </li>
                      <li>
                        <Mail size={15} aria-hidden="true" />
                        <a href={`mailto:${member.email}`}>{member.email}</a>
                      </li>
                    </ul>
                    <p className="hint" style={{ marginBottom: 0 }}>
                      Research focus: {member.focus}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </AsyncSection>
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div>
            <span className="eyebrow">For students</span>
            <h2>Getting in touch with a supervisor</h2>
            <p className="muted" style={{ fontSize: '0.875rem' }}>
              Need approval for a final year project, an internship letter or a course waiver? Every
              request starts with a message to the right member of faculty.
            </p>
            <ul className="list-check">
              <li>Check published office hours before visiting a department.</li>
              <li>Include your registration number in every email.</li>
              <li>Project supervision requests open in the fifth semester.</li>
            </ul>
          </div>

          <div className="panel">
            <span className="label-micro">Consultation</span>
            <h3 style={{ marginTop: '0.25rem' }}>Faculty support hours</h3>
            <ul className="info-list">
              <li>
                <strong>Monday &amp; Wednesday</strong>
                <span>10:00 AM – 12:00 PM, departmental offices</span>
              </li>
              <li>
                <strong>Tuesday &amp; Thursday</strong>
                <span>2:00 PM – 4:00 PM, by appointment through the portal</span>
              </li>
              <li>
                <strong>Friday</strong>
                <span>Research supervision only</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
