import { useEffect, useState } from 'react';
import {
  Mail,
  Key,
  Loader2,
  Save,
  Send,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';
const labelCls = 'block text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5';

function SecretField({ value, onChange, placeholder, saved, onClear }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          type={show ? 'text' : 'password'}
          className={`${inputCls} pr-9 font-mono`}
          value={value}
          onChange={onChange}
          placeholder={saved ? '•••••••• (saved — leave blank to keep)' : placeholder}
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-secondary/40 hover:text-secondary"
          aria-label={show ? 'Hide secret' : 'Show secret'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {saved && (
        <button
          type="button"
          onClick={onClear}
          title="Clear the saved value"
          className="inline-flex items-center px-3 rounded-xl border border-secondary/10 text-secondary/50 hover:text-red-600 hover:border-red-200 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function EmailConfig({ token }) {
  const [loading, setLoading] = useState(true);

  // Platform email
  const [provider, setProvider] = useState('smtp');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [email, setEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [pwTouched, setPwTouched] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyTouched, setApiKeyTouched] = useState(false);

  // OAuth apps (used by talents connecting their mailbox)
  const [oauth, setOauth] = useState({
    google: { clientId: '', clientSecret: '', hasSecret: false, redirectUri: '', cleared: false },
    microsoft: { clientId: '', clientSecret: '', hasSecret: false, redirectUri: '', cleared: false },
  });

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testBusy, setTestBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [emailRes, oauthRes] = await Promise.all([
        fetch(`${API_URL}/admin/config/email`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/admin/config/oauth`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (emailRes.ok) {
        const d = await emailRes.json();
        const v = d.value || {};
        setHost(v.host || '');
        setPort(Number(v.port || 587));
        setSecure(!!v.secure);
        setEmail(v.email || v.user || '');
        setFromName(v.fromName || '');
        setHasPassword(!!v.hasPassword);
        setPassword('');
        setPwTouched(false);
        setProvider(v.provider === 'brevo' ? 'brevo' : 'smtp');
        setHasApiKey(!!v.hasApiKey);
        setApiKey('');
        setApiKeyTouched(false);
      }
      if (oauthRes.ok) {
        const d = await oauthRes.json();
        const v = d.value || {};
        const mapKind = (k) => ({
          clientId: v[k]?.clientId || '',
          clientSecret: '',
          hasSecret: !!v[k]?.hasSecret,
          redirectUri: v[k]?.redirectUri || '',
          cleared: false,
        });
        setOauth({ google: mapKind('google'), microsoft: mapKind('microsoft') });
      }
    } catch {
      setMsg({ type: 'err', text: 'Could not load email configuration.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const saveEmail = async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`${API_URL}/admin/config/email`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          value: { provider, host, port, secure, email, fromName, password, apiKey },
          clearPassword: pwTouched && !password,
          clearApiKey: apiKeyTouched && !apiKey,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not save email settings.');
      setHasPassword(!(pwTouched && !password));
      setHasApiKey(!(apiKeyTouched && !apiKey));
      setPassword('');
      setPwTouched(false);
      setApiKey('');
      setApiKeyTouched(false);
      setMsg({ type: 'ok', text: `Email settings saved (${provider === 'brevo' ? 'Brevo HTTPS API' : 'SMTP'}).` });
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const saveOauth = async () => {
    setBusy(true);
    setMsg('');
    try {
      const build = (k) => ({
        clientId: oauth[k].clientId,
        clientSecret: oauth[k].clientSecret,
        redirectUri: oauth[k].redirectUri,
        clearSecret: oauth[k].cleared,
      });
      const res = await fetch(`${API_URL}/admin/config/oauth`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: { google: build('google'), microsoft: build('microsoft') } }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not save OAuth settings.');
      setOauth((o) => {
        const next = (k) => ({
          ...o[k],
          clientSecret: '',
          cleared: false,
          hasSecret: o[k].cleared ? false : o[k].clientSecret !== '' ? true : o[k].hasSecret,
        });
        return { google: next('google'), microsoft: next('microsoft') };
      });
      setMsg({ type: 'ok', text: 'OAuth app settings saved.' });
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setTestBusy(true);
    setMsg('');
    try {
      const res = await fetch(`${API_URL}/admin/email/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: testTo.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Test failed.');
      setMsg({ type: d.ok ? 'ok' : 'err', text: d.message });
      setTimeout(() => setMsg(''), 5000);
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setTestBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10">
        <Loader2 className="w-5 h-5 animate-spin text-primary" /> Loading email settings…
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* ── Platform email ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-secondary">Platform Email</h3>
        </div>
        <p className="text-xs text-secondary/50 mb-4">
          The sender used for account verification codes, login codes, interview reminders and notifications.
          {' '}Leave a secret blank to keep the one already saved.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { id: 'smtp', label: 'SMTP server', hint: 'Gmail / Outlook / any host' },
            { id: 'brevo', label: 'Brevo HTTPS API', hint: 'Works from Render free tier' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setProvider(m.id)}
              className={`px-4 py-2 rounded-xl border text-sm font-bold transition-colors ${
                provider === m.id ? 'bg-primary text-secondary border-primary' : 'border-secondary/10 text-secondary/60 hover:border-secondary/30'
              }`}
            >
              {m.label}
              <span className="block text-[10px] font-normal opacity-70">{m.hint}</span>
            </button>
          ))}
        </div>

        {provider === 'smtp' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>SMTP host</label>
              <input className={inputCls} value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" />
            </div>
            <div className="flex gap-3">
              <div className="w-28">
                <label className={labelCls}>Port</label>
                <input
                  type="number"
                  className={inputCls}
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value || 587))}
                  placeholder="587"
                />
              </div>
              <div className="flex-1 flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-secondary/70 cursor-pointer">
                  <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="w-4 h-4 accent-primary" />
                  SSL / TLS (port 465)
                </label>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>
                SMTP password / app password {hasPassword && !pwTouched && <span className="normal-case font-medium text-secondary/40">— saved</span>}
              </label>
              <SecretField
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPwTouched(true);
                }}
                placeholder="Enter the mailbox password"
                saved={hasPassword}
                onClear={() => {
                  setPassword('');
                  setPwTouched(true);
                }}
              />
              {hasPassword && !pwTouched && (
                <p className="text-[11px] text-secondary/40 mt-1">A password is saved — leave the field blank to keep it, or type a new one.</p>
              )}
            </div>
          </div>
        )}

        {provider === 'brevo' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>
                Brevo API key (starts with xkeysib-) {hasApiKey && !apiKeyTouched && <span className="normal-case font-medium text-secondary/40">— saved</span>}
              </label>
              <SecretField
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setApiKeyTouched(true);
                }}
                placeholder="xkeysib-…"
                saved={hasApiKey}
                onClear={() => {
                  setApiKey('');
                  setApiKeyTouched(true);
                }}
              />
              {hasApiKey && !apiKeyTouched && (
                <p className="text-[11px] text-secondary/40 mt-1">An API key is saved — leave the field blank to keep it, or type a new one.</p>
              )}
              <p className="text-[11px] text-secondary/40 mt-1">
                Get it from Brevo → Dashboard → SMTP &amp; API → API Keys. Sends over HTTPS (port 443), so it works even where SMTP ports are blocked.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Sender email</label>
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="no-reply@yourdomain.com" />
          </div>
          <div>
            <label className={labelCls}>Sender display name</label>
            <input className={inputCls} value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="TalentriX" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-6">
          <button
            onClick={saveEmail}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-secondary text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save email settings
          </button>
          <span className="text-xs text-secondary/40">Then send a test to confirm it works.</span>
        </div>
      </div>

      {/* ── Test email ── */}
      <div className="rounded-2xl border border-secondary/10 bg-white p-5">
        <div className="font-semibold text-secondary mb-1">Send a test email</div>
        <p className="text-xs text-secondary/50 mb-3">Leaves the box empty to send to your own admin email.</p>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${inputCls} sm:flex-1 sm:min-w-[240px]`}
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="recipient@example.com"
            type="email"
          />
          <button
            onClick={sendTest}
            disabled={testBusy}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-secondary/5 text-secondary text-sm font-semibold hover:bg-secondary/10 transition-colors disabled:opacity-60"
          >
            {testBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send test
          </button>
        </div>
      </div>

      {/* ── OAuth apps ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-secondary">Mailbox OAuth Apps (Google / Microsoft)</h3>
        </div>
        <p className="text-xs text-secondary/50 mb-4">
          The client ID + secret talents use to connect their own Gmail / Outlook mailbox through OAuth instead of an
          SMTP app password. Register an OAuth app in the Google Cloud Console or Azure portal, then paste the
          credentials here — the callback URL the app must allow is shown beside each provider.
        </p>

        {(['google', 'microsoft']).map((k) => (
          <div key={k} className="rounded-2xl border border-secondary/10 overflow-hidden mb-4">
            <div className="px-5 py-4 bg-secondary/5">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-secondary">{k === 'google' ? 'Google (Gmail)' : 'Microsoft (Outlook / 365)'}</span>
                <span className="text-[11px] font-mono text-secondary/50 truncate pl-4">
                  callback: /api/oauth/{k === 'google' ? 'google' : 'microsoft'}/callback
                </span>
              </div>
            </div>
            <div className="p-5 grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Client ID</label>
                <input
                  className={`${inputCls} font-mono`}
                  value={oauth[k].clientId}
                  onChange={(e) => setOauth((o) => ({ ...o, [k]: { ...o[k], clientId: e.target.value, cleared: false } }))}
                  placeholder="…"
                />
              </div>
              <div>
                <label className={labelCls}>
                  Client secret {oauth[k].hasSecret && !oauth[k].clientSecret && <span className="normal-case font-medium text-secondary/40">— saved</span>}
                </label>
                <SecretField
                  value={oauth[k].clientSecret}
                  onChange={(e) => setOauth((o) => ({ ...o, [k]: { ...o[k], clientSecret: e.target.value, cleared: false } }))}
                  placeholder="Enter the client secret"
                  saved={oauth[k].hasSecret}
                  onClear={() => setOauth((o) => ({ ...o, [k]: { ...o[k], clientSecret: '', cleared: true } }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Custom redirect URI (optional)</label>
                <input
                  className={`${inputCls} font-mono`}
                  value={oauth[k].redirectUri}
                  onChange={(e) => setOauth((o) => ({ ...o, [k]: { ...o[k], redirectUri: e.target.value, cleared: false } }))}
                  placeholder="Full callback URL, e.g. https://your-site.com/api/oauth/google/callback"
                />
                <p className="text-[11px] text-secondary/40 mt-1">
                  Blank = auto-detected from the site&apos;s own domain at connect time.
                </p>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={saveOauth}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-secondary text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
          Save OAuth settings
        </button>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${msg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      <div className="flex items-start gap-2 p-4 rounded-2xl bg-secondary/5 border border-secondary/10">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-secondary/50">
          With email configured, every account gets an emailed 6-digit code at sign-up (email verification) and at each
          login (two-factor authentication). SMTP is tried first (unless Brevo is selected); if the SMTP attempt fails,
          delivery falls back to the Brevo HTTPS API. Secrets are AES-256 encrypted at rest and masked in this panel.
        </p>
      </div>
    </div>
  );
}