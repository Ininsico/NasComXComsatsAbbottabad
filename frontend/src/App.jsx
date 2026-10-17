import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import DeployOverlay from './components/DeployOverlay.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import PublicOnlyRoute from './components/PublicOnlyRoute.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';
import About from './pages/About.jsx';
import Academics from './pages/Academics.jsx';
import Admin from './pages/Admin.jsx';
import Admissions from './pages/Admissions.jsx';
import Contact from './pages/Contact.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Deploy from './pages/Deploy.jsx';
import Documents from './pages/Documents.jsx';
import Faculty from './pages/Faculty.jsx';
import Home from './pages/Home.jsx';
import Knowledge from './pages/Knowledge.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Payments from './pages/Payments.jsx';
import Profile from './pages/Profile.jsx';
import Signup from './pages/Signup.jsx';
import Voice from './pages/Voice.jsx';
import './App.css';

export default function App() {
  return (
    <>
      <ScrollToTop />
      <DeployOverlay />
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

        {/* Always reachable, signed in or not: the deploy pipeline points here. */}
        <Route path="deploy" element={<Deploy />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="voice" element={<Voice />} />
          <Route path="documents" element={<Documents />} />
          <Route path="payments" element={<Payments />} />
          <Route
            path="admin"
            element={
              <ProtectedRoute roles={['admin']}>
                <Admin />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </>
  );
}
