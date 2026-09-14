import { Component, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'https://talentri-x.vercel.app/api';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ContentProvider } from './context/ContentContext.jsx';
import { Hourglass, XCircle, Ban, AlertTriangle, LogOut, Home } from 'lucide-react';
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
import OnboardingPage from './pages/OnboardingPage.jsx';
import InterviewSchedulingPage from './pages/InterviewSchedulingPage.jsx';
import VideoCallPage from './pages/VideoCallPage.jsx';

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || 'demo-client-id.apps.googleusercontent.com';

const DASHBOARDS = {
  hub: '/dashboard/hub',
  seeker: '/dashboard/seeker',
  employer: '/dashboard/employer',
  admin: '/admin',
};

// ── Error boundary: catches render crashes in any child route. ──
class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-hero-gradient">
          <div className="glass rounded-3xl shadow-2xl w-full max-w-md p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="font-display text-2xl font-bold text-secondary">Something went wrong</h1>
            <p className="text-sm text-secondary/60 mt-2 leading-relaxed">
              An unexpected error occurred. You can try going back to the home page.
            </p>
            <button
              onClick={() => { this.setState({ err: null }); window.location.href = '/'; }}
              className="btn-primary mt-6 inline-flex items-center gap-2"
            >
              <Home className="w-4 h-4" /> Go to home page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── 404 page ──
function NotFoundPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const home = user && role && DASHBOARDS[role] ? (user.onboardingDone ? DASHBOARDS[role] : '/onboarding') : '/';
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-hero-gradient">
      <div className="glass rounded-3xl shadow-2xl w-full max-w-md p-8 text-center">
        <div className="text-6xl font-display font-bold text-primary/30 mb-4">404</div>
        <h1 className="font-display text-2xl font-bold text-secondary">Page not found</h1>
        <p className="text-sm text-secondary/60 mt-2 leading-relaxed">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="flex flex-col gap-2 mt-7">
          <button onClick={() => navigate(home)} className="btn-primary w-full justify-center inline-flex items-center gap-2">
            <Home className="w-4 h-4" /> Go to {user ? 'dashboard' : 'home'}
          </button>
          <button onClick={() => navigate(-1)} className="btn-secondary w-full justify-center">
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Account status gate (pending / rejected / disabled) ──
function AccountStatus({ user }) {
  const navigate = useNavigate();
  const { updateUser, signOut } = useAuth();
  const token = localStorage.getItem('tbai.token');

  useEffect(() => {
    if (!token) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          updateUser({ status: d.user.status, active: d.user.active, interviewDone: d.user.interviewDone });
        }
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let icon = Hourglass;
  let title = 'Awaiting admin approval';
  let msg =
    'Your account has been created and is already in the review queue. An administrator will approve it shortly — you will get full access to your dashboard once approved.';

  if (user.active === false) {
    icon = Ban;
    title = 'Account disabled';
    msg = 'This account has been disabled by an administrator. Contact support if you believe this is a mistake.';
  } else if (user.status === 'rejected') {
    icon = XCircle;
    title = 'Account not approved';
    msg = 'Your registration was not approved by an administrator. Contact support if you believe this is a mistake.';
  }

  const Icon = icon;
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-hero-gradient">
      <div className="glass rounded-3xl shadow-2xl w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-5">
          <Icon className="w-8 h-8 text-secondary" />
        </div>
        <h1 className="font-display text-2xl font-bold text-secondary">{title}</h1>
        <p className="text-sm text-secondary/60 mt-2 leading-relaxed">{msg}</p>
        <div className="flex flex-col gap-2 mt-7">
          <button onClick={() => navigate('/', { replace: true })} className="btn-secondary w-full justify-center">
            Back to home
          </button>
          <button
            onClick={() => { signOut(); navigate('/', { replace: true }); }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-secondary/50 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Guard: role-specific dashboards ──
function RequireRole({ role, children }) {
  const { user, role: userRole, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;

  const homeFor = (r) => r === 'admin' ? '/admin' : (user.onboardingDone ? DASHBOARDS[r] || '/' : '/onboarding');

  if (userRole !== role) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-hero-gradient">
        <div className="glass rounded-3xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="font-display text-2xl font-bold text-secondary">Wrong account</h1>
          <p className="text-sm text-secondary/60 mt-2 leading-relaxed">
            You are logged in as <span className="font-semibold capitalize">{userRole}</span>. This page requires a <span className="font-semibold capitalize">{role}</span> account.
          </p>
          <div className="flex flex-col gap-2 mt-7">
            <button onClick={() => navigate(homeFor(userRole), { replace: true })} className="btn-primary w-full justify-center inline-flex items-center gap-2">
              <Home className="w-4 h-4" /> Go to my dashboard
            </button>
            <button onClick={() => { signOut(); navigate('/', { replace: true }); }} className="btn-secondary w-full justify-center inline-flex items-center gap-2">
              <LogOut className="w-4 h-4" /> Log out &amp; switch account
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!user.onboardingDone) return <Navigate to="/onboarding" replace />;
  if (user.active === false || (user.status && user.status !== 'approved'))
    return <AccountStatus user={user} />;
  if (!user.interviewDone) return <Navigate to="/interview" replace />;

  return children;
}

// ── Guard: interview scheduling page ──
function RequireInterview() {
  const { user, role, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;

  // Admins don't go through the interview step.
  if (role === 'admin') return <Navigate to="/admin" replace />;
  if (!user.onboardingDone) return <Navigate to="/onboarding" replace />;
  if (user.active === false || (user.status && user.status !== 'approved'))
    return <AccountStatus user={user} />;
  if (user.interviewDone) return <Navigate to={DASHBOARDS[role] || '/'} replace />;

  return <InterviewSchedulingPage />;
}

// ── Guard: onboarding page ──
function RequireOnboarding() {
  const { user, role, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;

  if (user.onboardingDone) {
    if (user.active === false || (user.status && user.status !== 'approved'))
      return <AccountStatus user={user} />;
    if (!user.interviewDone) return <Navigate to="/interview" replace />;
    return <Navigate to={DASHBOARDS[role] || '/'} replace />;
  }

  return <OnboardingPage />;
}

// ── Guard: registration page ──
function RequireGuest() {
  const { user, role, loading } = useAuth();

  if (loading) return null;

  return <RegisterPage />;
}

// ── Guard: video call page ──
function RequireCallAuth() {
  const { user, role, loading, adminRole } = useAuth();

  if (loading) return null;

  const isUserAuth = !!user && role;
  const isAdminAuth = adminRole === 'admin';

  if (!isUserAuth && !isAdminAuth) return <Navigate to="/" replace />;

  return <VideoCallPage />;
}

// ── Landing page ──
function LandingPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && role && DASHBOARDS[role]) {
      navigate(user.onboardingDone ? DASHBOARDS[role] : '/onboarding', { replace: true });
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

// ── Admin route: separate session from the public site ──
function AdminRoute() {
  const { adminUser, adminRole, loading, user, role } = useAuth();

  if (loading) return null;

  // Logged-in as admin → show the CMS.
  if (adminUser && adminRole === 'admin') return <AdminDashboard />;

  // Admin token exists but no longer valid → clear and show login.
  if (adminUser && adminRole !== 'admin') return <Navigate to="/" replace />;

  // Regular user who is not an admin → redirect away from /admin entirely.
  if (user && role && role !== 'admin') {
    return <Navigate to={DASHBOARDS[role] || '/'} replace />;
  }

  return <AdminLoginPage />;
}

// ── Shell: wraps every page-level component to render children, catching
//    scroll position and layout. ──
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <ContentProvider>
          <BrowserRouter>
            <ScrollToTop />
            <RouteErrorBoundary>
              <Routes>
                {/* Public landing page */}
                <Route
                  path="/"
                  element={
                    <>
                      <LandingPage />
                      <RoleSelectModal />
                      <AuthPage />
                    </>
                  }
                />

                {/* Registration — only for guests */}
                <Route path="/register" element={<RequireGuest><RegisterPage /></RequireGuest>} />

                {/* Onboarding — only for users who haven't finished it yet */}
                <Route path="/onboarding" element={<RequireOnboarding />} />

                {/* Interview scheduling — only for approved, onboarded, non-admin users who haven't completed it */}
                <Route path="/interview" element={<RequireInterview />} />

                {/* Video call room — requires authentication (user or admin) */}
                <Route path="/call/:id" element={<RequireCallAuth />} />

                {/* Public portfolio */}
                <Route path="/portfolio/:id" element={<PortfolioPage />} />

                {/* Role-specific dashboards */}
                <Route path="/dashboard/hub" element={<RequireRole role="hub"><HubDashboard /></RequireRole>} />
                <Route path="/dashboard/seeker" element={<RequireRole role="seeker"><SeekerDashboard /></RequireRole>} />
                <Route path="/dashboard/employer" element={<RequireRole role="employer"><EmployerDashboard /></RequireRole>} />

                {/* Admin panel — separate session */}
                <Route path="/admin" element={<AdminRoute />} />

                {/* 404 — unknown routes */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </RouteErrorBoundary>
          </BrowserRouter>
        </ContentProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
