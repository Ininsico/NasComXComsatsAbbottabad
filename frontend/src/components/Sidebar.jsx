import {
  AudioLines,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FileText,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { ADMIN_ROLE, ROLE_LABELS } from '../data/site.js';

const PORTAL_LINKS = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/voice', label: 'Voice', icon: AudioLines },
  { to: '/profile', label: 'My profile', icon: UserRound },
  { to: '/knowledge', label: 'Knowledge', icon: Database },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/payments', label: 'Payments', icon: Wallet },
];

/** Admins land on the console, so Overview would only bounce them there. */
const ADMIN_PORTAL_LINKS = [
  { to: '/voice', label: 'Voice', icon: AudioLines },
  { to: '/profile', label: 'My profile', icon: UserRound },
  { to: '/knowledge', label: 'Knowledge', icon: Database },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/payments', label: 'Payments', icon: Wallet },
];

const ADMIN_LINKS = [{ to: '/admin', label: 'Admin console', icon: ShieldCheck }];

function initials(name) {
  return name
    .replace(/^(Prof\.|Dr\.|Ms\.|Mr\.|Mrs\.)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function SidebarLink({ link, onNavigate }) {
  const Icon = link.icon;

  return (
    <NavLink
      className={({ isActive }) => `sidebar__link${isActive ? ' is-active' : ''}`}
      to={link.to}
      end={link.end}
      onClick={onNavigate}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="sidebar__label">{link.label}</span>
    </NavLink>
  );
}

export default function Sidebar({ collapsed, onToggleCollapse, open, onNavigate }) {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const portalLinks = user.role === ADMIN_ROLE ? ADMIN_PORTAL_LINKS : PORTAL_LINKS;

  function handleLogout() {
    logout();
    showToast({ tone: 'info', title: 'Signed out', message: 'Your session has ended.' });
    navigate('/');
  }

  return (
    <aside
      className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}${open ? ' is-open' : ''}`}
      aria-label="Portal navigation"
    >
      <div className="sidebar__head">
        <span className="sidebar__plate">
          <img src="/logo.png" alt="" />
        </span>
        <span className="sidebar__brand-text">
          <strong>COMSATS</strong>
          <span>Abbottabad</span>
        </span>
        <button
          type="button"
          className="sidebar__collapse"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronsRight size={16} aria-hidden="true" />
          ) : (
            <ChevronsLeft size={16} aria-hidden="true" />
          )}
        </button>
      </div>

      <nav className="sidebar__nav">
        <p className="sidebar__section">Portal</p>
        {portalLinks.map((link) => (
          <SidebarLink key={link.to} link={link} onNavigate={onNavigate} />
        ))}

        {user.role === ADMIN_ROLE ? (
          <>
            <p className="sidebar__section">Administration</p>
            {ADMIN_LINKS.map((link) => (
              <SidebarLink key={link.to} link={link} onNavigate={onNavigate} />
            ))}
          </>
        ) : null}
      </nav>

      <div className="sidebar__foot">
        <div className="sidebar__user">
          <span className="sidebar__avatar" aria-hidden="true">
            {initials(user.name)}
          </span>
          <span className="sidebar__user-meta">
            <strong>{user.name}</strong>
            <span>{ROLE_LABELS[user.role] ?? user.role}</span>
          </span>
        </div>
        <button type="button" className="sidebar__logout" onClick={handleLogout}>
          <LogOut size={14} aria-hidden="true" />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
