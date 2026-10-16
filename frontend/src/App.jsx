import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import PublicOnlyRoute from './components/PublicOnlyRoute.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';
import About from './pages/About.jsx';
import Academics from './pages/Academics.jsx';
import Admissions from './pages/Admissions.jsx';
import Contact from './pages/Contact.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Faculty from './pages/Faculty.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Signup from './pages/Signup.jsx';
import './App.css';

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route
          element={
            <PublicOnlyRoute>
              <Layout />
            </PublicOnlyRoute>
          }
        >
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="academics" element={<Academics />} />
          <Route path="admissions" element={<Admissions />} />
          <Route path="faculty" element={<Faculty />} />
          <Route path="contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
        </Route>
      </Routes>
    </>
  );
}
