import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { NAV_LINKS } from '../data/site.js';
import Logo from './Logo.jsx';

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const closeMenu = () => setOpen(false);

  function handleLogout() {
    logout();
    showToast({ tone: 'info', title: 'Signed out', message: 'Your session has ended.' });
    navigate('/');
  }

  return (
    <header className="site-header">
      <div className="container navbar">
        <Logo />

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          {open ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
        </button>

        <nav
          className={`nav${open ? ' is-open' : ''}`}
          id="primary-navigation"
          aria-label="Main"
          onClick={closeMenu}
        >
          <ul className="nav-links">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                  to={link.to}
                  end={link.end}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="nav-actions">
            {user ? (
              <>
                <NavLink className="user-chip" to="/dashboard">
                  <span className="user-chip__avatar" aria-hidden="true">
                    {initials(user.name)}
                  </span>
                  <span className="user-chip__name">{user.name}</span>
                </NavLink>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleLogout}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink className="btn btn-ghost btn-sm" to="/login">
                  Log in
                </NavLink>
                <NavLink className="btn btn-primary btn-sm" to="/signup">
                  Apply / Sign up
                </NavLink>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
