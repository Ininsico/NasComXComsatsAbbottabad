import { Link } from 'react-router-dom';

const POINTS = [
  'A pipeline that updates in one click',
  'Leads captured from the website, WhatsApp and manual entry',
  'Activity history attached to every lead',
  'Reporting computed from the records your team keeps',
];

export default function AuthShell({ children }) {
  return (
    <div className="auth">
      <aside className="auth__aside">
        <Link className="auth__aside-plate" to="/">
          <span className="sidebar__plate">
            <img src="/logo.png" alt="" />
          </span>
          <span className="sidebar__brand-text">
            <strong>Nascom</strong>
            <span>CRM</span>
          </span>
        </Link>

        <div>
          <h2>The CRM that keeps every deal moving</h2>
          <p>
            One workspace for the pipeline, the conversations and the numbers. Sign in to pick up
            where the team left off.
          </p>
          <ul className="list-check">
            {POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>

        <p className="auth__aside-foot">
          &copy; {new Date().getFullYear()} Nascom · Remote-first
        </p>
      </aside>

      <div className="auth__side">
        <div className="auth__card">{children}</div>
      </div>
    </div>
  );
}
