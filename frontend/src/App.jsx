import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext.jsx';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import CtaSection from './components/CtaSection.jsx';
import About from './components/About.jsx';
import Testimonials from './components/Testimonials.jsx';
import Collaborators from './components/Collaborators.jsx';
import Contact from './components/Contact.jsx';
import Footer from './components/Footer.jsx';
import RoleSelectModal from './components/RoleSelectModal.jsx';
import AuthPage from './components/AuthPage.jsx';

// Read the OAuth client ID from env. Falls back to a placeholder so the
// <GoogleOAuthProvider /> doesn't crash before the user fills in .env.
const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || 'demo-client-id.apps.googleusercontent.com';

// Root layout — provider tree wraps every page so auth + GIS are available globally
export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <div className="min-h-screen relative overflow-hidden">
          <Header />
          <main>
            <Hero />
            <CtaSection />
            <About />
            <Testimonials />
            <Collaborators />
            <Contact />
          </main>
          <Footer />

          {/* Two-step auth flow:
              1) RoleSelectModal — user picks hub/seeker/employer
              2) AuthPage         — modern login/register with Google + email */}
          <RoleSelectModal />
          <AuthPage />
        </div>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}