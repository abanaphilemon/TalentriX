import { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Loader2,
  Mail,
  AlertCircle,
  ArrowLeft,
  KeyRound,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const DELIVERY_MSG =
  "We couldn't email the 6-digit code — the platform email service isn't configured. Ask the site administrator to check the SMTP settings.";
// Never reveal whether an account exists — the same message shows either way.
const GENERIC_MSG = (email) =>
  `If an account exists for ${email}, a 6-digit reset code is on its way. It expires in 10 minutes.`;

// Full "forgot password" flow, rendered inside the auth modal: enter the email,
// enter the emailed code, choose a new password, done.
export default function ResetPassword({ defaultEmail, role, onDone, onBack }) {
  const { requestPasswordReset, resetPassword, resendOtp } = useAuth();

  const [step, setStep] = useState('email'); // 'email' → 'code' → 'done'
  const [email, setEmail] = useState(defaultEmail || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const inputCls =
    'w-full px-4 py-3 rounded-xl bg-white/80 border outline-none transition-all text-sm ' +
    (error && step === 'code'
      ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200'
      : 'border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30');

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const submitEmail = async (e) => {
    e?.preventDefault();
    const addr = email.trim();
    if (!/.+@.+\..+/.test(addr)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await requestPasswordReset({ email: addr, role });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.sent === false) {
        setInfo(GENERIC_MSG(addr));
      } else {
        setInfo('A 6-digit reset code has been sent to your email. It expires in 10 minutes.');
      }
      setStep('code');
      setCooldown(60);
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e) => {
    e?.preventDefault();
    if (code.length !== 6) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    if (password.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await resetPassword({ code, email: email.trim(), role, password });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStep('done');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await resendOtp({ purpose: 'reset', email: email.trim(), role });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCooldown(60);
      setInfo(res.sent ? 'A new code has been sent to your email.' : DELIVERY_MSG);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
        <ShieldCheck className="w-7 h-7 text-emerald-600" />
      </div>
      <h1 className="font-display text-2xl md:text-3xl font-bold text-secondary">
        {step === 'done' ? 'Password updated' : 'Reset your password'}
      </h1>

      {step === 'email' && (
        <>
          <p className="text-sm text-secondary/60 mt-1 mb-6">
            Enter the email on your account. We'll send a 6-digit code so you can choose a new password.
          </p>
          <form onSubmit={submitEmail} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && submitEmail()}
                placeholder="you@company.com"
                className={`${inputCls} pl-10`}
                autoComplete="email"
                autoFocus
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="btn-primary w-full justify-center disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send reset code
            </button>
          </form>
          <div className="mt-5">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary/50 hover:text-secondary"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
            </button>
          </div>
        </>
      )}

      {step === 'code' && (
        <>
          <p className="text-sm text-secondary/60 mt-1 mb-2">
            We sent a 6-digit code to <strong className="text-secondary">{email}</strong>. Enter it and choose a new password.
          </p>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {info && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm mb-2">
              <Mail className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{info}</span>
            </div>
          )}

          <form onSubmit={submitReset} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-semibold text-secondary mb-2">6-digit code</label>
              <div className="flex gap-2 justify-between">
                {Array.from({ length: 6 }).map((_, i) => (
                  <input
                    key={i}
                    value={code[i] || ''}
                    onChange={(e) => {
                      const clean = String(e.target.value).replace(/\D/g, '').slice(-1);
                      const next = code.split('');
                      next[i] = clean;
                      setCode(next.join(''));
                      setError('');
                      if (clean && i < 5) document.getElementById(`rp-code-${i + 1}`)?.focus();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !code[i] && i > 0) {
                        document.getElementById(`rp-code-${i - 1}`)?.focus();
                      }
                    }}
                    onPaste={(e) => {
                      const nums = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
                      if (nums.length) {
                        e.preventDefault();
                        setCode(nums);
                        document.getElementById(`rp-code-${Math.min(nums.length, 5)}`)?.focus();
                      }
                    }}
                    id={`rp-code-${i}`}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    className="w-full aspect-square text-center text-xl font-bold bg-white border border-secondary/15 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-1">
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40 pointer-events-none" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="New password"
                  className={`${inputCls} pl-10 pr-10`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary/50 hover:text-secondary"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40 pointer-events-none" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(''); }}
                  placeholder="Confirm new password"
                  className={`${inputCls} pl-10 pr-10`}
                  autoComplete="new-password"
                />
              </div>
              <p className="text-xs text-secondary/50">At least 6 characters. You'll sign in with this from now on.</p>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full justify-center disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Reset password
            </button>
          </form>

          <div className="flex items-center justify-center gap-4 mt-5">
            <button
              onClick={resend}
              disabled={busy || cooldown > 0}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
            <button
              onClick={() => setStep('email')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary/50 hover:text-secondary"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Change email
            </button>
          </div>
        </>
      )}

      {step === 'done' && (
        <div className="text-center mt-2">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <p className="text-sm text-secondary/60">
            Your password was updated. You can now sign in with your new password.
          </p>
          <button
            onClick={onDone}
            className="btn-primary w-full justify-center mt-6"
          >
            Back to sign in
          </button>
        </div>
      )}
    </div>
  );
}