import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Key,
  Loader2,
  Save,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Search,
  Mail,
  FileText,
  ExternalLink,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'groq', label: 'Groq' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'together', label: 'Together AI' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)' },
];

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';
const labelCls = 'block text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5';

const STATUS_STYLES = {
  sent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
};

export default function AiConfig({ token }) {
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [model, setModel] = useState('');
  const [models, setModels] = useState([]);
  const [modelError, setModelError] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [busy, setBusy] = useState(false);
  const [loadBusy, setLoadBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Applications table
  const [applications, setApplications] = useState([]);
  const [appStatus, setAppStatus] = useState('all');
  const [appQ, setAppQ] = useState('');
  const [appsLoading, setAppsLoading] = useState(false);

  const loadConfig = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/ai/config`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        const c = d.config || {};
        setProvider(c.provider || 'openai');
        setBaseUrl(c.baseUrl || '');
        setApiKey('');
        setKeyTouched(false);
        setHasKey(!!c.hasKey);
        setModel(c.model || '');
        setModels(d.models || []);
        setModelError(d.modelError || '');
      }
    } catch { /* ignore */ } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const loadApplications = async () => {
    setAppsLoading(true);
    try {
      const params = new URLSearchParams();
      if (appStatus !== 'all') params.set('status', appStatus);
      if (appQ.trim()) params.set('q', appQ.trim());
      const res = await fetch(`${API_URL}/admin/applications?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setApplications(d.applications || []);
      }
    } catch { /* ignore */ } finally {
      setAppsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig(true);
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!keyTouched && hasKey && model) {
      // keep the stale selected model synced if it exists in the fresh list
      return;
    }
    if (modelFilter) return;
    if (models.length === 1) setModel(models[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models]);

  const loadModels = async () => {
    if (!apiKey && !hasKey) {
      setMsg({ type: 'err', text: 'Enter an API key first.' });
      return;
    }
    setLoadBusy(true);
    setModelError('');
    setMsg('');
    try {
      const res = await fetch(`${API_URL}/admin/ai/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider,
          apiKey,
          baseUrl: provider === 'custom' ? baseUrl : '',
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setModelError(d.message || 'Could not load models.');
      } else {
        setModels(d.models || []);
        if ((d.models || []).length === 1) {
          setModel(d.models[0].id);
          setMsg({ type: 'ok', text: `1 model found — auto-selected ${d.models[0].label}.` });
        } else if ((d.models || []).length > 1) {
          setModel('');
          setMsg({ type: 'ok', text: `${d.models.length} models found — pick the one to use.` });
        }
      }
    } catch {
      setModelError('Could not reach the model list endpoint.');
    } finally {
      setLoadBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`${API_URL}/admin/config/ai`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          value: {
            provider,
            baseUrl: provider === 'custom' ? baseUrl : '',
            model,
            apiKey: keyTouched ? apiKey : '',
          },
          clearKey: keyTouched && !apiKey,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not save.');
      setHasKey(!(keyTouched && !apiKey));
      setApiKey('');
      setKeyTouched(false);
      setMsg({ type: 'ok', text: 'AI config saved.' });
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const clearKey = () => {
    setApiKey('');
    setKeyTouched(true);
  };

  const filteredModels = useMemo(() => {
    if (!modelFilter.trim()) return models;
    const rx = new RegExp(modelFilter.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return models.filter((m) => m.label.toLowerCase().includes(rx.source) || m.id.toLowerCase().includes(rx.source));
  }, [models, modelFilter]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" /> Loading AI config…
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* ── AI provider config ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-secondary">AI Provider</h3>
        </div>
        <p className="text-xs text-secondary/50 mb-4">
          Add an API key from any supported provider, load its models, and pick which model TalentriX uses to draft and send
          job applications. If only one model exists it is selected automatically.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          {provider === 'custom' && (
            <div>
              <label className={labelCls}>API base URL</label>
              <input className={inputCls} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://your-proxy.example.com/v1" />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className={labelCls}>
              API key {hasKey && !keyTouched && <span className="normal-case font-medium text-secondary/40">— saved key {''}</span>}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  className={`${inputCls} pr-24 font-mono`}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setKeyTouched(true);
                  }}
                  placeholder={hasKey ? 'sk-… (saved — leave blank to keep)' : 'Enter your provider API key'}
                />
                <button
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-secondary/40 hover:text-secondary"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {hasKey && (
                <button
                  onClick={clearKey}
                  title="Clear the saved key"
                  className="inline-flex items-center px-3 rounded-xl border border-secondary/10 text-secondary/50 hover:text-red-600 hover:border-red-200 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            {hasKey && !keyTouched && (
              <p className="text-[11px] text-secondary/40 mt-1">A key is already saved. Leave the field blank to keep it, or type a new one to replace it.</p>
            )}
          </div>
        </div>

        {/* Model picker */}
        <div className="mt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:flex-1 sm:min-w-[260px]">
              <label className={labelCls}>Model</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
                <input
                  className={`${inputCls} pl-9 mb-2`}
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  placeholder={model === '' && models.length === 0 ? 'Load models to choose…' : 'Filter models…'}
                />
              </div>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={inputCls}
                disabled={filteredModels.length === 0}
              >
                {model === '' && <option value="">{filteredModels.length === 0 ? 'No models loaded' : 'Select a model…'}</option>}
                {filteredModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={loadModels}
              disabled={loadBusy}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-secondary/5 text-secondary text-sm font-semibold hover:bg-secondary/10 transition-colors disabled:opacity-60"
            >
              {loadBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Load models
            </button>
          </div>
          <p className="text-xs text-secondary/40 mt-2">
            {models.length === 1
              ? '1 model found — it has been selected automatically.'
              : models.length > 1
              ? `${models.length} models loaded. Pick the one the AI uses for applications.`
              : 'Enter your key and click “Load models”.'}
          </p>
          {modelError && (
            <div className="mt-2 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="min-w-0">{modelError}</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-secondary text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save AI config
          </button>
          {msg && (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${msg.type === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
              {msg.type === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {msg.text}
            </span>
          )}
        </div>
      </div>

      {/* ── Applications ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-secondary">AI Applications</h3>
        </div>
        <p className="text-xs text-secondary/50 mb-4">Every application AI-drafted for your talent, across the platform.</p>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
            <input
              className={`${inputCls} pl-9`}
              value={appQ}
              onChange={(e) => setAppQ(e.target.value)}
              placeholder="Search by role, company or email…"
            />
          </div>
          <select value={appStatus} onChange={(e) => setAppStatus(e.target.value)} className="sm:w-44 px-3 py-2.5 rounded-xl bg-white border border-secondary/10 text-sm outline-none">
            <option value="all">All statuses</option>
            <option value="sent">Sent</option>
            <option value="draft">Draft</option>
            <option value="failed">Failed</option>
          </select>
          <button onClick={loadApplications} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-secondary/5 text-secondary text-sm font-semibold hover:bg-secondary/10 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {appsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : applications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-secondary/20 p-10 text-center">
            <FileText className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="font-display font-bold text-secondary">No applications yet</p>
            <p className="text-sm text-secondary/60 mt-1">When a talent clicks “Apply with AI” their application will show up here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-secondary/10">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-secondary/40 border-b border-secondary/10">
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Talent</th>
                  <th className="px-4 py-3">Sent to</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={String(a.id)} className="border-b border-secondary/5 align-top hover:bg-secondary/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-secondary">{a.jobTitle || '—'}</div>
                      <div className="text-xs text-secondary/50">
                        {a.company || '—'}
                        {a.source ? ` · ${a.source}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-secondary">{a.seeker?.name || '—'}</div>
                      <div className="text-xs text-secondary/50">{a.seeker?.email || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-secondary/60">{a.toEmail || <span className="text-secondary/30">manual</span>}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-secondary/70">
                        {a.method === 'email' ? <Mail className="w-3 h-3 text-primary" /> : <ExternalLink className="w-3 h-3 text-secondary/50" />}
                        {a.method === 'email' ? 'Email' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_STYLES[a.status] || ''}`}>
                        {a.status}
                      </span>
                      {a.error && <div className="text-[11px] text-red-600 mt-1 max-w-[180px] truncate" title={a.error}>{a.error}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-secondary/50">
                      {new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      <div>{new Date(a.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}