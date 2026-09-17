import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Network,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useContent } from '../context/ContentContext.jsx';
import OtpEntry from '../components/OtpEntry.jsx';

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, role, selectRole, registerWithEmail, signOut } = useAuth();

  const ref = searchParams.get('ref') || '';
  const [showPw, setShowPw] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [verify, setVerify] = useState(null); // { email, sent } while the code step is open

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();

  // Lock role to seeker for hub-link registrations, but only if not already logged in
  useEffect(() => {
    if (ref && !user) selectRole('seeker');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  const onSubmit = async (data) => {
    setSubmitError('');
    if (data.password !== data.confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }
    if (!data.terms) {
      setSubmitError('Please accept the Terms & Conditions to continue.');
      return;
    }
    const res = await registerWithEmail({ ...data, hubRef: ref, termsAccepted: !!data.terms });
    if (!res.ok) {
      setSubmitError(res.error);
      return;
    }
    if (res.verification?.needed) {
      setVerify({ email: data.email, sent: res.verification.sent });
      return;
    }
    setSuccess(true);
    const isEmployer = res.user?.role === 'employer';
    setTimeout(() => navigate(isEmployer ? '/dashboard/employer' : '/onboarding', { replace: true }), 800);
  };

  const inputCls = (err) =>
    `w-full pl-10 pr-4 py-3 rounded-xl bg-white border outline-none transition-all ${
      err
        ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200'
        : 'border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30'
    }`;

  if (verify) {
    return (
      <AuthShell>
        <OtpEntry
          purpose="verify"
          email={verify.email}
          sentOnOpen={verify.sent}
          role={role}
          onSuccess={() => {
            setSuccess(true);
            const isEmployer = role === 'employer';
            setTimeout(() => navigate(isEmployer ? '/dashboard/employer' : '/onboarding', { replace: true }), 800);
          }}
          onBack={() => {
            signOut();
            setVerify(null);
            setSubmitError('Email not verified. You can log in again to receive a fresh code.');
          }}
        />
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell>
        <div className="text-center py-10">
          <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="font-display text-2xl font-bold text-secondary">Account created!</h1>
          <p className="text-secondary/60 mt-2">Setting up your portfolio…</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      {/* Logged-in notice */}
      {user && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm mb-6">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            You are already logged in as <strong>{user.name || user.email}</strong>. You can view this page but will need to{' '}
            <button onClick={() => { signOut(); navigate('/', { replace: true }); }} className="underline font-semibold hover:text-amber-900">
              log out
            </button>{' '}
            first to create a new account.
          </span>
        </div>
      )}

      {/* Hub-link banner */}
      {ref && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/15 border border-primary/30 text-secondary text-sm mb-6">
          <Network className="w-4 h-4 shrink-0" />
          You're joining a talent pool through an invited link.
        </div>
      )}

      <h1 className="font-display text-2xl md:text-3xl font-bold text-secondary">
        {ref ? 'Join the talent pool' : 'Create your account'}
      </h1>
      <p className="text-secondary/60 mt-1 mb-6">
        {ref ? 'Register as a job seeker through this link.' : 'Register as a job seeker.'}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FieldError label="Full Name" icon={User} err={errors.name}>
          <input
            className={inputCls(errors.name)}
            placeholder="Jane Doe"
            {...register('name', { required: 'Name is required' })}
          />
        </FieldError>

        <FieldError label="Email" icon={Mail} err={errors.email}>
          <input
            type="email"
            className={inputCls(errors.email)}
            placeholder="you@company.com"
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' },
            })}
          />
        </FieldError>

        <FieldError label="Password" icon={Lock} err={errors.password}>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              className={`${inputCls(errors.password)} pr-11`}
              placeholder="••••••••"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 6, message: 'At least 6 characters' },
              })}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-secondary/50 hover:text-secondary"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </FieldError>

        <FieldError label="Confirm Password" icon={Lock} err={errors.confirmPassword}>
          <input
            type={showPw ? 'text' : 'password'}
            className={inputCls(errors.confirmPassword)}
            placeholder="••••••••"
            {...register('confirmPassword', { required: 'Please confirm your password' })}
          />
        </FieldError>

        <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 accent-primary"
            {...register('terms', { required: 'Please accept the Terms & Conditions' })}
          />
          <span className="text-xs text-secondary/60 leading-relaxed">
            I have read and agree to the{' '}
            <Link to="/terms" className="underline font-semibold text-secondary hover:text-primary">
              Terms &amp; Conditions
            </Link>
            {' '}and verifiable identity policy.
          </span>
        </label>
        {errors.terms && <p className="text-xs text-red-600 -mt-1">{errors.terms.message}</p>}

        {submitError && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full justify-center disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Account'}
          {!isSubmitting && <ArrowRight className="w-4 h-4" />}
        </button>
      </form>

      <p className="mt-6 text-xs text-secondary/50 text-center">
        Already have an account?{' '}
        <button
          onClick={() => navigate('/', { replace: true })}
          className="underline hover:text-secondary font-medium"
        >
          Go to home
        </button>
      </p>
    </AuthShell>
  );
}

function AuthShell({ children }) {
  const { content } = useContent();
  const branding = content.branding || {};
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-hero-gradient">
      <div className="glass rounded-3xl shadow-2xl w-full max-w-md p-5 sm:p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center overflow-hidden">
            {branding.logo ? (
              <img src={branding.logo} alt={`${branding.name || 'TalentriX'} logo`} className="w-full h-full object-contain p-1.5" />
            ) : (
              <Network className="w-5 h-5 text-secondary" />
            )}
          </div>
          <span className="font-display font-bold text-secondary">{branding.name || 'TalentriX'}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldError({ label, icon: Icon, err, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-secondary mb-1.5">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40 pointer-events-none" />
        {children}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err.message}</p>}
    </div>
  );
}
