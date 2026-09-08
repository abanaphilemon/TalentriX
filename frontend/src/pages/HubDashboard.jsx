import { useEffect, useState } from 'react';
import {
  Network,
  Copy,
  Check,
  LogOut,
  Users,
  Link as LinkIcon,
  Loader2,
  Eye,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function HubDashboard() {
  const { user, signOut } = useAuth();
  const [link, setLink] = useState('');
  const [count, setCount] = useState(0);
  const [seekers, setSeekers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSeekers, setLoadingSeekers] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewing, setViewing] = useState(null);

  const token = localStorage.getItem('tbai.token');

  const loadLink = async () => {
    try {
      const res = await fetch(`${API_URL}/hub/link`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setLink(d.link);
        setCount(d.count || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadSeekers = async () => {
    setLoadingSeekers(true);
    try {
      const res = await fetch(`${API_URL}/hub/seekers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setSeekers(d.seekers);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSeekers(false);
    }
  };

  useEffect(() => {
    loadLink();
    loadSeekers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const initials = (name = '') =>
    name
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      {/* Top bar */}
      <header className="bg-white border-b border-secondary/10 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Network className="w-4 h-4 text-secondary" />
            </div>
            <span className="font-display font-bold text-secondary">Talent Bridge</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-secondary/60 hidden sm:inline">
              {user?.name || user?.email}
            </span>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-secondary">
            Talent Hub Dashboard
          </h1>
          <p className="text-secondary/60 text-sm mt-1">
            Share your unique link so talent pool members can register.
          </p>
        </div>

        {/* Registration link card */}
        <div className="bg-secondary text-white rounded-3xl p-8 mb-6 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />

          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <LinkIcon className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h2 className="font-display font-bold">Your unique registration link</h2>
              <p className="text-white/60 text-sm">
                Anyone who registers through this link joins your talent pool.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-white/60 py-4">
              <Loader2 className="w-5 h-5 animate-spin" /> Generating your link…
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 bg-white/10 border border-white/15 rounded-xl px-4 py-3 font-mono text-sm text-primary break-all">
                {link || 'Generating…'}
              </div>
              <button
                onClick={copy}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          )}

          <div className="mt-5 flex items-center gap-2 text-sm text-white/70">
            <Users className="w-4 h-4 text-primary" />
            <span className="font-bold text-white">{count}</span> member
            {count === 1 ? '' : 's'} registered through your link
          </div>
        </div>

        {/* Seekers list */}
        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-display text-lg font-bold text-secondary">
            Talent pool members
          </h2>
          <span className="text-sm text-secondary/50">({seekers.length})</span>
        </div>

        {loadingSeekers ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : seekers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-secondary/20 p-12 text-center">
            <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="font-display font-bold text-secondary">No members yet</p>
            <p className="text-sm text-secondary/60 mt-1">
              Share your link to start building your talent pool.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {seekers.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl border border-secondary/10 p-5 flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                    <span className="font-display font-bold text-secondary">{initials(s.name)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-secondary truncate">{s.name}</div>
                    <div className="text-xs text-secondary/50 truncate">{s.email}</div>
                  </div>
                </div>
                {s.title && <div className="text-sm text-secondary/70 mb-2">{s.title}</div>}
                {(s.skills || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {s.skills.slice(0, 4).map((skill) => (
                      <span
                        key={skill}
                        className="text-xs font-medium bg-primary/15 text-secondary px-2 py-0.5 rounded-full"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setViewing(s)}
                  className="mt-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-white text-sm font-semibold hover:bg-accent transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" /> View profile
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Seeker detail modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-secondary/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl relative overflow-hidden">
            <div className="bg-secondary text-white p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
                  <span className="font-display text-xl font-bold text-secondary">
                    {initials(viewing.name)}
                  </span>
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold">{viewing.name}</h3>
                  <p className="text-white/70 text-sm">{viewing.email}</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {viewing.title && <p className="text-sm text-secondary/80">{viewing.title}</p>}
              {(viewing.skills || []).length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-secondary/50 mb-2">Skills</div>
                  <div className="flex flex-wrap gap-1.5">
                    {viewing.skills.map((s2) => (
                      <span key={s2} className="text-xs font-medium bg-primary/15 text-secondary px-2.5 py-1 rounded-full">
                        {s2}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {viewing.summary && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1">Summary</div>
                  <p className="text-sm text-secondary/80">{viewing.summary}</p>
                </div>
              )}
              <div className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> Registered via your link
              </div>
            </div>
            <div className="p-6 pt-0">
              <button
                onClick={() => setViewing(null)}
                className="w-full py-2.5 rounded-xl bg-secondary/5 text-secondary font-semibold hover:bg-secondary/10 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
