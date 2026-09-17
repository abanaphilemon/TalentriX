import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, RefreshCw, Loader2, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const DELIVERY_MSG =
  "We couldn't email the 6-digit code — the platform email service isn't configured. Ask the site administrator to check the SMTP settings.";

// 6-digit code entry shared by the sign-up and login flows.
export default function OtpEntry({ purpose, email, sentOnOpen, role, onSuccess, onBack, title, subtitle }) {
  const { verifyOtp, resendOtp } = useAuth();
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() =>
    sentOnOpen === false ? DELIVERY_MSG : ''
  );
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const inputs = useRef([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleChange = (i, val) => {
    const clean = String(val).replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) inputs.current[i + 1]?.focus();
    setError('');
  };

  const handleKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const handlePaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const nums = text.replace(/\D/g, '').slice(0, 6).split('');
    if (nums.length) {
      e.preventDefault();
      const next = Array(6).fill('');
      nums.forEach((d, i) => { next[i] = d; });
      setDigits(next);
      inputs.current[Math.min(nums.length, 5)]?.focus();
    }
  };

  const submit = async (e) => {
    e?.preventDefault();
    const code = digits.join('');
    if (code.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    const res = await verifyOtp({ code, purpose, email, role });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setDigits(Array(6).fill(''));
      inputs.current[0]?.focus();
      return;
    }
    onSuccess?.(res.user);
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError('');
    const res = await resendOtp({ purpose, email, role });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDigits(Array(6).fill(''));
    setCooldown(60);
    setInfo(res.sent ? 'A new code has been sent to your email.' : DELIVERY_MSG);
    inputs.current[0]?.focus();
  };

  return (
    <div>
      <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
        <ShieldCheck className="w-7 h-7 text-emerald-600" />
      </div>
      <h1 className="font-display text-2xl font-bold text-secondary">{title || 'Enter your code'}</h1>
      <p className="text-sm text-secondary/60 mt-1 mb-6">
        {subtitle || (
          <>
            We sent a 6-digit code to <strong className="text-secondary">{email}</strong>. It expires in 10 minutes.
          </>
        )}
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm mb-4">
          <Mail className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{info}</span>
        </div>
      )}

      <form onSubmit={submit}>
        <div className="flex gap-2 justify-between" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKey(i, e)}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              className="w-full aspect-square text-center text-xl font-bold bg-white border border-secondary/15 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full justify-center mt-6 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {purpose === 'login' ? 'Verify & Sign In' : 'Verify Account'}
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
        {onBack && (
          <button onClick={onBack} className="text-sm font-semibold text-secondary/50 hover:text-secondary">
            Back
          </button>
        )}
      </div>
    </div>
  );
}