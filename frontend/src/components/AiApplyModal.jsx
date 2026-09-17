import { useEffect, useState } from 'react';
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  Mail,
  FileText,
  ExternalLink,
  Eye,
  EyeOff,
  MailPlus,
  Sparkles,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';
const labelCls = 'block text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5';

function StatusRow({ icon: Icon, children }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary/[0.03] border border-secondary/10">
      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="text-sm text-secondary/80 leading-relaxed min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function AiApplyModal({ job, token, onClose, onApplied }) {
  const [loading, setLoading] = useState(true);
  const [aiStatus, setAiStatus] = useState(null);
  const [email, setEmail] = useState(null);
  const [error, setError] = useState('');

  // Connect step
  const [step, setStep] = useState('boot'); // boot | connect | draft | sent
  const [connectProvider, setConnectProvider] = useState('gmail');
  const [connectEmail, setConnectEmail] = useState('');
  const [connectName, setConnectName] = useState('');
  const [connectHost, setConnectHost] = useState('');
  const [connectPort, setConnectPort] = useState(465);
  const [connectSecure, setConnectSecure] = useState(true);
  const [connectPassword, setConnectPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);

  // Draft step
  const [draftBusy, setDraftBusy] = useState(false);
  const [subject, setSubject] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [cvAttached, setCvAttached] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const boot = async () => {
      setLoading(true);
      setError('');
      try {
        const [aiRes, mailRes] = await Promise.all([
          fetch(`${API_URL}/ai/status`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/email/status`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const ai = aiRes.ok ? await aiRes.json() : null;
        const mail = mailRes.ok ? await mailRes.json() : null;
        setAiStatus(ai);
        setEmail(mail?.connection || null);

        if (!ai?.configured) {
          setStep('notConfigured');
        } else if (!mail?.connected || !mail.connection) {
          setStep('connect');
        } else {
          setStep('draft');
        }
      } catch {
        setError('Could not reach the server. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (connectProvider === 'gmail') {
      setConnectHost('smtp.gmail.com');
      setConnectPort(465);
      setConnectSecure(true);
    } else if (connectProvider === 'outlook') {
      setConnectHost('smtp.office365.com');
      setConnectPort(587);
      setConnectSecure(false);
    } else {
      setConnectHost('');
      setConnectPort(587);
      setConnectSecure(false);
    }
  }, [connectProvider]);

  // Auto-draft the cover letter the first time the draft step opens.
  useEffect(() => {
    if (loading || step !== 'draft') return;
    if (draftBusy || subject || coverLetter) return;
    generateDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, step]);

  const pickProviderFromEmail = (value) => {
    const domain = String(value).split('@')[1]?.toLowerCase() || '';
    if (domain.includes('gmail') || domain.includes('googlemail')) setConnectProvider('gmail');
    else if (/(outlook|hotmail|live|msn|office365|microsoft)/.test(domain)) setConnectProvider('outlook');
    else setConnectProvider('smtp');
  };

  const submitConnect = async () => {
    setConnectBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/email/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider: connectProvider,
          email: connectEmail,
          displayName: connectName,
          host: connectHost,
          port: connectPort,
          secure: connectSecure,
          password: connectPassword,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not connect the mailbox.');
      setEmail(d);
      setStep('draft');
    } catch (e) {
      setError(e.message);
    } finally {
      setConnectBusy(false);
    }
  };

  const generateDraft = async () => {
    setDraftBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/ai/apply/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not generate the application.');
      setSubject(d.subject || '');
      setCoverLetter(d.body || '');
      setToEmail(d.toEmail || '');
      setCvAttached(!!d.cvAttached);
      setStep('draft');
    } catch (e) {
      setError(e.message);
    } finally {
      setDraftBusy(false);
    }
  };

  const sendApplication = async ({ finishManually } = {}) => {
    setSendBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/ai/apply/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          job,
          subject,
          coverLetter,
          toEmail: finishManually ? '' : toEmail,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not submit the application.');
      setResult({ ...d, openUrl: job.url || '' });
      setStep('sent');
      onApplied && onApplied(d.application);
    } catch (e) {
      setError(e.message);
    } finally {
      setSendBusy(false);
    }
  };

  const canSend = toEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail) && !sendBusy;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-secondary/10 px-6 py-4 flex items-start justify-between gap-4 rounded-t-3xl z-10">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-secondary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold text-secondary leading-tight">Apply with AI</h2>
              <p className="text-sm text-secondary/60 truncate">
                {job.title}
                {job.company ? ` · ${job.company}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary/5 transition-colors shrink-0">
            <X className="w-5 h-5 text-secondary/60" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="min-w-0">{error}</div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}

          {!loading && step === 'notConfigured' && (
            <div className="space-y-4">
              <StatusRow icon={AlertCircle}>
                <span className="font-semibold text-secondary">AI isn’t configured yet.</span>
                <div className="mt-1">The admin needs to add an AI provider key and pick a model before applications can be drafted automatically.</div>
              </StatusRow>
              <div className="flex justify-end pt-1">
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-white hover:bg-accent transition-colors">
                  Close
                </button>
              </div>
            </div>
          )}

          {!loading && step === 'connect' && (
            <div className="space-y-5">
              <StatusRow icon={MailPlus}>
                Connect the email you want the application sent from. We&rsquo;ll send the cover letter <span className="font-semibold text-secondary">and your CV</span> from that inbox.
              </StatusRow>

              <div>
                <label className={labelCls}>Mailbox provider</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'gmail', label: 'Gmail' },
                    { id: 'outlook', label: 'Outlook' },
                    { id: 'smtp', label: 'Custom SMTP' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setConnectProvider(p.id)}
                      className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                        connectProvider === p.id ? 'border-primary bg-primary/10 text-secondary shadow-sm' : 'border-secondary/10 text-secondary/60 hover:bg-secondary/5'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Your email address</label>
                  <input
                    className={inputCls}
                    value={connectEmail}
                    onChange={(e) => {
                      setConnectEmail(e.target.value);
                      pickProviderFromEmail(e.target.value);
                    }}
                    placeholder="you@gmail.com or you@outlook.com"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Your name (shown in the email)</label>
                  <input className={inputCls} value={connectName} onChange={(e) => setConnectName(e.target.value)} placeholder="Jane Doe" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>
                    App password{' '}
                    <span className="normal-case font-medium text-secondary/40">
                      ({connectProvider === 'gmail' ? 'Google Account → Security → App passwords' : connectProvider === 'outlook' ? 'Microsoft account → Security → App password' : 'SMTP password'})
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      className={`${inputCls} pr-11`}
                      value={connectPassword}
                      onChange={(e) => setConnectPassword(e.target.value)}
                      placeholder="•••• •••• •••• ••••"
                    />
                    <button
                      onClick={() => setShowPass((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-secondary/40 hover:text-secondary"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {connectProvider === 'smtp' && (
                <div className="grid sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-secondary/[0.03] border border-secondary/10">
                  <div>
                    <label className={labelCls}>SMTP host</label>
                    <input className={inputCls} value={connectHost} onChange={(e) => setConnectHost(e.target.value)} placeholder="smtp.example.com" />
                  </div>
                  <div>
                    <label className={labelCls}>Port</label>
                    <input type="number" className={inputCls} value={connectPort} onChange={(e) => setConnectPort(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className={labelCls}>Secure (SSL)</label>
                    <select className={inputCls} value={connectSecure ? '1' : '0'} onChange={(e) => setConnectSecure(e.target.value === '1')}>
                      <option value="1">Yes (465)</option>
                      <option value="0">No / STARTTLS (587)</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                {email && (
                  <button
                    onClick={() => setStep('draft')}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 transition-colors"
                  >
                    Use already-connected {email.email}
                  </button>
                )}
                <button
                  onClick={submitConnect}
                  disabled={connectBusy || !connectEmail || !connectPassword}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-secondary bg-primary hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {connectBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Connect &amp; continue
                </button>
              </div>
            </div>
          )}

          {!loading && step === 'draft' && (
            <div className="space-y-5">
              <StatusRow icon={Sparkles}>
                The AI wrote a personalised cover letter from your profile and CV. Edit anything below before sending.
              </StatusRow>

              {draftBusy ? (
                <div className="flex items-center justify-center py-14 space-x-3">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-sm text-secondary/60">Drafting your application…</span>
                </div>
              ) : (
                <>
                  {email && (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-secondary/[0.03] border border-secondary/10">
                      <div className="flex items-center gap-3 min-w-0">
                        <Mail className="w-4 h-4 text-primary shrink-0" />
                        <div className="text-sm min-w-0">
                          <span className="font-semibold text-secondary">Sending from: </span>
                          <span className="text-secondary/70 truncate">{email.email}</span>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          setError('');
                          try {
                            const res = await fetch(`${API_URL}/email/status`, { headers: { Authorization: `Bearer ${token}` } });
                            if (res.ok) {
                              const d = await res.json();
                              if (!d.connected || !d.connection) {
                                setEmail(null);
                                setStep('connect');
                              }
                            }
                          } catch { /* ignore */ }
                        }}
                        title="Change mailbox"
                        className="p-2 rounded-lg hover:bg-secondary/10 text-secondary/50 transition-colors shrink-0"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Send application email to</label>
                      <input
                        className={inputCls}
                        value={toEmail}
                        onChange={(e) => setToEmail(e.target.value)}
                        placeholder="hiring@company.com"
                      />
                      <p className="text-[11px] text-secondary/40 mt-1">
                        {toEmail ? 'The application + CV will be emailed to this address.' : 'No apply address found — finish manually and we’ll open the original posting.'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Email subject</label>
                      <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Cover letter</label>
                      <textarea
                        className={`${inputCls} resize-none h-56 font-normal leading-relaxed`}
                        value={coverLetter}
                        onChange={(e) => setCoverLetter(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-secondary/50">
                    {cvAttached ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <FileText className="w-3.5 h-3.5" /> Your CV will be attached
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> No CV uploaded yet — add one in your profile to attach it.
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                    <button
                      onClick={generateDraft}
                      disabled={draftBusy}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 transition-colors disabled:opacity-60"
                    >
                      <RefreshCw className="w-4 h-4" /> Regenerate
                    </button>
                    {!canSend && (
                      <button
                        onClick={() => sendApplication({ finishManually: true })}
                        disabled={sendBusy}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 transition-colors disabled:opacity-60"
                      >
                        <ExternalLink className="w-4 h-4" /> Save &amp; open original
                      </button>
                    )}
                    <button
                      onClick={() => sendApplication()}
                      disabled={!canSend}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-secondary bg-primary hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {sendBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Send application
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {!loading && step === 'sent' && result && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-5 rounded-2xl bg-green-50 border border-green-200">
                <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                <div className="text-sm text-green-800 leading-relaxed">
                  {result.method === 'email' ? (
                    <>
                      <span className="font-bold">Application sent.</span> Your cover letter and CV were emailed for {job.title}
                      {job.company ? ` at ${job.company}` : ''}.
                    </>
                  ) : (
                    <>
                      <span className="font-bold">Application recorded.</span> We couldn’t find an apply address, so open the original posting to finish submitting.
                    </>
                  )}
                </div>
              </div>
              {result.method === 'draft' && result.openUrl && (
                <a
                  href={result.openUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => navigator.clipboard && navigator.clipboard.writeText(coverLetter).catch(() => {})}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-secondary bg-primary hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> Open original posting (cover letter copied)
                </a>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-secondary/40">You can view all applications in the Applications tab.</span>
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-white hover:bg-accent transition-colors">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}