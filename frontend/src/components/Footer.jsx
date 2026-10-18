import { Mail, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BRAND, CONTACT, FOOTER_COLUMNS, NAV_LINKS } from '../data/site.js';
import Logo from './Logo.jsx';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-about">
            <Logo tagline="CRM" />
            <p style={{ marginTop: '0.875rem' }}>{BRAND.description}</p>
          </div>

          <div className="footer-col">
            <h3>Explore</h3>
            <ul>
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div className="footer-col" key={column.title}>
              <h3>{column.title}</h3>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="footer-col">
            <h3>Contact</h3>
            <ul className="footer-contact">
              <li>
                <MapPin size={15} aria-hidden="true" />
                <span>{CONTACT.address}</span>
              </li>
              <li>
                <Mail size={15} aria-hidden="true" />
                <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              </li>
              <li>
                <Mail size={15} aria-hidden="true" />
                <a href={`mailto:${CONTACT.sales}`}>{CONTACT.sales}</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>
            &copy; {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </p>
          <p>
            <Link to="/contact">Privacy</Link> &nbsp;·&nbsp; <Link to="/contact">Terms of use</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
