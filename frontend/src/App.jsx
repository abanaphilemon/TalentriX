import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ContentProvider } from './context/ContentContext.jsx';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import CtaSection from './components/CtaSection.jsx';
import About from './components/About.jsx';
import Reviews from './components/Reviews.jsx';
import Collaborators from './components/Collaborators.jsx';
import Contact from './components/Contact.jsx';
import Footer from './components/Footer.jsx';
import RoleSelectModal from './components/RoleSelectModal.jsx';
import AuthPage from './components/AuthPage.jsx';
import HubDashboard from './pages/HubDashboard.jsx';
import SeekerDashboard from './pages/SeekerDashboard.jsx';
import PortfolioPage from './pages/PortfolioPage.jsx';
import EmployerDashboard from './pages/EmployerDashboard.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import AdminLoginPage from './pages/AdminLoginPage.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || 'demo-client-id.apps.googleusercontent.com';

// Routes to the correct dashboard based on role. Blank placeholders for now.
const DASHBOARDS = {
  hub: '/dashboard/hub',
  seeker: '/dashboard/seeker',
  employer: '/dashboard/employer',
  admin: '/admin',
};

// Guard: redirects to the correct dashboard page for the logged-in role.
function RequireRole({ role, children }) {
  const { user, role: userRole, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Navigate to="/" replace />;

  if (userRole !== role) {
    // Logged in but wrong role → send to their own dashboard
    const target = DASHBOARDS[userRole] || '/';
    return <Navigate to={target} replace />;
  }

  return children;
}

// Landing page (current layout)
function LandingPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  // After successful login/register, route to the user's role dashboard
  useEffect(() => {
    if (user && role && DASHBOARDS[role]) {
      navigate(DASHBOARDS[role], { replace: true });
    }
  }, [user, role, navigate]);

  return (
    <>
      <Header />
      <main>
        <Hero />
        <CtaSection />
        <About />
        <Reviews />
        <Collaborators />
        <Contact />
      </main>
      <Footer />
    </>
  );
}

// Admin route — private URL. Uses its own session (independent from the
// public-site login), so opening the landing page in another tab never syncs
// with the admin panel.
function AdminRoute() {
  const { adminUser, adminRole, loading } = useAuth();

  if (loading) return null;

  if (adminUser && adminRole === 'admin') {
    return <AdminDashboard />;
  }

  if (adminUser && adminRole !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <AdminLoginPage />;
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <ContentProvider>
          <BrowserRouter>
            <Routes>
              {/* Landing page */}
              <Route
                path="/"
                element={
                  <>
                    <LandingPage />
                    {/* Two-step auth flow:
                        1) RoleSelectModal — user picks hub/seeker/employer
                        2) AuthPage         — modern login/register */}
                    <RoleSelectModal />
                    <AuthPage />
                  </>
                }
              />

              {/* Registration page — reached via a hub's unique link (e.g. /register?ref=abc123) */}
              <Route path="/register" element={<RegisterPage />} />

              {/* Public portfolio page — auto-generated from a job seeker's profile */}
              <Route path="/portfolio/:id" element={<PortfolioPage />} />

              {/* Role-specific dashboards (blank placeholders) */}
              <Route
                path="/dashboard/hub"
                element={
                  <RequireRole role="hub">
                    <HubDashboard />
                  </RequireRole>
                }
              />
              <Route
                path="/dashboard/seeker"
                element={
                  <RequireRole role="seeker">
                    <SeekerDashboard />
                  </RequireRole>
                }
              />
              <Route
                path="/dashboard/employer"
                element={
                  <RequireRole role="employer">
                    <EmployerDashboard />
                  </RequireRole>
                }
              />
              <Route
                path="/admin"
                element={
                  <AdminRoute />
                }
              />

              {/* Catch-all → landing */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ContentProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
