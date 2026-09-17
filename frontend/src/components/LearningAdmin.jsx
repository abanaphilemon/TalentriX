import { useEffect, useState } from 'react';
import {
  GraduationCap,
  Loader2,
  Eye,
  EyeOff,
  Trash2,
  BookOpen,
  AlertTriangle,
  Globe,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function chipCls(active) {
  return active
    ? 'inline-flex items-center text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800'
    : 'inline-flex items-center text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800';
}

export default function LearningAdmin({ token }) {
  const [view, setView] = useState('modules'); // modules | requests | analyses
  const [modules, setModules] = useState([]);
  const [requests, setRequests] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null); // { type: 'ok'|'err', text }
  const [expanded, setExpanded] = useState(null); // module id with courses shown

  const load = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/admin/learning`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not load learning data.');
      setModules(d.modules || []);
      setRequests(d.requests || []);
      setAnalyses(d.analyses || []);
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const patchModule = async (id, patch) => {
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/admin/learning/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not update the module.');
      setModules((ms) => ms.map((m) => (m.id === id ? d.module : m)));
      setMsg({ type: 'ok', text: patch.hidden ? 'Module hidden from hubs.' : 'Module made visible to hubs.' });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
  };

  const deleteModule = async (id) => {
    if (!window.confirm('Delete this learning module permanently?')) return;
    setMsg(null);
    try {
      const res = await fetch(`${API_URL}/admin/learning/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Could not delete.'); }
      setModules((ms) => ms.filter((m) => m.id !== id));
      setMsg({ type: 'ok', text: 'Module deleted.' });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /> Loading learning data…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold text-secondary">Learning Modules & Demand Analysis</h3>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/5 text-secondary text-sm font-semibold hover:bg-secondary/10 transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
      <p className="text-sm text-secondary/60 -mt-3">
        Modules are AI-generated for each role (on hub request and automatically when an employer posts a talent request). Hubs build their
        training from these — keep them current.
      </p>

      {msg && (
        <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm ${msg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.type === 'ok' ? <Eye className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      <div className="flex gap-2 bg-secondary/5 p-1 rounded-xl w-fit">
        {[
          { id: 'modules', label: `Modules (${modules.length})` },
          { id: 'requests', label: `Hub requests (${requests.length})` },
          { id: 'analyses', label: `Demand analyses (${analyses.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              view === t.id ? 'bg-primary text-secondary shadow-md' : 'text-secondary/60 hover:text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'modules' && (
        modules.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-secondary/20 p-12 text-center">
            <BookOpen className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="font-display font-bold text-secondary">No learning modules yet</p>
            <p className="text-sm text-secondary/60 mt-1">Modules appear when hubs request one or employers post a talent request.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {modules.map((m) => (
              <div key={m.id} className="rounded-2xl border border-secondary/10 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-bold text-secondary">{m.role}</span>
                      <span className={chipCls(m.source !== 'demand')}>{m.source === 'demand' ? 'live demand' : 'manual'}</span>
                      {m.hidden && <span className="inline-flex items-center text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">hidden from hubs</span>}
                      {!m.approved && <span className="inline-flex items-center text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">not approved</span>}
                    </div>
                    <div className="text-xs text-secondary/50 mt-1">
                      {(m.skills || []).length} skills · {(m.tools || []).length} tools · {(m.courses || []).length} courses · updated{' '}
                      {m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : '—'}
                    </div>
                    {m.marketNote && <div className="text-xs text-secondary/70 mt-1 italic">{m.marketNote}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/5 text-secondary text-xs font-semibold hover:bg-secondary/10 transition-colors"
                    >
                      {expanded === m.id ? 'Hide courses' : 'Courses'}
                    </button>
                    <button
                      onClick={() => patchModule(m.id, { hidden: !m.hidden })}
                      title={m.hidden ? 'Show to hubs' : 'Hide from hubs'}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/5 text-secondary text-xs font-semibold hover:bg-secondary/10 transition-colors"
                    >
                      {m.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      {m.hidden ? 'Show' : 'Hide'}
                    </button>
                    <button
                      onClick={() => deleteModule(m.id)}
                      title="Delete module"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {expanded === m.id && (
                  <div className="bg-[#faf9f6] border-t border-secondary/10 p-4 space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(m.skills || []).map((s) => (
                        <span key={s} className="text-[11px] font-medium bg-primary/15 text-secondary px-2 py-0.5 rounded-full">{s}</span>
                      ))}
                      {(m.tools || []).map((t) => (
                        <span key={t} className="text-[11px] font-medium bg-secondary/5 text-secondary px-2 py-0.5 rounded-full border border-secondary/10">{t}</span>
                      ))}
                    </div>
                    {(m.courses || []).map((c, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <span className="font-semibold text-secondary">{c.title}</span>
                          {c.provider && <span className="text-secondary/50"> — {c.provider}{c.duration ? ` · ${c.duration}` : ''}</span>}
                        </div>
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                            Open <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                    {(m.resources || []).length > 0 && (
                      <div className="text-xs text-secondary/60">Resources: {m.resources.join(' · ')}</div>
                    )}
                    {m.demandNote && <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded-lg">{m.demandNote}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {view === 'requests' && (
        requests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-secondary/20 p-10 text-center">
            <GraduationCap className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="font-display font-bold text-secondary">No hub module requests yet</p>
            <p className="text-sm text-secondary/60 mt-1">When a hub types a role to generate a module, it appears here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-secondary/10">
            <table className="w-full text-sm">
              <thead className="bg-secondary/5 text-left text-xs font-bold uppercase tracking-widest text-secondary/50">
                <tr>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Hub</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requested</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-secondary/10 bg-white">
                    <td className="px-4 py-3 font-semibold text-secondary">{r.role}</td>
                    <td className="px-4 py-3 text-secondary/70">{r.hub ? r.hub.name : r.hub?.email || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.status === 'generated' ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary/10 text-secondary/60'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-secondary/50">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'analyses' && (
        analyses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-secondary/20 p-10 text-center">
            <Globe className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="font-display font-bold text-secondary">No demand analyses yet</p>
            <p className="text-sm text-secondary/60 mt-1">
              Every new employer talent request is validated against the market and notifies talents + hubs. Results show here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {analyses.map((a) => (
              <div key={a.id} className="rounded-2xl border border-secondary/10 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    <span className="font-display font-bold text-secondary">{a.role}</span>
                  </div>
                  <span className="text-[11px] text-secondary/40">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}</span>
                </div>
                {a.analysis && (
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-secondary/50 uppercase tracking-widest">Valid:</span>
                      {(a.analysis.valid || []).map((v) => (
                        <span key={v} className="text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{v}</span>
                      ))}
                    </div>
                    {(a.analysis.irrelevant || []).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-secondary/50 uppercase tracking-widest">Flagged:</span>
                        {(a.analysis.irrelevant || []).map((v) => (
                          <span key={v} className="text-[11px] font-medium bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">{v}</span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-secondary/50">
                      {a.analysis.talentsNotified || 0} talents notified · {a.analysis.hubsNotified || 0} hubs notified ·{' '}
                      {a.analysis.moduleGenerated ? 'module published' : 'no module'}
                    </div>
                    {a.analysis.marketNote && <div className="text-xs text-secondary/70 italic">{a.analysis.marketNote}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}