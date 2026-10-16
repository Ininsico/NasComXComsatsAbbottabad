import { Outlet } from 'react-router-dom';
import Footer from './Footer.jsx';
import Navbar from './Navbar.jsx';

export default function Layout() {
  return (
    <div className="page">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navbar />
      <main className="page__main" id="main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
