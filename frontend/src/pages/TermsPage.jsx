import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ScrollText } from 'lucide-react';
import { useContent } from '../context/ContentContext.jsx';
import BrandBadge from '../components/BrandBadge.jsx';

const LAST_UPDATED = 'September 17, 2026';

const SECTIONS = [
  {
    title: '1. Acceptance of terms',
    body:
      'By creating an account on TalentriX you agree to these Terms & Conditions and our privacy practices. If you do not agree, do not register or use the platform. We may update these terms from time to time; continued use of the platform after changes take effect means you accept the updated terms.',
  },
  {
    title: '2. Eligibility and verifiable identity',
    body:
      'You must be at least 18 years old and able to form a binding contract. Because TalentriX connects vetted professionals with employers, you agree to provide accurate, truthful information and to verify your identity when asked. Falsifying your identity, credentials, experience, or references is grounds for immediate account termination.',
  },
  {
    title: '3. Account registration and email verification',
    body:
      'Every account requires a valid email address, and you must complete email verification using the code we send you before using your dashboard. You are responsible for keeping your login details safe and for every activity that happens on your account. One email address may only hold one account role on the platform.',
  },
  {
    title: '4. Two-factor authentication (2FA)',
    body:
      'All new accounts have two-factor authentication enabled. When signing in you will be asked for a one-time code sent to your registered email. Codes are valid for 10 minutes and limited to a small number of attempts. If you lose access to your email, contact support to restore your account.',
  },
  {
    title: '5. Account interviews',
    body:
      'Hubs and job seekers verify their email and must complete a short onboarding interview before full dashboard access is granted. Employers may use the platform immediately. We may disable or remove any account for conduct that endangers trust, safety, or quality on the platform.',
  },
  {
    title: '6. Appropriate use',
    body:
      'You agree not to misuse the platform: no spam, fraudulent job posts or applications, harassment, impersonation, scraping, uploading malicious files, sharing credentials, or attempting to disrupt services. AI-assisted applications must accurately represent your own skills and experience.',
  },
  {
    title: '7. Skills and learning content',
    body:
      'AI-generated skill-gap analyses and learning modules are provided as guidance only. You remain responsible for evaluating your own readiness and for any decisions you make based on this content.',
  },
  {
    title: '8. Termination',
    body:
      'You may delete your account at any time. We may suspend or terminate accounts that violate these terms, and we may disable accounts that are inactive for an extended period. Termination does not affect any rights already accrued.',
  },
  {
    title: '9. Disclaimers and liability',
    body:
      'The platform is provided "as is". We do not guarantee job placement, outcomes, or uninterrupted availability. To the maximum extent permitted by law, TalentriX is not liable for indirect, incidental, or consequential damages arising from your use of the platform.',
  },
  {
    title: '10. Governing law and contact',
    body:
      'These terms are governed by applicable law. Questions about these terms or your account can be directed to our support team through the Contact section of the site.',
  },
];

export default function TermsPage() {
  const navigate = useNavigate();
  const { content } = useContent();
  const branding = content.branding || {};

  return (
    <div className="min-h-screen bg-hero-gradient px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <BrandBadge branding={branding} size="lg" pad="p-1.5" />
          <button
            onClick={() => navigate('/', { replace: true })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/80 border border-secondary/10 text-secondary text-sm font-semibold hover:bg-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to home
          </button>
        </div>

        <div className="glass rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-6 sm:p-10 border-b border-secondary/10">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center">
                <ScrollText className="w-5 h-5 text-primary" />
              </div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-secondary">Terms &amp; Conditions</h1>
            </div>
            <p className="text-xs text-secondary/50 mt-2">Last updated: {LAST_UPDATED}</p>
          </div>

          <div className="p-6 sm:p-10 space-y-7 max-h-[65vh] overflow-y-auto">
            {SECTIONS.map((s) => (
              <section key={s.title}>
                <h2 className="font-display font-bold text-secondary mb-1.5">{s.title}</h2>
                <p className="text-sm text-secondary/70 leading-relaxed">{s.body}</p>
              </section>
            ))}

            <div className="rounded-2xl bg-primary/10 border border-primary/20 p-5">
              <p className="text-sm text-secondary/80 leading-relaxed">
                By checking the box during registration you confirm that you have read, understood, and agree to be bound
                by these Terms &amp; Conditions. This confirmation is stored on your account.
              </p>
            </div>

            <div className="pt-2">
              <Link
                to="/register"
                className="btn-primary inline-flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                Go to registration
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-secondary/40">
          © {new Date().getFullYear()} {branding.name || 'TalentriX'}. Questions? Reach us through the Contact section.
        </p>
      </div>
    </div>
  );
}