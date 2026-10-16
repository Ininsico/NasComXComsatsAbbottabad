import { ArrowLeft, House } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero.jsx';

export default function NotFound() {
  return (
    <>
      <PageHero title="Page not found" crumb="404" />
      <section className="section">
        <div className="container">
          <div className="notfound">
            <div>
              <p className="notfound__code">404</p>
              <h2>We could not find that page</h2>
              <p className="muted" style={{ fontSize: '0.875rem' }}>
                The link may be broken, or the page may have been moved. Try one of these instead.
              </p>
              <div className="btn-row" style={{ justifyContent: 'center' }}>
                <Link className="btn btn-primary" to="/">
                  <House size={15} aria-hidden="true" />
                  Back to home
                </Link>
                <Link className="btn btn-secondary" to="/contact">
                  <ArrowLeft size={15} aria-hidden="true" />
                  Contact us
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
