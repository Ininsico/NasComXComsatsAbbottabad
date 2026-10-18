import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import DeployOverlay from './components/DeployOverlay.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import PublicOnlyRoute from './components/PublicOnlyRoute.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';
import About from './pages/About.jsx';
import Admin from './pages/Admin.jsx';
import Appointments from './pages/Appointments.jsx';
import Audit from './pages/Audit.jsx';
import Companies from './pages/Companies.jsx';
import CompanyDetail from './pages/CompanyDetail.jsx';
import Contact from './pages/Contact.jsx';
import ContactDetail from './pages/ContactDetail.jsx';
import Contacts from './pages/Contacts.jsx';
import Crm from './pages/Crm.jsx';
import CrmLead from './pages/CrmLead.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Deploy from './pages/Deploy.jsx';
import Features from './pages/Features.jsx';
import GoogleAuth from './pages/GoogleAuth.jsx';
import Home from './pages/Home.jsx';
import Inbox from './pages/Inbox.jsx';
import Integrations from './pages/Integrations.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Payments from './pages/Payments.jsx';
import Pricing from './pages/Pricing.jsx';
import Profile from './pages/Profile.jsx';
import Recovery from './pages/Recovery.jsx';
import Signup from './pages/Signup.jsx';
import Subscription from './pages/Subscription.jsx';
import Voice from './pages/Voice.jsx';
import WorkspaceSettings from './pages/WorkspaceSettings.jsx';
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
          <Route path="features" element={<Features />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />

        {/* Where the Google sign-in callback lands. Public by design: the session only
            exists once the token in the fragment has been adopted. */}
        <Route path="auth/google" element={<GoogleAuth />} />

        {/* Always reachable, signed in or not: the deploy pipeline points here. */}
        <Route path="deploy" element={<Deploy />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="crm" element={<Crm />} />
          <Route path="crm/:id" element={<CrmLead />} />
          <Route path="companies" element={<Companies />} />
          <Route path="companies/:id" element={<CompanyDetail />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="contacts/:id" element={<ContactDetail />} />
          <Route path="recovery" element={<Recovery />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="audit" element={<Audit />} />
          <Route path="subscription" element={<Subscription />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="settings" element={<WorkspaceSettings />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="voice" element={<Voice />} />
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
