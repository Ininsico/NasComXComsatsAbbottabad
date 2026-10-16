import { Mail, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CONTACT, NAV_LINKS } from '../data/site.js';
import Logo from './Logo.jsx';

const ACADEMIC_LINKS = [
  'Faculty of Computing',
  'Faculty of Engineering',
  'Faculty of Sciences',
  'Faculty of Management',
];

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-about">
            <Logo tagline="Abbottabad Campus" />
            <p style={{ marginTop: '0.875rem' }}>
              A campus management platform for students, parents and faculty — results, attendance,
              fees and announcements in one place.
            </p>
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

          <div className="footer-col">
            <h3>Academics</h3>
            <ul>
              {ACADEMIC_LINKS.map((faculty) => (
                <li key={faculty}>
                  <Link to="/academics">{faculty}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-col">
            <h3>Contact</h3>
            <ul className="footer-contact">
              <li>
                <MapPin size={15} aria-hidden="true" />
                <span>{CONTACT.address}</span>
              </li>
              <li>
                <Phone size={15} aria-hidden="true" />
                <a href={`tel:${CONTACT.phone.replace(/\s/g, '')}`}>{CONTACT.phone}</a>
              </li>
              <li>
                <Mail size={15} aria-hidden="true" />
                <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} COMSATS Abbottabad. All rights reserved.</p>
          <p>
            <Link to="/contact">Privacy</Link> &nbsp;·&nbsp; <Link to="/contact">Terms of use</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
