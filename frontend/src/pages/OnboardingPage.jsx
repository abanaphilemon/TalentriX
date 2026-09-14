import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Network,
  Link as LinkIcon,
  Globe,
  Github,
  Mail,
  Phone,
  MapPin,
  Languages,
  FolderGit2,
  Upload,
  ImagePlus,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  LogOut,
  Sparkles,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useContent } from '../context/ContentContext.jsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';
const textCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm resize-none';
const selectCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';

function Field({ label, hint, icon: Icon, children, span }) {
  return (
    <div className={span || ''}>
      <label className="block text-sm font-semibold text-secondary mb-1.5">{label}</label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40 pointer-events-none" />}
        {children}
      </div>
      {hint && <p className="text-xs text-secondary/50 mt-1">{hint}</p>}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, step }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-primary font-display text-secondary font-bold grid place-items-center shrink-0">
        {step}
      </div>
      <div>
        <h3 className="font-display text-lg font-bold text-secondary leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-secondary/50 mt-0.5">{subtitle}</p>}
      </div>
      {Icon && <Icon className="w-5 h-5 text-primary ml-auto" />}
    </div>
  );
}

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
      {values.length > 0 ? (
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
      ) : null}
    </div>
  );
}

const ROLES_META = {
  seeker: {
    eyebrow: 'Build your portfolio',
    title: 'Your job seeker portfolio',
    subtitle:
      'This is where your profile starts — employers see it before they ever talk to you. You can edit everything later in Dashboard → Settings.',
  },
  hub: {
    eyebrow: 'Hub onboarding',
    title: 'Set up your talent hub',
    subtitle:
      'Tell the platform about your hub and grab your unique registration link to build your talent pool. Editable later in your dashboard.',
  },
  employer: {
    eyebrow: 'Employer onboarding',
    title: 'Set up your company',
    subtitle:
      'Tell the platform about your company so talent can see who you are. Editable later in your dashboard.',
  },
};

export default function OnboardingPage() {
  const { user, role, signOut, updateUser } = useAuth();
  const { content } = useContent();
  const branding = content.branding || {};
  const navigate = useNavigate();

  const token = localStorage.getItem('tbai.token');
  const meta = ROLES_META[role] || ROLES_META.seeker;

  const [form, setForm] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const [hubLink, setHubLink] = useState('');
  const [copied, setCopied] = useState(false);

  const photoRef = useRef(null);
  const [photoReading, setPhotoReading] = useState(false);
  const [cvReading, setCvReading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const portfolioUrl = `${window.location.origin}/portfolio/${user?.id}`;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          const p = d.profile;
          if (!active) return;
          setForm({
            name: p.name || user?.name || '',
            company: p.company || '',
            title: p.title || '',
            location: p.location || '',
            bio: p.bio || '',
            linkedin: p.linkedin || '',
            logo: p.logo || '',
            avatar: p.avatar || '',
            phone: p.phone || '',
            github: p.github || '',
            website: p.website || '',
            availability: p.availability || '',
            summary: p.summary || '',
            skills: p.skills || [],
            languages: p.languages || [],
            projects: (p.projects || []).map((x) => ({ ...x })),
            cv: p.cv || '',
          });
        }
      } catch {
        // ignore
      } finally {
        if (active) setLoaded(true);
      }
    })();

    if (role === 'hub') {
      fetch(`${API_URL}/hub/link`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setHubLink(d.link))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const onPhotoFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setMsg('Please choose an image file.');
    if (file.size > 1 * 1024 * 1024) return setMsg('Photo is too large — use an image under 1 MB.');
    setMsg('');
    setPhotoReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      set('avatar', reader.result);
      setPhotoReading(false);
    };
    reader.onerror = () => {
      setMsg('Could not read that image. Try another.');
      setPhotoReading(false);
    };
    reader.readAsDataURL(file);
  };

  const onCvFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/(pdf|document|ms-word|text)/.test(file.type) && !/\.(pdf|doc|docx|txt)$/i.test(file.name)) {
      return setMsg('Please choose a PDF, DOC, DOCX or TXT file.');
    }
    if (file.size > 5 * 1024 * 1024) return setMsg('CV is too large — use a file under 5 MB.');
    setMsg('');
    setCvReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      set('cv', reader.result);
      setCvReading(false);
    };
    reader.onerror = () => {
      setMsg('Could not read that file. Try another.');
      setCvReading(false);
    };
    reader.readAsDataURL(file);
  };

  const finish = async () => {
    // Onboarding is mandatory — validate the essentials before submitting.
    if (!form.name || !form.name.trim()) {
      setMsg('Please enter your full name to continue.');
      return;
    }
    if (role === 'seeker' && !form.title?.trim()) {
      setMsg('Please add a headline / desired role so employers can find you.');
      return;
    }
    if (role !== 'seeker' && !form.company?.trim()) {
      setMsg(`Please enter your ${role === 'hub' ? 'hub' : 'company'} name to continue.`);
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const body = {
        name: form.name,
        company: form.company,
        title: form.title,
        location: form.location,
        bio: form.bio,
        linkedin: form.linkedin,
        logo: form.logo,
        avatar: form.avatar,
        phone: form.phone,
        github: form.github,
        website: form.website,
        availability: form.availability,
        summary: form.summary,
        skills: form.skills,
        languages: form.languages,
        resumeLink: form.resumeLink,
        cv: form.cv,
        onboardingDone: true,
      };
      const res = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMsg(d.message || 'Could not save. Try again.');
        return;
      }
      // Keep the auth context in sync so routing knows onboarding is done and
      // picks up the latest moderation status straight from the server.
      const d = await res.json().catch(() => null);
      if (d?.profile) {
        updateUser({ onboardingDone: true, status: d.profile.status, active: d.profile.active });
      } else {
        updateUser({ onboardingDone: true });
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setMsg('Could not connect to server.');
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // Not signed in — shouldn't normally happen (guarded in App), but stay safe.
  if (!user || !token) {
    return (
      <Shell branding={branding}>
        <div className="text-center py-10">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h1 className="font-display text-xl font-bold text-secondary">Sign in required</h1>
          <p className="text-sm text-secondary/60 mt-1">Please <a className="underline text-primary" href="/">go home and sign in</a>.</p>
        </div>
      </Shell>
    );
  }

  if (done) {
    const userStatus = user?.status || 'pending';
    return (
      <main className="min-h-screen bg-[#faf9f6]">
        <Topbar branding={branding} user={user} signOut={signOut} />
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="bg-white rounded-3xl border border-secondary/10 p-8 md:p-10 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mb-5">
              <ShieldCheck className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-secondary">Profile saved — awaiting admin approval</h1>
            <p className="text-secondary/60 text-sm mt-2 leading-relaxed">
              Your account has been submitted for review. A site administrator will approve it shortly.
              Once approved, your dashboard and {role === 'seeker' ? 'portfolio' : 'account'} become fully active.
            </p>

            {role === 'seeker' && (
              <div className="mt-6 rounded-2xl bg-secondary text-white p-6">
                <div className="flex items-center gap-2 mb-1">
                  <LinkIcon className="w-4 h-4 text-primary" />
                  <h3 className="font-display font-bold">Your portfolio link (individual link)</h3>
                </div>
                <p className="text-white/60 text-xs mb-3">
                  Goes live as soon as your account is approved. Share it anywhere afterwards.
                </p>
                <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 font-mono text-xs text-primary break-all">
                  {portfolioUrl}
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => copy(portfolioUrl)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-secondary text-sm font-bold hover:bg-primary/90 transition-colors">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                  <a href={portfolioUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors">
                    <ExternalLink className="w-4 h-4" /> Preview
                  </a>
                </div>
              </div>
            )}

            {role === 'hub' && hubLink && (
              <div className="mt-6 rounded-2xl bg-secondary text-white p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Network className="w-4 h-4 text-primary" />
                  <h3 className="font-display font-bold">Your hub registration link</h3>
                </div>
                <p className="text-white/60 text-xs mb-3">Share this link to grow your talent pool. Talents who join through it are linked to you.</p>
                <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 font-mono text-xs text-primary break-all">
                  {hubLink}
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => copy(hubLink)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-secondary text-sm font-bold hover:bg-primary/90 transition-colors">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
              </div>
            )}

            <div className={`mt-6 p-3 rounded-xl text-sm flex items-start gap-2 ${
              userStatus === 'rejected'
                ? 'bg-red-50 border border-red-200 text-red-700'
                : userStatus === 'pending'
                ? 'bg-amber-50 border border-amber-200 text-amber-800'
                : 'bg-green-50 border border-green-200 text-green-700'
            }`}>
              {userStatus === 'pending'
                ? 'Status: pending approval — an admin will review your account.'
                : userStatus === 'rejected'
                ? 'Status: rejected — contact an administrator for help.'
                : 'Status: approved — you may proceed to your dashboard.'}
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              <button
                onClick={() => navigate(`/dashboard/${role}`)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors"
              >
                Go to dashboard <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={signOut}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary/5 text-secondary font-semibold hover:bg-secondary/10 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Log out
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf9f6]">
      <Topbar branding={branding} user={user} signOut={signOut} />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 text-primary text-[11px] font-bold uppercase tracking-widest mb-2">
            <Sparkles className="w-3.5 h-3.5" /> {meta.eyebrow}
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-secondary">{meta.title}</h1>
          <p className="text-secondary/60 text-sm mt-1 max-w-2xl">{meta.subtitle}</p>
        </div>

        {!loaded ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6 items-start">
            <div className="md:col-span-2 space-y-6">
              {role === 'hub' ? (
                <HubForm form={form} set={set} photoRef={photoRef} photoReading={photoReading} onPhotoFile={onPhotoFile} />
              ) : role === 'employer' ? (
                <EmployerForm form={form} set={set} photoRef={photoRef} photoReading={photoReading} onPhotoFile={onPhotoFile} />
              ) : (
                <SeekerForm
                  form={form}
                  set={set}
                  photoRef={photoRef}
                  photoReading={photoReading}
                  onPhotoFile={onPhotoFile}
                  cvReading={cvReading}
                  onCvFile={onCvFile}
                />
              )}

              {msg && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {msg}
                </div>
              )}

              <div className="bg-white rounded-2xl border border-secondary/10 p-6 sticky bottom-4 shadow-lg shadow-black/5">
                <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
                  <p className="text-xs text-secondary/50">
                    You can change everything after creation — this is just the first step.
                  </p>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => finish()}
                      disabled={saving}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-secondary text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {saving ? 'Saving…' : 'Save & submit for approval'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Side panel */}
            <div className="space-y-6">
              <div className="bg-secondary text-white rounded-2xl p-7">
                <h3 className="font-display font-bold text-primary flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" /> After you save
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-white/70">
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Your account is submitted for admin approval.</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> An admin approves your account before you get full access.</li>
                  <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> You can edit all of this later in your dashboard.</li>
                </ul>
              </div>

              {role === 'seeker' && (
                <div className="bg-white rounded-2xl border border-secondary/10 p-7">
                  <div className="flex items-center gap-2 mb-2">
                    <LinkIcon className="w-4 h-4 text-primary" />
                    <h3 className="font-display font-bold text-secondary">Your portfolio link</h3>
                  </div>
                  <p className="text-sm text-secondary/60 mb-3">
                    Everything here becomes your public portfolio page. It goes live once you're approved.
                  </p>
                  <div className="bg-secondary/5 border border-secondary/10 rounded-xl px-3 py-2.5 font-mono text-xs text-secondary break-all">
                    {portfolioUrl}
                  </div>
                </div>
              )}

              {role === 'hub' && hubLink && (
                <div className="bg-white rounded-2xl border border-secondary/10 p-7">
                  <div className="flex items-center gap-2 mb-2">
                    <Network className="w-4 h-4 text-primary" />
                    <h3 className="font-display font-bold text-secondary">Your hub registration link</h3>
                  </div>
                  <div className="bg-secondary/5 border border-secondary/10 rounded-xl px-3 py-2.5 font-mono text-xs text-secondary break-all mb-3">
                    {hubLink}
                  </div>
                  <button
                    onClick={() => copy(hubLink)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-accent transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Topbar({ branding, user, signOut }) {
  return (
    <header className="bg-white border-b border-secondary/10 sticky top-0 z-20">
      <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
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
          <span className="text-sm text-secondary/60 hidden sm:inline">{user?.name || user?.email}</span>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </div>
    </header>
  );
}

function Shell({ branding, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-hero-gradient">
      <div className="glass rounded-3xl shadow-2xl w-full max-w-md p-5 sm:p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center overflow-hidden">
            {branding.logo ? (
              <img src={branding.logo} alt="logo" className="w-full h-full object-contain p-1.5" />
            ) : (
              <Network className="w-5 h-5 text-secondary" />
            )}
          </div>
          <span className="font-display font-bold text-secondary">{branding.name || 'TalentriX'}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Seeker: portfolio builder (individual links shown up top) ──
function SeekerForm({ form, set, photoRef, photoReading, onPhotoFile, cvReading, onCvFile }) {
  return (
    <>
      <div className="bg-white rounded-2xl border border-secondary/10 p-8">
        <SectionTitle step={1} title="Photo & basics" subtitle="The header of your portfolio — make a great first impression." />
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="flex flex-col items-center gap-3 shrink-0">
            <img
              src={form.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name || 'Seeker')}&background=FFD700&color=000&size=128`}
              alt="Profile"
              className="w-24 h-24 rounded-2xl object-cover ring-2 ring-primary bg-white"
            />
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={onPhotoFile} />
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              disabled={photoReading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-secondary/5 hover:bg-secondary/10 text-xs font-semibold text-secondary transition-colors disabled:opacity-60"
            >
              {photoReading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
              {form.avatar ? 'Change photo' : 'Upload photo'}
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 flex-1">
            <Field label="Full name">
              <input className={inputCls} value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Headline / desired role">
              <input className={inputCls} placeholder="e.g. Senior Frontend Engineer" value={form.title || ''} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label="Availability">
              <select className={selectCls} value={form.availability || ''} onChange={(e) => set('availability', e.target.value)}>
                <option value="">Select…</option>
                <option>Open to work</option>
                <option>Open to relocation</option>
                <option>Open to freelance / contract</option>
                <option>Actively interviewing</option>
                <option>Employed — not looking</option>
              </select>
            </Field>
            <Field label="Location" icon={MapPin}>
              <input className={`${inputCls} pl-9`} placeholder="e.g. Lagos, Nigeria / Remote" value={form.location || ''} onChange={(e) => set('location', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-secondary/10 p-8">
        <SectionTitle step={2} icon={LinkIcon} title="Your individual links" subtitle="LinkedIn, GitHub and personal sites — employers click these first." />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Phone" icon={Phone}>
            <input className={`${inputCls} pl-9`} placeholder="+234 …" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="LinkedIn URL" icon={ExternalLink}>
            <input className={`${inputCls} pl-9`} placeholder="linkedin.com/in/your-handle" value={form.linkedin || ''} onChange={(e) => set('linkedin', e.target.value)} />
          </Field>
          <Field label="GitHub URL" icon={Github}>
            <input className={`${inputCls} pl-9`} placeholder="github.com/your-handle" value={form.github || ''} onChange={(e) => set('github', e.target.value)} />
          </Field>
          <Field label="Website / portfolio URL" icon={Globe}>
            <input className={`${inputCls} pl-9`} placeholder="https://yourdomain.com" value={form.website || ''} onChange={(e) => set('website', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Summary" hint="One or two punchy sentences for the top of your portfolio.">
              <textarea rows={2} className={textCls} placeholder="e.g. Frontend engineer with 6+ years shipping products for 2M+ users." value={form.summary || ''} onChange={(e) => set('summary', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-secondary/10 p-8">
        <SectionTitle step={3} icon={Languages} title="Skills & languages" subtitle="Skills power your job-match score." />
        <div className="grid sm:grid-cols-2 gap-6">
          <Field label="Core skills" hint="Press Enter to add.">
            <ChipsInput values={form.skills || []} onChange={(v) => set('skills', v)} placeholder="e.g. React, Python, Figma…" />
          </Field>
          <Field label="Languages">
            <ChipsInput values={form.languages || []} onChange={(v) => set('languages', v)} placeholder="e.g. English, French…" />
          </Field>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-secondary/10 p-8">
        <SectionTitle step={4} icon={FolderGit2} title="Featured projects" subtitle="Links help employers see you in action." />
        {(form.projects || []).map((p, i) => (
          <div key={i} className="rounded-2xl border border-secondary/10 bg-secondary/[0.02] p-5 mb-4 grid sm:grid-cols-2 gap-4">
            <Field label="Project name">
              <input className={inputCls} placeholder="e.g. Taskflow — project manager app" value={p.name || ''} onChange={(e) => set('projects', form.projects.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))} />
            </Field>
            <Field label="Project link">
              <input className={inputCls} placeholder="https://…" value={p.link || ''} onChange={(e) => set('projects', form.projects.map((x, j) => (i === j ? { ...x, link: e.target.value } : x)))} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="What it does">
                <input className={inputCls} placeholder="Problem, your solution, the impact…" value={p.description || ''} onChange={(e) => set('projects', form.projects.map((x, j) => (i === j ? { ...x, description: e.target.value } : x)))} />
              </Field>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set('projects', [...(form.projects || []), { name: '', link: '', description: '' }])}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-secondary/15 text-sm font-semibold text-secondary/60 hover:text-secondary hover:border-primary transition-all"
        >
          + Add a project
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-secondary/10 p-8">
        <SectionTitle step={5} icon={Mail} title="Curriculum vitae (CV)" subtitle="A formal document employers can download." />
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <input type="file" id="ob-cv-upload" accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,text/plain" className="hidden" onChange={onCvFile} />
          <button
            type="button"
            onClick={() => document.getElementById('ob-cv-upload')?.click()}
            disabled={cvReading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-60"
          >
            {cvReading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {form.cv ? 'Replace CV' : 'Upload CV'}
          </button>
          <p className="text-sm text-secondary/60">{form.cv ? 'CV attached ✓' : 'No CV attached yet.'}</p>
        </div>
      </div>
    </>
  );
}

// ── Hub: org profile + registration link ──
function HubForm({ form, set, photoRef, photoReading, onPhotoFile }) {
  return (
    <div className="bg-white rounded-2xl border border-secondary/10 p-8">
      <SectionTitle step={1} icon={Building2} title="Hub basics" subtitle="Your hub's public profile." />
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="flex flex-col items-center gap-3 shrink-0">
          <img
            src={form.logo || `https://ui-avatars.com/api/?name=${encodeURIComponent(form.company || form.name || 'Hub')}&background=FFD700&color=000&size=128`}
            alt="Logo"
            className="w-24 h-24 rounded-2xl object-cover ring-2 ring-primary bg-white"
          />
          <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={onPhotoFile} />
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            disabled={photoReading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-secondary/5 hover:bg-secondary/10 text-xs font-semibold text-secondary transition-colors disabled:opacity-60"
          >
            {photoReading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {form.logo ? 'Change logo' : 'Upload logo'}
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 flex-1">
          <Field label="Hub name">
            <input className={inputCls} value={form.company || form.name || ''} onChange={(e) => set('company', e.target.value)} />
          </Field>
          <Field label="Location" icon={MapPin}>
            <input className={`${inputCls} pl-9`} placeholder="e.g. Lagos, Nigeria" value={form.location || ''} onChange={(e) => set('location', e.target.value)} />
          </Field>
          <Field label="LinkedIn URL" icon={ExternalLink}>
            <input className={`${inputCls} pl-9`} placeholder="linkedin.com/company/your-hub" value={form.linkedin || ''} onChange={(e) => set('linkedin', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="About your hub">
              <textarea rows={4} className={textCls} placeholder="What kind of talent do you source and support?" value={form.bio || ''} onChange={(e) => set('bio', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Employer: company profile ──
function EmployerForm({ form, set, photoRef, photoReading, onPhotoFile }) {
  return (
    <div className="bg-white rounded-2xl border border-secondary/10 p-8">
      <SectionTitle step={1} icon={Building2} title="Company basics" subtitle="Your company's public profile." />
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="flex flex-col items-center gap-3 shrink-0">
          <img
            src={form.logo || `https://ui-avatars.com/api/?name=${encodeURIComponent(form.company || 'Company')}&background=FFD700&color=000&size=128`}
            alt="Logo"
            className="w-24 h-24 rounded-2xl object-cover ring-2 ring-primary bg-white"
          />
          <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={onPhotoFile} />
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            disabled={photoReading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-secondary/5 hover:bg-secondary/10 text-xs font-semibold text-secondary transition-colors disabled:opacity-60"
          >
            {photoReading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {form.logo ? 'Change logo' : 'Upload logo'}
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 flex-1">
          <Field label="Company name">
            <input className={inputCls} value={form.company || form.name || ''} onChange={(e) => set('company', e.target.value)} />
          </Field>
          <Field label="Role you fill">
            <input className={inputCls} placeholder="e.g. Hiring Manager, HR Lead" value={form.title || ''} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Location" icon={MapPin}>
            <input className={`${inputCls} pl-9`} placeholder="e.g. Remote / Lagos" value={form.location || ''} onChange={(e) => set('location', e.target.value)} />
          </Field>
          <Field label="LinkedIn URL" icon={ExternalLink}>
            <input className={`${inputCls} pl-9`} placeholder="linkedin.com/company/your-co" value={form.linkedin || ''} onChange={(e) => set('linkedin', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="About your company">
              <textarea rows={4} className={textCls} placeholder="Tell talent what it's like to work with you." value={form.bio || ''} onChange={(e) => set('bio', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}