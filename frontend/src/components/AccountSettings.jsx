import { useEffect, useRef, useState } from 'react';
import { Mail, Lock, KeyRound, Loader2, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';

function Field({ label, icon: Icon, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-secondary mb-1.5">{label}</label>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40 pointer-events-none" />
        )}
        {children}
      </div>
    </div>
  );
}

function Status({ msg }) {
  if (!msg) return null;
  return (
    <p
      className={`inline-flex items-center gap-1.5 text-sm mt-3 ${
        msg.ok ? 'text-green-700' : 'text-red-600'
      }`}
    >
      {msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />} {msg.text}
    </p>
  );
}

// Shared security settings for hub, employer and seeker dashboards: change the
// account email (confirmed with an emailed code sent to the NEW address) and
// change the password (current password required).
export default function AccountSettings({ user, token, onUpdated }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  useEffect(() => () => clearInterval(cooldownRef.current), []);

  const startCooldown = () => {
    setCooldown(60);
    clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    if (!email.trim()) {
      setEmailMsg({ ok: false, text: 'Enter the new email address first.' });
      return;
    }
    setSending(true);
    setEmailMsg(null);
    try {
      const res = await fetch(`${API_URL}/profile/email/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newEmail: email.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not send the code.');
      setCodeSent(true);
      setCode('');
      setEmailMsg({ ok: true, text: d.message });
      startCooldown();
    } catch (e) {
      setEmailMsg({ ok: false, text: e.message });
    } finally {
      setSending(false);
    }
  };

  const confirmCode = async () => {
    if (!code.trim()) {
      setEmailMsg({ ok: false, text: 'Enter the code you received by email.' });
      return;
    }
    setConfirming(true);
    setEmailMsg(null);
    try {
      const res = await fetch(`${API_URL}/profile/email/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: code.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not confirm the code.');
      if (onUpdated) onUpdated({ email: email.trim().toLowerCase() });
      setEmailMsg({ ok: true, text: d.message });
      setEmail('');
      setCode('');
      setCodeSent(false);
    } catch (e) {
      setEmailMsg({ ok: false, text: e.message });
    } finally {
      setConfirming(false);
    }
  };

  const savePassword = async () => {
    setPwMsg(null);
    if (pw.next.length < 6) {
      setPwMsg({ ok: false, text: 'New password must be at least 6 characters.' });
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwMsg({ ok: false, text: 'New password and confirmation do not match.' });
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch(`${API_URL}/profile/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not update the password.');
      setPwMsg({ ok: true, text: d.message });
      setPw({ current: '', next: '', confirm: '' });
    } catch (e) {
      setPwMsg({ ok: false, text: e.message });
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* ── Email address ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-secondary/10 p-8">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-5 h-5 text-primary" />
          <h3 className="font-display text-lg font-bold text-secondary">Email address</h3>
        </div>
        <p className="text-sm text-secondary/60 mb-5">
          Used for logins and security codes. You confirm the change with a code sent to your new address.
        </p>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/5 text-sm text-secondary mb-5">
          <span className="font-semibold">{user?.email || '—'}</span>
          <span className="inline-flex items-center gap-1 text-xs text-green-700">
            <ShieldCheck className="w-3.5 h-3.5" /> verified
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 items-end">
          <Field label="New email address">
            <input
              className={inputCls}
              type="email"
              autoComplete="off"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <div>
            <button
              type="button"
              onClick={sendCode}
              disabled={sending || cooldown > 0}
              className="btn-primary w-full inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : cooldown > 0 ? (
                `${cooldown}s`
              ) : codeSent ? (
                'Resend code'
              ) : (
                'Send code'
              )}
            </button>
          </div>
        </div>

        {codeSent && (
          <div className="mt-4">
            <Field label="6-digit code" icon={KeyRound}>
              <input
                className={`${inputCls} pl-9 tracking-[0.3em]`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <button
              type="button"
              onClick={confirmCode}
              disabled={confirming}
              className="btn-primary mt-3 inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Verify & change email
            </button>
          </div>
        )}
        <Status msg={emailMsg} />
      </div>

      {/* ── Password ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-secondary/10 p-8">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-5 h-5 text-primary" />
          <h3 className="font-display text-lg font-bold text-secondary">Password</h3>
        </div>
        <p className="text-sm text-secondary/60 mb-5">
          Choose a strong password you don't use anywhere else.
        </p>

        <div className="space-y-3">
          <Field label="Current password" icon={Lock}>
            <input
              className={`${inputCls} pl-9`}
              type="password"
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
            />
          </Field>
          <Field label="New password" icon={Lock}>
            <input
              className={`${inputCls} pl-9`}
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={pw.next}
              onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
            />
          </Field>
          <Field label="Confirm new password" icon={Lock}>
            <input
              className={`${inputCls} pl-9`}
              type="password"
              autoComplete="new-password"
              value={pw.confirm}
              onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
            />
          </Field>
          <button
            type="button"
            onClick={savePassword}
            disabled={pwSaving}
            className="btn-primary w-full inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Update password
          </button>
        </div>
        <Status msg={pwMsg} />
      </div>
    </div>
  );
}