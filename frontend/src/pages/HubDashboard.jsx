import { useEffect, useRef, useState } from 'react';
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
  Building2,
  Star,
  BadgeCheck,
  ImagePlus,
  X,
  Coins,
  Plus,
  Calendar,
  ExternalLink,
  Tag,
  Search,
  Headset,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useContent } from '../context/ContentContext.jsx';
import { readImageFile } from '../lib/image.js';
import NotificationCenter from '../components/NotificationCenter.jsx';
import SupportCenter from '../components/SupportCenter.jsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';

// Stars renderer for compact card badges
function StarRow({ rating }) {
  return (
    <div className="inline-flex items-center gap-0.5" title={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= rating ? 'fill-primary text-primary' : 'text-secondary/20'}`} />
      ))}
    </div>
  );
}

// Rate & recommend panel shown inside the talent modal
function EndorsePanel({ seeker, token, hubName, onSaved }) {
  const [rating, setRating] = useState(seeker.hubRating || 0);
  const [recommend, setRecommend] = useState(!!seeker.hubRecommend);
  const [note, setNote] = useState(seeker.hubNote || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`${API_URL}/hub/rate/${seeker.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, recommend, note }),
      });
      const d = await res.json();
      if (res.ok) {
        onSaved(d.seeker);
        setMsg('Endorsement saved — the badge is live on their portfolio.');
      } else {
        setMsg(d.message || 'Could not save endorsement.');
      }
    } catch {
      setMsg('Could not connect to server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-secondary/10 bg-secondary/[0.02] p-5">
      <div className="flex items-center gap-2 mb-4">
        <BadgeCheck className="w-4 h-4 text-primary" />
        <h4 className="font-display font-bold text-secondary">Rate & recommend</h4>
      </div>

      <div className="text-xs font-semibold text-secondary/50 mb-2">Quality of this talent</div>
      <div className="flex items-center gap-1 mb-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setRating(i)}
            className={`p-0.5 rounded-lg hover:scale-110 transition-transform ${
              i <= rating ? 'text-primary' : 'text-secondary/20'
            }`}
            aria-label={`${i} star`}
          >
            <Star className={`w-7 h-7 ${i <= rating ? 'fill-primary' : ''}`} />
          </button>
        ))}
      </div>
      <p className="text-[11px] text-secondary/40 mb-4">
        {rating === 0 ? 'Tap a star to rate this talent.' : `${rating} / 5 stars`}
      </p>

      <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={recommend}
          onChange={(e) => setRecommend(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-primary"
        />
<span className="text-sm text-secondary">
            <span className="font-semibold">Recommend publicly</span>
            <span className="block text-xs text-secondary/50">
              Adds a “recommended by {hubName || 'your hub'}” badge to their portfolio.
            </span>
          </span>
      </label>

      <label className="block text-xs font-semibold text-secondary/50 mb-1.5">
        Endorsement note <span className="font-normal">(optional)</span>
      </label>
      <textarea
        rows={2}
        className={inputCls}
        placeholder="e.g. Reliable, sharp and delivers great work."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={200}
      />

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-secondary text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {rating > 0 || recommend ? 'Save endorsement' : 'Save'}
        </button>
        {msg && <span className={`text-xs ${msg.includes('saved') ? 'text-emerald-700' : 'text-amber-700'}`}>{msg}</span>}
      </div>
    </div>
  );
}

export default function HubDashboard() {
  const { user, signOut } = useAuth();
  const { content } = useContent();
  const branding = content.branding || {};
  const [tab, setTab] = useState('grants'); // 'grants' | 'talent' | 'profile'
  const [link, setLink] = useState('');
  const [count, setCount] = useState(0);
  const [seekers, setSeekers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSeekers, setLoadingSeekers] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewing, setViewing] = useState(null);
  // Grant catalog state
  const [grants, setGrants] = useState([]);
  const [loadingGrants, setLoadingGrants] = useState(false);
  const [grantQ, setGrantQ] = useState('');
  const [grantSourceFilter, setGrantSourceFilter] = useState('All');
  const [selectedGrant, setSelectedGrant] = useState(null);
  // Organization profile state (shown on the landing partners section)
  const [orgName, setOrgName] = useState(user?.company || '');
  const [orgLogo, setOrgLogo] = useState(user?.logo || '');
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgMsg, setOrgMsg] = useState('');
  const [orgReading, setOrgReading] = useState(false);
  const logoRef = useRef(null);
  const [supportOpen, setSupportOpen] = useState(false);

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
    loadGrants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGrants = async () => {
    setLoadingGrants(true);
    try {
      const res = await fetch(`${API_URL}/grants/external`);
      if (res.ok) {
        const d = await res.json();
        setGrants(d.grants || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingGrants(false);
    }
  };

  const grantSources = ['All', ...new Set(grants.map((g) => g.source).filter(Boolean))];

  const filteredGrants = grants
    .filter((g) => (grantSourceFilter === 'All' ? true : g.source === grantSourceFilter))
    .filter((g) => {
      const query = grantQ.trim().toLowerCase();
      if (!query) return true;
      return [g.title, g.agency, g.description, g.eligibility, ...(g.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const onLogoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOrgMsg('');
    setOrgReading(true);
    try {
      const logo = await readImageFile(file, { forcePng: true });
      setOrgLogo(logo);
      setOrgMsg('Logo ready — press “Save partner info” to keep it.');
    } catch (err) {
      setOrgMsg(err.message || 'Could not read that image. Try another.');
    } finally {
      setOrgReading(false);
    }
  };

  const saveOrg = async () => {
    setOrgSaving(true);
    setOrgMsg('');
    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ company: orgName, logo: orgLogo }),
      });
      if (res.ok) {
        setOrgMsg('Saved — your organization now appears as a partner on the site.');
        setTimeout(() => setOrgMsg(''), 3000);
      }
    } catch {
      // ignore
    } finally {
      setOrgSaving(false);
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
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
              {branding.logo ? (
                <img src={branding.logo} alt={`${branding.name || 'TalentriX'} logo`} className="w-full h-full object-contain p-0.5" />
              ) : (
                <Network className="w-4 h-4 text-secondary" />
              )}
            </div>
            <span className="font-display font-bold text-secondary">{branding.name || 'TalentriX'}</span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationCenter token={token} />
            <button
              onClick={() => setSupportOpen(true)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-secondary/5 hover:bg-secondary/10 transition-colors"
              title="Help & Support"
              aria-label="Help & Support"
            >
              <Headset className="w-4 h-4 text-secondary" />
            </button>
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

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-secondary/5 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab('grants')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'grants'
                ? 'bg-primary text-secondary shadow-md'
                : 'text-secondary/60 hover:text-secondary'
            }`}
          >
            <Coins className="w-4 h-4" /> Grant Catalog
          </button>
          <button
            onClick={() => setTab('talent')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'talent'
                ? 'bg-primary text-secondary shadow-md'
                : 'text-secondary/60 hover:text-secondary'
            }`}
          >
            <Users className="w-4 h-4" /> Talent Pool
          </button>
          <button
            onClick={() => setTab('profile')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'profile'
                ? 'bg-primary text-secondary shadow-md'
                : 'text-secondary/60 hover:text-secondary'
            }`}
          >
            <Building2 className="w-4 h-4" /> Profile
          </button>
        </div>

        {/* ── Grant Catalog Tab ─────────────────────────────────────────── */}
        {tab === 'grants' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold text-secondary">Grant Catalog</h2>
                <span className="text-sm text-secondary/50">({filteredGrants.length})</span>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
                <input
                  value={grantQ}
                  onChange={(e) => setGrantQ(e.target.value)}
                  placeholder="Search grants, agencies, topics…"
                  className={`${inputCls} pl-10`}
                />
              </div>
              <select
                value={grantSourceFilter}
                onChange={(e) => setGrantSourceFilter(e.target.value)}
                className="sm:w-48 px-3 py-2.5 rounded-xl bg-white border border-secondary/10 text-sm outline-none"
              >
                {grantSources.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Grant cards */}
            {loadingGrants ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredGrants.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-secondary/20 p-12 text-center">
                <Coins className="w-8 h-8 text-primary mx-auto mb-3" />
                <p className="font-display font-bold text-secondary">No grants found</p>
                <p className="text-sm text-secondary/60 mt-1">Try a different search or filter.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredGrants.map((g) => (
                  <div
                    key={g.id}
                    className="bg-white rounded-2xl border border-secondary/10 p-5 flex flex-col cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
                    onClick={() => setSelectedGrant(g)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-display font-bold text-secondary leading-snug line-clamp-2">{g.title}</h3>
                      {g.source && (
                        <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          g.source === 'Grants.gov' ? 'bg-blue-100 text-blue-700'
                          : g.source === 'EU Funding' ? 'bg-amber-100 text-amber-700'
                          : 'bg-secondary/10 text-secondary/50'
                        }`}>
                          {g.source === 'EU Funding' ? 'EU' : 'US'}
                        </span>
                      )}
                    </div>
                    {g.agency && (
                      <p className="text-xs text-secondary/50 mb-1">{g.agency}</p>
                    )}
                    {g.description && (
                      <p className="text-xs text-secondary/60 mb-3 line-clamp-2">{g.description}</p>
                    )}
                    <div className="space-y-1.5 mb-3">
                      {g.amount && (
                        <div className="flex items-center gap-1.5 text-sm text-secondary">
                          <Coins className="w-3.5 h-3.5 text-primary" /> {g.amount}
                        </div>
                      )}
                      {g.deadline && (
                        <div className="flex items-center gap-1.5 text-xs text-secondary/60">
                          <Calendar className="w-3.5 h-3.5" /> Deadline: {g.deadline}
                        </div>
                      )}
                    </div>
                    {(g.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {g.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/15 text-secondary px-2 py-0.5 rounded-full">
                            <Tag className="w-2.5 h-2.5" /> {tag}
                          </span>
                        ))}
                        {g.tags.length > 4 && (
                          <span className="text-[10px] text-secondary/40">+{g.tags.length - 4}</span>
                        )}
                      </div>
                    )}
                    <div className="mt-auto flex items-center justify-end pt-2">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-accent transition-colors">
                        View Details <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Talent Pool Tab ───────────────────────────────────────────── */}
        {tab === 'talent' && (
          <div>
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
                    {(s.hubRating > 0 || s.hubRecommend) && (
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {s.hubRating > 0 && <StarRow rating={s.hubRating} />}
                        {s.hubRecommend && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-secondary bg-primary/15 px-2 py-0.5 rounded-full">
                            <BadgeCheck className="w-3.5 h-3.5" /> Recommended
                          </span>
                        )}
                      </div>
                    )}
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
                    <div className="mt-auto flex items-center gap-2">
                      <a
                        href={`/portfolio/${s.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-secondary text-sm font-bold hover:bg-primary/90 transition-colors"
                        title="Open public portfolio"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Portfolio
                      </a>
                      <button
                        onClick={() => setViewing(s)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-white text-sm font-semibold hover:bg-accent transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Profile
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Profile Tab ───────────────────────────────────────────────── */}
        {tab === 'profile' && (
          <div>
            <div className="bg-white rounded-2xl border border-secondary/10 p-6">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-secondary">Organization profile</h2>
                  <p className="text-xs text-secondary/50">
                    Your registered organization is shown automatically in the partners section of the
                    landing page. Customize how it appears.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-secondary mb-1.5">
                    Organization name
                  </label>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder={user?.name || 'Organization name'}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                  />
                  <p className="text-xs text-secondary/50 mt-1">
                    Leave blank to use your account name as the partner name.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-secondary mb-1.5">
                    Logo image
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      value={orgLogo}
                      onChange={(e) => setOrgLogo(e.target.value)}
                      placeholder="https://…/logo.png or upload below"
                      className="flex-1 px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                    />
                    {orgLogo && (
                      <div className="relative shrink-0">
                        <img
                          src={orgLogo}
                          alt="logo preview"
                          className="w-11 h-11 rounded-full bg-white ring-1 ring-secondary/10 object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setOrgLogo('')}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                          aria-label="Remove logo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      ref={logoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onLogoFile}
                    />
                    <button
                      type="button"
                      onClick={() => logoRef.current?.click()}
                      disabled={orgReading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/5 hover:bg-secondary/10 text-xs font-semibold text-secondary transition-colors disabled:opacity-60"
                    >
                      {orgReading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                      Upload logo
                    </button>
                    <span className="text-[11px] text-secondary/40">
                      JPG or PNG — large photos are auto-resized; leave blank for an auto-generated logo.
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={saveOrg}
                  disabled={orgSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-accent disabled:opacity-60 transition-colors"
                >
                  {orgSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save partner info
                </button>
                {orgMsg && <span className="text-xs text-emerald-700">{orgMsg}</span>}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Seeker detail modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex p-4 bg-secondary/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl relative overflow-hidden m-auto">
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

              <EndorsePanel
                key={viewing.id}
                seeker={viewing}
                token={token}
                hubName={user?.company || user?.name}
                onSaved={(updated) => {
                  setSeekers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                  setViewing(updated);
                }}
              />

              <div className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> Registered via your link
              </div>
            </div>
            <div className="p-6 pt-0 space-y-2">
              <a
                href={`/portfolio/${viewing.id}`}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> View public portfolio
              </a>
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

      {/* Grant detail modal */}
      {selectedGrant && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedGrant(null)}>
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-secondary/10 px-6 py-4 flex items-start justify-between gap-4 rounded-t-3xl">
              <div className="flex items-center gap-4 min-w-0">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  selectedGrant.source === 'Grants.gov' ? 'bg-blue-100' : 'bg-amber-100'
                }`}>
                  <Coins className={`w-6 h-6 ${selectedGrant.source === 'Grants.gov' ? 'text-blue-700' : 'text-amber-700'}`} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-bold text-secondary leading-tight">{selectedGrant.title}</h2>
                  <p className="text-sm text-secondary/60">{selectedGrant.agency}</p>
                </div>
              </div>
              <button onClick={() => setSelectedGrant(null)} className="p-2 rounded-lg hover:bg-secondary/5 transition-colors shrink-0">
                <X className="w-5 h-5 text-secondary/60" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Meta row */}
              <div className="flex flex-wrap gap-2">
                {selectedGrant.source && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                    selectedGrant.source === 'Grants.gov' ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                  }`}>
                    {selectedGrant.source}
                  </span>
                )}
                {selectedGrant.status && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                    {selectedGrant.status}
                  </span>
                )}
                {selectedGrant.amount && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
                    <Coins className="w-3 h-3" /> {selectedGrant.amount}
                  </span>
                )}
                {selectedGrant.deadline && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700">
                    <Calendar className="w-3 h-3" /> {selectedGrant.deadline}
                  </span>
                )}
              </div>

              {/* Eligibility */}
              {selectedGrant.eligibility && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-secondary/40 mb-2">Eligibility</h4>
                  <p className="text-sm text-secondary/70">{selectedGrant.eligibility}</p>
                </div>
              )}

              {/* Tags */}
              {(selectedGrant.tags || []).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-secondary/40 mb-2">Categories</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedGrant.tags.map((tag) => (
                      <span key={tag} className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/15 text-secondary">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedGrant.description && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-secondary/40 mb-2">Description</h4>
                  <div className="text-sm text-secondary/70 leading-relaxed whitespace-pre-line">
                    {selectedGrant.description}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-secondary/10 px-6 py-4 flex items-center justify-between gap-3 rounded-b-3xl">
              <p className="text-xs text-secondary/40">
                via {selectedGrant.source}
              </p>
              <div className="flex items-center gap-3">
                {selectedGrant.url && (
                  <a
                    href={selectedGrant.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 transition-colors"
                  >
                    View on {selectedGrant.source} <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {selectedGrant.url && (
                  <a
                    href={selectedGrant.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-secondary hover:bg-accent transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> Apply Now
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <SupportCenter token={token} userRole="hub" open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}
