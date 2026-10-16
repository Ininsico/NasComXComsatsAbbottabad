import { LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { ROLE_LABELS } from '../data/site.js';
import Sidebar from './Sidebar.jsx';

const COLLAPSE_KEY = 'comsats.sidebar.collapsed';

function initials(name) {
  return name
    .replace(/^(Prof\.|Dr\.|Ms\.|Mr\.|Mrs\.)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [drawerOpen, setDrawerOpen] = useState(false);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
  }

  function handleLogout() {
    logout();
    showToast({ tone: 'info', title: 'Signed out', message: 'Your session has ended.' });
    navigate('/');
  }

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        open={drawerOpen}
        onNavigate={() => setDrawerOpen(false)}
      />

      {drawerOpen ? (
        <button
          type="button"
          className="sidebar__scrim"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="btn btn-secondary btn-icon app-topbar__menu"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} aria-hidden="true" />
          </button>

          <div className="app-topbar__titles">
            <h1>Campus portal</h1>
            <p>
              {ROLE_LABELS[user.role] ?? user.role} · {user.email}
            </p>
          </div>

          <div className="app-topbar__actions">
            <span className="user-chip">
              <span className="user-chip__avatar" aria-hidden="true">
                {initials(user.name)}
              </span>
              <span className="user-chip__name">{user.name}</span>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={handleLogout}
              aria-label="Log out"
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="app-content" id="main-content">
          <div className="app-content__inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
