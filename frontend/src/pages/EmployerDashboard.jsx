import { useEffect, useState } from 'react';
import {
  Briefcase,
  MapPin,
  Link as LinkIcon,
  Save,
  User,
  Users,
  LogOut,
  Eye,
  Pencil,
  Search,
  Loader2,
  CheckCircle2,
  FileText,
  Building2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Small reusable input field
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

const inputCls =
  'w-full pl-10 pr-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all';

export default function EmployerDashboard() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState('profile'); // 'profile' | 'seekers'
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [savedMsg, setSavedMsg] = useState('');

  // Seekers state
  const [seekers, setSeekers] = useState([]);
  const [seekersLoading, setSeekersLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'hub'
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState(null); // seeker detail modal

  const token = localStorage.getItem('tbai.token');

  const loadProfile = async () => {
    try {
      const res = await fetch(`${API_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setProfile(d.profile);
        setForm({
          name: d.profile.name || '',
          company: d.profile.company || '',
          title: d.profile.title || '',
          location: d.profile.location || '',
          bio: d.profile.bio || '',
          linkedin: d.profile.linkedin || '',
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadSeekers = async () => {
    setSeekersLoading(true);
    try {
      const qs = sourceFilter === 'hub' ? '?source=hub' : '';
      const res = await fetch(`${API_URL}/seekers${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setSeekers(d.seekers);
      }
    } catch {
      // ignore
    } finally {
      setSeekersLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'seekers') loadSeekers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sourceFilter]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveProfile = async () => {
    setSaving(true);
    setSavedMsg('');
    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const d = await res.json();
        setProfile(d.profile);
        setSavedMsg('Profile saved.');
        setTimeout(() => setSavedMsg(''), 2500);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const filteredSeekers = seekers.filter((s) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      (s.skills || []).join(' ').toLowerCase().includes(q)
    );
  });

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
              <Briefcase className="w-4 h-4 text-secondary" />
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
        {/* Heading */}
        <div className="mb-6">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-secondary">
            Employer Dashboard
          </h1>
          <p className="text-secondary/60 text-sm mt-1">
            Manage your profile and discover talent to hire.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-secondary/5 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab('profile')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'profile'
                ? 'bg-primary text-secondary shadow-md'
                : 'text-secondary/60 hover:text-secondary'
            }`}
          >
            <User className="w-4 h-4" /> Profile
          </button>
          <button
            onClick={() => setTab('seekers')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'seekers'
                ? 'bg-primary text-secondary shadow-md'
                : 'text-secondary/60 hover:text-secondary'
            }`}
          >
            <Users className="w-4 h-4" /> Talent Pool
          </button>
        </div>

        {tab === 'profile' && (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Left card — view mode summary */}
            <div className="md:col-span-1">
              <div className="bg-white rounded-2xl border border-secondary/10 p-6">
                <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4">
                  <span className="font-display text-2xl font-bold text-secondary">
                    {initials(profile?.name || user?.name)}
                  </span>
                </div>
                <h2 className="font-display text-xl font-bold text-secondary">
                  {form.name || profile?.name || 'Your profile'}
                </h2>
                <p className="text-sm text-secondary/60 mt-0.5">{form.title || '—'}</p>
                {form.company && (
                  <div className="flex items-center gap-1.5 text-sm text-secondary/70 mt-2">
                    <Building2 className="w-4 h-4 text-secondary/40" /> {form.company}
                  </div>
                )}
                {form.location && (
                  <div className="flex items-center gap-1.5 text-sm text-secondary/70 mt-1">
                    <MapPin className="w-4 h-4 text-secondary/40" /> {form.location}
                  </div>
                )}
                {form.linkedin && (
                  <div className="flex items-center gap-1.5 text-sm text-secondary/70 mt-1">
                    <LinkIcon className="w-4 h-4 text-secondary/40" /> {form.linkedin}
                  </div>
                )}
              </div>
            </div>

            {/* Right card — edit form */}
            <div className="md:col-span-2">
              <div className="bg-white rounded-2xl border border-secondary/10 p-6">
                <h3 className="font-display text-lg font-bold text-secondary mb-4 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-primary" /> Edit Profile
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Full name" icon={User}>
                    <input
                      className={inputCls}
                      value={form.name || ''}
                      onChange={(e) => set('name', e.target.value)}
                    />
                  </Field>
                  <Field label="Job title" icon={Briefcase}>
                    <input
                      className={inputCls}
                      placeholder="e.g. Head of Engineering"
                      value={form.title || ''}
                      onChange={(e) => set('title', e.target.value)}
                    />
                  </Field>
                  <Field label="Company" icon={Building2}>
                    <input
                      className={inputCls}
                      placeholder="e.g. Acme Corp"
                      value={form.company || ''}
                      onChange={(e) => set('company', e.target.value)}
                    />
                  </Field>
                  <Field label="Location" icon={MapPin}>
                    <input
                      className={inputCls}
                      placeholder="e.g. San Francisco"
                      value={form.location || ''}
                      onChange={(e) => set('location', e.target.value)}
                    />
                  </Field>
                  <Field label="LinkedIn" icon={LinkIcon} className="sm:col-span-2">
                    <input
                      className={inputCls}
                      placeholder="linkedin.com/in/your-handle"
                      value={form.linkedin || ''}
                      onChange={(e) => set('linkedin', e.target.value)}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-secondary mb-1.5">Bio</label>
                    <textarea
                      rows={3}
                      placeholder="Tell candidates about your company and what you're hiring for…"
                      className="w-full p-3 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all resize-none"
                      value={form.bio || ''}
                      onChange={(e) => set('bio', e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="btn-primary inline-flex items-center gap-2 justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save changes
                  </button>
                  {savedMsg && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-green-700">
                      <CheckCircle2 className="w-4 h-4" /> {savedMsg}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'seekers' && (
          <div>
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40 pointer-events-none" />
                <input
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                  placeholder="Search talent by name, email, or skill…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1 bg-secondary/5 p-1 rounded-xl w-fit">
                <button
                  onClick={() => setSourceFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    sourceFilter === 'all'
                      ? 'bg-primary text-secondary shadow'
                      : 'text-secondary/60 hover:text-secondary'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setSourceFilter('hub')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    sourceFilter === 'hub'
                      ? 'bg-primary text-secondary shadow'
                      : 'text-secondary/60 hover:text-secondary'
                  }`}
                >
                  Via Hub link
                </button>
              </div>
            </div>

            {seekersLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredSeekers.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-secondary/20 p-12 text-center">
                <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
                <p className="font-display font-bold text-secondary">
                  No talent found
                </p>
                <p className="text-sm text-secondary/60 mt-1">
                  {sourceFilter === 'hub'
                    ? 'No seekers have registered through a hub link yet.'
                    : 'Seekers who register will appear here for you to discover.'}
                </p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSeekers.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white rounded-2xl border border-secondary/10 p-5 flex flex-col"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                        <span className="font-display font-bold text-secondary">
                          {initials(s.name)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-secondary truncate">{s.name}</div>
                        <div className="text-xs text-secondary/50 truncate">{s.email}</div>
                      </div>
                    </div>

                    {s.title && (
                      <div className="text-sm text-secondary/70 mb-2">{s.title}</div>
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

                    <div className="mt-auto flex items-center justify-between pt-3 border-t border-secondary/5">
                      {s.hubId ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Via hub link
                        </span>
                      ) : (
                        <span className="text-xs text-secondary/40">Direct</span>
                      )}
                      <button
                        onClick={() => setViewing(s)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-white text-sm font-semibold hover:bg-accent transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Seeker detail modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-secondary/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl relative overflow-hidden">
            {/* header */}
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
                  {viewing.title && <p className="text-white/60 text-sm mt-0.5">{viewing.title}</p>}
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {(viewing.skills || []).length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-secondary/50 mb-2">
                    Skills
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {viewing.skills.map((s2) => (
                      <span
                        key={s2}
                        className="text-xs font-medium bg-primary/15 text-secondary px-2.5 py-1 rounded-full"
                      >
                        {s2}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {viewing.summary && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1">
                    Summary
                  </div>
                  <p className="text-sm text-secondary/80">{viewing.summary}</p>
                </div>
              )}

              {viewing.experience && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1">
                    Experience
                  </div>
                  <p className="text-sm text-secondary/80">{viewing.experience}</p>
                </div>
              )}

              {viewing.location && (
                <div className="flex items-center gap-1.5 text-sm text-secondary/70">
                  <MapPin className="w-4 h-4 text-secondary/40" /> {viewing.location}
                </div>
              )}

              {viewing.resumeLink && (
                <a
                  href={viewing.resumeLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 underline"
                >
                  <FileText className="w-4 h-4" /> View resume
                </a>
              )}

              {viewing.hubId && (
                <div className="text-xs text-emerald-700 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Registered via hub link
                </div>
              )}
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
