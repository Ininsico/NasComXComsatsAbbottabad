import { Link } from 'react-router-dom';

const POINTS = [
  'Live attendance and result tracking',
  'Fee vouchers and payment history',
  'Class timetables and exam datesheets',
  'Announcements from your department',
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
            <strong>COMSATS</strong>
            <span>Abbottabad</span>
          </span>
        </Link>

        <div>
          <h2>The campus portal for COMSATS Abbottabad</h2>
          <p>
            One account for students, parents and faculty. Sign in to manage academics, finance and
            communication from a single dashboard.
          </p>
          <ul className="list-check">
            {POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>

        <p className="auth__aside-foot">
          &copy; {new Date().getFullYear()} COMSATS Abbottabad · Park Road, Abbottabad
        </p>
      </aside>

      <div className="auth__side">
        <div className="auth__card">{children}</div>
      </div>
    </div>
  );
}
