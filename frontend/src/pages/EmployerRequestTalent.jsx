import { useEffect, useRef, useState } from 'react';
import {
  Search,
  Loader2,
  Sparkles,
  ArrowRight,
  MapPin,
  Clock,
  Star,
  BadgeCheck,
  ExternalLink,
  Target,
  UserPlus,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';

function ChipsInput({ values, onChange, placeholder }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setText('');
  };
  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl bg-white border border-secondary/10 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 transition-all">
        <input
          className="flex-1 min-w-0 px-3 py-2.5 bg-transparent outline-none text-sm"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" onClick={add} className="mr-1.5 px-3 py-1.5 rounded-lg bg-secondary/5 hover:bg-secondary/10 text-xs font-semibold text-secondary transition-colors">
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/15 text-secondary px-2.5 py-1 rounded-full">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-secondary/60 hover:text-secondary" aria-label={`Remove ${v}`}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EmployerRequestTalent() {
  const token = localStorage.getItem('tbai.token');
  const [mode, setMode] = useState('list'); // list | new | results
  const [requests, setRequests] = useState([]);
  const [request, setRequest] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [err, setErr] = useState('');
  const roleRef = useRef(null);

  // Form state
  const [form, setForm] = useState({
    role: '',
    title: '',
    location: '',
    type: 'Full-time',
    description: '',
    budget: '',
    skills: [],
    tools: [],
    requirements: [],
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/talent-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setRequests(d.requests || []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setForm({ role: '', title: '', location: '', type: 'Full-time', description: '', budget: '', skills: [], tools: [], requirements: [] });
    setErr('');
    setMode('new');
    setTimeout(() => roleRef.current?.focus(), 50);
  };

  const submit = async () => {
    if (!form.role.trim()) {
      setErr('Please enter the role the talent should have.');
      return;
    }
    setErr('');
    setMatching(true);
    try {
      const res = await fetch(`${API_URL}/talent-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not save the request.');
      // Immediately run matching.
      const m = await fetch(`${API_URL}/talent-requests/${d.request._id}/match`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const md = await m.json();
      if (!m.ok) throw new Error(md.message || 'Could not run matching.');
      setRequest(md.request);
      setResults(md.results || []);
      setMode('results');
      load();
    } catch (e) {
      setErr(e.message || 'Could not reach the server.');
    } finally {
      setMatching(false);
    }
  };

  const openResults = async (id) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/talent-requests/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      setRequest(d.request);
      if (Array.isArray(d.request.results) && d.request.results.length) {
        setResults(d.request.results);
        setMode('results');
      } else {
        // Never matched — run matching on demand.
        const m = await fetch(`${API_URL}/talent-requests/${id}/match`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const md = await m.json();
        if (m.ok) {
          setRequest(md.request);
          setResults(md.results || []);
          setMode('results');
        }
      }
    } catch (e) {
      setErr(e.message || 'Could not load the request.');
    } finally {
      setLoading(false);
    }
  };

  const reMatch = async () => {
    if (!request) return;
    setMatching(true);
    try {
      const m = await fetch(`${API_URL}/talent-requests/${request._id}/match`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const md = await m.json();
      if (!m.ok) throw new Error(md.message || 'Could not re-run matching.');
      setRequest(md.request);
      setResults(md.results || []);
      load();
    } catch (e) {
      setErr(e.message || 'Could not re-run matching.');
    } finally {
      setMatching(false);
    }
  };

  if (mode === 'new') {
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-lg font-bold text-secondary flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" /> Describe who you're looking for
            </h2>
            <p className="text-sm text-secondary/50">
              The platform will scan every approved talent and rate how well each one fits, by percentage.
            </p>
          </div>
          <button onClick={() => setMode('list')} className="text-sm font-semibold text-secondary/60 hover:text-secondary">
            ← Back
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-secondary/10 p-7 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1.5">Role they should have <span className="text-red-500">*</span></label>
              <input ref={roleRef} className={inputCls} placeholder="e.g. Senior Frontend Developer" value={form.role} onChange={(e) => set('role', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1.5">Job title (optional)</label>
              <input className={inputCls} placeholder="e.g. Product Engineer" value={form.title} onChange={(e) => set('title', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1.5">Location</label>
              <input className={inputCls} placeholder="e.g. Remote / Lagos" value={form.location} onChange={(e) => set('location', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1.5">Employment type</label>
              <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value)}>
                {['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1.5">Budget / salary range</label>
              <input className={inputCls} placeholder="e.g. $6,000 – $9,000 / month" value={form.budget} onChange={(e) => set('budget', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-secondary mb-1.5">Description</label>
              <input className={inputCls} placeholder="A quick note about the team or the work" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-secondary mb-1.5">Must-have skills <span className="text-secondary/40 font-normal">(press Enter to add)</span></label>
            <ChipsInput values={form.skills} onChange={(v) => set('skills', v)} placeholder="e.g. React, TypeScript, Node.js…" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1.5">Tools they should know <span className="text-secondary/40 font-normal">(press Enter to add)</span></label>
            <ChipsInput values={form.tools} onChange={(v) => set('tools', v)} placeholder="e.g. AWS, Docker, Figma, Jira…" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-secondary mb-1.5">Other requirements <span className="text-secondary/40 font-normal">(press Enter to add)</span></label>
            <ChipsInput values={form.requirements} onChange={(v) => set('requirements', v)} placeholder="e.g. B.Sc., 3+ years, remote-friendly…" />
          </div>

          {err && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /> {err}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-3 justify-between pt-2">
            <p className="text-xs text-secondary/50">
              Matching weighs skills 50%, tools 30% and role-fit 20% for a final match percentage.
            </p>
            <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={() => setMode('list')} className="px-4 py-2.5 rounded-xl bg-secondary/5 text-secondary text-sm font-semibold hover:bg-secondary/10 transition-colors">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={matching}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {matching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {matching ? 'Finding talent…' : 'Find matching talent'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'results' && request) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
          <div>
            <button onClick={() => setMode('list')} className="text-sm font-semibold text-secondary/60 hover:text-secondary mb-1 inline-flex items-center gap-1">
              ← All requests
            </button>
            <h2 className="font-display text-xl font-bold text-secondary">{request.role}</h2>
            <p className="text-sm text-secondary/50">
              {request.location && <span className="inline-flex items-center gap-1 mr-3"><MapPin className="w-3.5 h-3.5" />{request.location}</span>}
              <span className="inline-flex items-center gap-1 mr-3"><Clock className="w-3.5 h-3.5" />{request.type}</span>
              {request.budget && <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5" />{request.budget}</span>}
            </p>
          </div>
          <button
            onClick={reMatch}
            disabled={matching}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/5 text-secondary text-sm font-semibold hover:bg-secondary/10 transition-colors disabled:opacity-60"
          >
            {matching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh matches
          </button>
        </div>

        {matching ? (
          <div className="flex items-center justify-center py-20 text-secondary/50">
            <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" /> Matching against every approved talent…
          </div>
        ) : results.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-secondary/20 p-12 text-center">
            <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="font-display font-bold text-secondary">No talent matched this role yet</p>
            <p className="text-sm text-secondary/60 mt-1">
              Add more known skills/tools, or tag more talent in the talent pool, then refresh.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((r, i) => (
              <MatchCard key={r.seeker.id} rank={i + 1} result={r} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // list mode
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-xl font-bold text-secondary flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" /> Request talent
          </h2>
          <p className="text-sm text-secondary/50">
            Describe a role, and we'll rank every approved talent by match percentage.
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="w-4 h-4" /> New talent request
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-secondary/20 p-12 text-center">
          <Target className="w-8 h-8 text-primary mx-auto mb-3" />
          <p className="font-display font-bold text-secondary">No talent requests yet</p>
          <p className="text-sm text-secondary/60 mt-1">
            Create your first request and get a ranked shortlist of matching talent instantly.
          </p>
          <button
            onClick={openNew}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Create a request
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {requests.map((r) => {
            const matched = Array.isArray(r.results) ? r.results.length : 0;
            const top = Array.isArray(r.results) && r.results[0]?.match != null ? r.results[0].match : null;
            return (
              <button
                key={r._id}
                onClick={() => openResults(r._id)}
                className="text-left bg-white rounded-2xl border border-secondary/10 p-6 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display font-bold text-secondary">{r.role}</div>
                    <div className="text-xs text-secondary/50 mt-0.5">
                      {r.location && `${r.location} · `}{r.type}
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                    r.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-secondary/10 text-secondary/50'
                  }`}>
                    {r.status}
                  </span>
                </div>
                {(r.skills || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {(r.skills || []).slice(0, 4).map((s) => (
                      <span key={s} className="text-xs font-medium bg-primary/15 text-secondary px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                    {(r.skills || []).length > 4 && (
                      <span className="text-xs text-secondary/40">+{(r.skills || []).length - 4}</span>
                    )}
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-secondary/50">
                    {matched} {matched === 1 ? 'match' : 'matches'}
                  </span>
                  {top != null && (
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-primary">
                      <Target className="w-3.5 h-3.5" /> Best: {top}%
                    </span>
                  )}
                </div>
                {matched === 0 && (
                  <span className="mt-3 inline-flex items-center gap-2 w-full justify-center px-3 py-2 rounded-xl bg-secondary/5 text-xs font-semibold text-secondary/70">
                    <ArrowRight className="w-3.5 h-3.5" /> Run matching
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const API_URL = import.meta.env.VITE_API_URL || '/api';

function MatchCard({ result, rank }) {
  const s = result.seeker;
  const pct = result.match || 0;
  const breaks = [
    { label: 'Skills', got: result.skillCount ? Math.round(result.breakdown?.skills * 100) : null, fill: '#16a34a' },
    { label: 'Tools', got: result.toolCount ? Math.round(result.breakdown?.tools * 100) : null, fill: '#0ea5e9' },
    { label: 'Role fit', got: result.breakdown?.role != null ? Math.round(result.breakdown.role * 100) : null, fill: '#f59e0b' },
  ];
  const color = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-secondary/60';
  const bar = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-secondary/40';

  return (
    <div className="bg-white rounded-2xl border border-secondary/10 p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <span className="font-display font-bold text-secondary">{initials(s.name)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-secondary">{s.name}</span>
            {s.hubRecommend && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                <BadgeCheck className="w-3.5 h-3.5" /> Recommended
              </span>
            )}
          </div>
          <div className="text-sm text-secondary/60 truncate">{s.title || 'Job seeker'}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(s.skills || []).slice(0, 6).map((sk) => (
              <span key={sk} className="text-xs font-medium bg-primary/15 text-secondary px-2 py-0.5 rounded-full">{sk}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1 h-2.5 rounded-full bg-secondary/10 overflow-hidden">
          <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`font-display text-xl font-bold ${color}`}>
          {pct}%
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {breaks.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary bg-secondary/5 px-2 py-1 rounded-lg">
            <span className="w-2 h-2 rounded-full" style={{ background: b.fill }} />
            {b.label} {b.got != null ? `${b.got}%` : '—'}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-secondary/5 pt-3">
        <a
          href={`/portfolio/${s.id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" /> View portfolio
        </a>
        <span className="text-xs text-secondary/40">
          #{rank} ranked match
        </span>
      </div>
    </div>
  );
}

function initials(name = '') {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}