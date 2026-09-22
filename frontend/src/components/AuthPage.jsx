import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleLogin } from '@react-oauth/google';
import {
  X,
  ArrowLeft,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Network,
  UserSearch,
  Briefcase,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useContent } from '../context/ContentContext.jsx';
import { useGoogleClient } from '../context/GoogleClientContext.jsx';
import { roles } from '../data/content.js';
import OtpEntry from './OtpEntry.jsx';
import ResetPassword from './ResetPassword.jsx';

// Inline Google "G" mark — used in the fallback button when GIS hasn't loaded
const GoogleG = () => (
  <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C40.9 36 44 30.5 44 24c0-1.2-.1-2.3-.4-3.5z"
    />
  </svg>
);

// True if a real Google OAuth client ID is available (from the admin panel
// or VITE_GOOGLE_CLIENT_ID) — not just the demo placeholder.
function hasClientId(configured) {
  return configured;
}

// Hero copy + icon for the left column — switches based on role
function roleBranding(roleId, brandName) {
  const r = roles.find((x) => x.id === roleId);
  const Icon = r?.Icon || Network;
  return {
    Icon,
    title: r?.title || brandName,
    badge: r?.badge || 'Welcome',
    tagline:
      roleId === 'hub'
        ? 'Get a unique link to register your talent pool in minutes.'
        : roleId === 'seeker'
        ? 'Get matched with roles that fit your skills and ambitions.'
        : 'Source, screen, and hire exceptional people — faster than ever.',
  };
}

// Single field — used by the Login / Register forms
function Field({ label, type = 'text', placeholder, error, register, name, icon: Icon, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-secondary mb-2">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40 pointer-events-none" />
        )}
        <input
          type={type}
          placeholder={placeholder}
          {...register(name)}
          className={`w-full pl-10 ${children ? 'pr-10' : 'pr-4'} py-3 rounded-xl bg-white/80 border outline-none transition-all ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200'
              : 'border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30'
          }`}
        />
        {children}
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-600">{error.message}</p>
      )}
    </div>
  );
}

// Password field with show/hide toggle
function PasswordField(props) {
  const [show, setShow] = useState(false);
  return (
    <Field
      {...props}
      type={show ? 'text' : 'password'}
      icon={Lock}
    >
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary/50 hover:text-secondary transition-colors"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </Field>
  );
}

export default function AuthPage() {
  const {
    mode,
    role,
    closeAuth,
    backToRoles,
    signInWithGoogle,
    loginWithEmail,
    registerWithEmail,
  } = useAuth();

  const [tab, setTab] = useState('login');    // 'login' | 'register'
  const [submitError, setSubmitError] = useState('');
  const [otp, setOtp] = useState(null);        // { purpose, email, sent, role } while the code step is open
  const [resetView, setResetView] = useState(false); // forgot-password flow

  const { content } = useContent();
  const brandName = content.branding?.name || 'TalentriX';
  const { configured } = useGoogleClient();

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm();

  // Reset form + error whenever the modal opens
  useEffect(() => {
    if (mode === 'auth') {
      reset();
      setSubmitError('');
      setResetView(false);
    }
  }, [mode, reset]);

  const open = mode === 'auth';
  const { Icon, title, badge, tagline } = roleBranding(role, brandName);

  // ───── Submit handlers ─────
  const onSubmitLogin = async (data) => {
    setSubmitError('');
    const res = await loginWithEmail(data);
    if (!res.ok) setSubmitError(res.error);
    else if (res.requiresOtp) setOtp({ purpose: res.purpose || 'login', email: data.email, sent: res.sent, role });
  };

  const onSubmitRegister = async (data) => {
    setSubmitError('');
    if (data.password !== data.confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }
    if (!data.terms) {
      setSubmitError('Please accept the Terms & Conditions to continue.');
      return;
    }
    const res = await registerWithEmail({ ...data, termsAccepted: !!data.terms });
    if (!res.ok) setSubmitError(res.error);
    else if (res.verification?.needed) {
      setOtp({ purpose: 'verify', email: data.email, sent: res.verification.sent, role });
    }
  };

  // Google login — both tabs use the same handler
  const onGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await signInWithGoogle({
        idToken: credentialResponse.credential,
        termsAccepted: tab === 'register' ? getValues('terms') === true : false,
      });
      if (!res.ok) {
        setSubmitError(res.error || 'Google sign-in failed. Please try again.');
        return;
      }
      if (res.verification?.needed) {
        setOtp({ purpose: 'verify', email: '', sent: res.verification.sent, role });
      } else if (res.requiresOtp) {
        setOtp({ purpose: res.purpose || 'login', email: res.email, sent: res.sent, role });
      }
    } catch (err) {
      setSubmitError('Google sign-in failed. Please try again.');
    }
  };

  const onGoogleError = () =>
    setSubmitError('Google sign-in was cancelled or failed.');

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeAuth}
            className="fixed inset-0 z-[60] bg-secondary/70 backdrop-blur-md"
          />

          {/* Dialog — wider than the role modal so it can hold the side panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-page-title"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain pointer-events-none"
          >
            <div className="min-h-full flex flex-col justify-center pointer-events-none p-4">
            <div className="glass rounded-3xl shadow-2xl w-full max-w-4xl pointer-events-auto relative overflow-x-hidden grid md:grid-cols-2">
              {/* ───── Left brand panel ───── */}
              <div className="relative bg-secondary text-tertiary p-8 md:p-10 hidden md:flex flex-col justify-between overflow-hidden">
                {/* Decorative gold blobs */}
                <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-primary/15 blur-3xl pointer-events-none" />

                <div className="relative">
                  <button
                    onClick={backToRoles}
                    className="inline-flex items-center gap-1 text-xs font-medium text-white/70 hover:text-primary transition-colors mb-8"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Change role
                  </button>

                  <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-6 shadow-lg shadow-primary/30">
                    <Icon className="w-7 h-7 text-secondary" />
                  </div>

                  <div className="text-[10px] font-bold tracking-widest uppercase text-primary mb-2">
                    {badge}
                  </div>
                  <h2 className="font-display text-3xl font-bold leading-tight">
                    {title}
                  </h2>
                  <p className="mt-3 text-white/70 text-sm leading-relaxed max-w-sm">
                    {tagline}
                  </p>

                  {/* Bullets — different copy per role */}
                  <ul className="mt-8 space-y-3 text-sm">
                    {(role === 'hub'
                      ? [
                          'Generate a unique registration link',
                          'Track sign-ups in real time',
                          'Endorse & rate talent in your pool',
                        ]
                      : role === 'seeker'
                      ? [
                          'Build a polished public portfolio',
                          'Screened & interviewed by our team',
                          'Privacy-first — you control who sees what',
                        ]
                      : [
                          'Pre-vetted candidates, ranked by skill fit',
                          'Secure E2E encrypted chat',
                          'Built-in video calls — no extra tools',
                        ]
                    ).map((b) => (
                      <li key={b} className="flex items-start gap-2 text-white/80">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="relative mt-8 pt-6 border-t border-white/10 text-xs text-white/50">
                  © {new Date().getFullYear()} {brandName}
                </div>
              </div>

              {/* ───── Right form panel ───── */}
              <div className="relative p-5 sm:p-8 md:p-10">
                {/* Close (top-right) */}
                <button
                  onClick={closeAuth}
                  aria-label="Close"
                  className="absolute top-4 right-4 p-2 rounded-lg text-secondary/70 hover:bg-secondary/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Mobile back button */}
                <button
                  onClick={backToRoles}
                  className="md:hidden inline-flex items-center gap-1 text-xs font-medium text-secondary/70 hover:text-secondary transition-colors mb-4"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Change role
                </button>

                {/* Title */}
                <h3
                  id="auth-page-title"
                  className="font-display text-2xl md:text-3xl font-bold text-secondary"
                >
                  {tab === 'login' ? 'Welcome back' : 'Create your account'}
                </h3>
                <p className="text-sm text-secondary/60 mt-1 mb-6">
                  {tab === 'login'
                    ? 'Sign in to access your dashboard.'
                    : 'Just a few details and you\'re in.'}
                </p>

                {otp ? (
                  <OtpEntry
                    purpose={otp.purpose}
                    email={otp.email}
                    sentOnOpen={otp.sent}
                    role={otp.role || role}
                    onSuccess={closeAuth}
                    onBack={() => setOtp(null)}
                    title={otp.purpose === 'login' ? 'Check your inbox' : 'Verify your email'}
                  />
                ) : resetView ? (
                  <ResetPassword
                    defaultEmail={getValues('email')}
                    role={role}
                    onDone={() => setResetView(false)}
                    onBack={() => setResetView(false)}
                  />
                ) : (
                <>
                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-secondary/5 rounded-xl mb-6">
                  {['login', 'register'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setTab(t);
                        setSubmitError('');
                        reset();
                      }}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold capitalize transition-colors ${
                        tab === t
                          ? 'bg-primary text-secondary shadow-md'
                          : 'text-secondary/60 hover:text-secondary'
                      }`}
                    >
                      {t === 'login' ? 'Login' : 'Register'}
                    </button>
                  ))}
                </div>

                {/* ───── Google button ───── */}
                {hasClientId(configured) ? (
                  <div className="flex justify-center w-full">
                    <div className="w-full max-w-[320px]">
                      <GoogleLogin
                        onSuccess={onGoogleSuccess}
                        onError={onGoogleError}
                        useOneTap={false}
                        theme="outline"
                        size="large"
                        shape="pill"
                        text={tab === 'login' ? 'signin_with' : 'signup_with'}
                        logo_alignment="left"
                        width="220"
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setSubmitError(
                        'Google OAuth isn\'t configured yet. Add the Google OAuth client ID in the admin panel (Settings → Email → OAuth app), or set VITE_GOOGLE_CLIENT_ID in the frontend .env — see README.'
                      )
                    }
                    className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 rounded-full border border-secondary/15 bg-white text-secondary font-medium hover:bg-secondary/5 transition-colors"
                  >
                    <GoogleG />
                    Continue with Google
                  </button>
                )}

                {/* Divider */}
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-secondary/10" />
                  <span className="text-xs text-secondary/50 font-medium">
                    or {tab === 'login' ? 'sign in' : 'register'} with email
                  </span>
                  <div className="flex-1 h-px bg-secondary/10" />
                </div>

                {/* ───── Email/password form ───── */}
                <form
                  onSubmit={handleSubmit(tab === 'login' ? onSubmitLogin : onSubmitRegister)}
                  className="space-y-4"
                  noValidate
                >
                  {tab === 'register' && (
                    <Field
                      label="Full Name"
                      placeholder="Jane Doe"
                      icon={User}
                      name="name"
                      error={errors.name}
                      register={register}
                      rules={{ required: 'Name is required' }}
                    />
                  )}

                  <Field
                    label="Email"
                    type="email"
                    placeholder="you@company.com"
                    icon={Mail}
                    name="email"
                    error={errors.email}
                    register={register}
                    rules={{
                      required: 'Email is required',
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: 'Invalid email',
                      },
                    }}
                  />

                  <PasswordField
                    label="Password"
                    placeholder="••••••••"
                    name="password"
                    error={errors.password}
                    register={register}
                    rules={{
                      required: 'Password is required',
                      minLength: {
                        value: 6,
                        message: 'At least 6 characters',
                      },
                    }}
                  />

                  {tab === 'register' && (
                    <PasswordField
                      label="Confirm Password"
                      placeholder="••••••••"
                      name="confirmPassword"
                      error={errors.confirmPassword}
                      register={register}
                      rules={{
                        required: 'Please confirm your password',
                      }}
                    />
                  )}

                  {tab === 'login' && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => { setSubmitError(''); setResetView(true); }}
                        className="text-xs font-semibold text-secondary/70 hover:text-secondary transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}

                  {tab === 'register' && (
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
                  )}
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
                    {tab === 'login' ? 'Sign In' : 'Create Account'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

                <p className="mt-6 text-xs text-secondary/50 text-center">
                  By continuing, you agree to our{' '}
                  <Link to="/terms" className="underline hover:text-secondary">
                    Terms &amp; Conditions
                  </Link>
                  {' '}and{' '}
                  <a href="#" className="underline hover:text-secondary">
                    Privacy Policy
                  </a>
                  .
                </p>
                </>
                )}
              </div>
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}