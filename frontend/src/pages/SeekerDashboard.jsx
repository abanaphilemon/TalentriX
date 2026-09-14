import { useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  User,
  Settings as SettingsIcon,
  Link as LinkIcon,
  Copy,
  Check,
  Upload,
  FileText,
  LogOut,
  Loader2,
  CheckCircle2,
  Search,
  Plus,
  X,
  Eye,
  ExternalLink,
  Building2,
  Clock,
  AlertCircle,
  ImagePlus,
  GraduationCap,
  Award,
  FolderGit2,
  Languages,
  Mail,
  Phone,
  Github,
  Globe,
  MapPin,
  Lightbulb,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useContent } from '../context/ContentContext.jsx';
import SecureChat, { fetchUnreadCount } from '../components/SecureChat.jsx';
import { ensureKeys } from '../lib/e2e.js';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';
const textCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm resize-none';
const selectCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';

function Field({ label, hint, icon: Icon, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-secondary mb-1.5">{label}</label>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40 pointer-events-none" />
        )}
        {children}
      </div>
      {hint && <p className="text-xs text-secondary/50 mt-1">{hint}</p>}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, badge }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-secondary" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold text-secondary leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-secondary/50 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {badge}
    </div>
  );
}

function ChipsInput({ values, onChange, placeholder, emptyText }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  const add = () => {
    const v = text.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setText('');
      return;
    }
    onChange([...values, v]);
    setText('');
  };

  return (
    <div>
      <div
        className={`flex items-center gap-2 rounded-xl bg-white border transition-all ${
          focused ? 'border-primary ring-2 ring-primary/30' : 'border-secondary/10'
        }`}
      >
        <input
          className="flex-1 min-w-0 px-3 py-2.5 bg-transparent outline-none text-sm"
          placeholder={placeholder}
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
        <div className="flex flex-wrap gap-1.5 mt-3">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/15 text-secondary px-2.5 py-1 rounded-full">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-secondary/60 hover:text-secondary"
                aria-label={`Remove ${v}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        emptyText && <p className="text-xs text-secondary/40 mt-2">{emptyText}</p>
      )}
    </div>
  );
}

const ENTRY_CONFIGS = {
  experience: {
    plural: 'Work experience',
    subtitle: 'Every role you have held — appear on your portfolio as a timeline.',
    add: 'Add a role',
    blank: { title: '', company: '', start: '', end: '', current: false, description: '' },
    fields: [
      { k: 'title', label: 'Job title', placeholder: 'e.g. Senior Frontend Engineer', span: 'sm:col-span-1' },
      { k: 'company', label: 'Company', placeholder: 'e.g. Acme Inc.', span: 'sm:col-span-1' },
      { k: 'start', label: 'Start', placeholder: 'e.g. Jan 2021', span: 'sm:col-span-1' },
      { k: 'end', label: 'End', placeholder: 'e.g. Dec 2023', span: 'sm:col-span-1' },
      { k: 'current', label: 'I currently work here', type: 'checkbox', span: 'sm:col-span-2' },
      { k: 'description', label: "What you did & achieved", type: 'textarea', placeholder: 'Bullet points of responsibilities and wins…', span: 'sm:col-span-2' },
    ],
  },
  education: {
    plural: 'Education',
    subtitle: 'Schools and degrees that shape your story.',
    add: 'Add education',
    blank: { school: '', degree: '', field: '', start: '', end: '', current: false },
    fields: [
      { k: 'school', label: 'School / University', placeholder: 'e.g. University of Lagos', span: 'sm:col-span-2' },
      { k: 'degree', label: 'Degree', placeholder: 'e.g. B.Sc. Computer Science', span: 'sm:col-span-1' },
      { k: 'field', label: 'Field of study', placeholder: 'e.g. Software Engineering', span: 'sm:col-span-1' },
      { k: 'start', label: 'Start', placeholder: 'e.g. 2016', span: 'sm:col-span-1' },
      { k: 'end', label: 'End', placeholder: 'e.g. 2020', span: 'sm:col-span-1' },
      { k: 'current', label: 'Currently studying', type: 'checkbox', span: 'sm:col-span-2' },
    ],
  },
  certifications: {
    plural: 'Certifications',
    subtitle: 'Credible proof of your skills.',
    add: 'Add a certification',
    blank: { name: '', issuer: '', year: '' },
    fields: [
      { k: 'name', label: 'Certification', placeholder: 'e.g. AWS Certified Solutions Architect', span: 'sm:col-span-2' },
      { k: 'issuer', label: 'Issuer', placeholder: 'e.g. Amazon Web Services', span: 'sm:col-span-1' },
      { k: 'year', label: 'Year', placeholder: 'e.g. 2024', span: 'sm:col-span-1' },
    ],
  },
  projects: {
    plural: 'Projects',
    subtitle: 'Featured work you are proud of — links help employers see you in action.',
    add: 'Add a project',
    blank: { name: '', link: '', tech: '', description: '' },
    fields: [
      { k: 'name', label: 'Project name', placeholder: 'e.g. Taskflow — project manager app', span: 'sm:col-span-2' },
      { k: 'link', label: 'Project link', placeholder: 'https://…', span: 'sm:col-span-1' },
      { k: 'tech', label: 'Technologies', placeholder: 'e.g. React, Node.js, PostgreSQL', span: 'sm:col-span-1' },
      { k: 'description', label: 'What it does & your role', type: 'textarea', placeholder: 'Problem, your solution, the impact…', span: 'sm:col-span-2' },
    ],
  },
};

let uid = 0;
const uidKey = () => `new-${Date.now()}-${uid++}`;

function EntryEditor({ config, entries, onChange }) {
  const list = Array.isArray(entries) ? entries : [];
  const update = (idx, k, v, checked) => {
    const next = list.map((e, i) =>
      i === idx ? { ...e, [k]: k === 'current' ? checked : v } : e
    );
    onChange(next);
  };
  const remove = (idx) => onChange(list.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      {list.map((e, idx) => (
        <div key={e._id || e._key || idx} className="rounded-2xl border border-secondary/10 bg-secondary/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-widest text-secondary/40">
              {config.singular || config.plural} #{idx + 1}
            </span>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {config.fields.map((f) =>
              f.type === 'checkbox' ? (
                <label key={f.k} className={`inline-flex items-center gap-2.5 text-sm font-medium text-secondary ${f.span}`}>
                  <input
                    type="checkbox"
                    checked={!!e[f.k]}
                    onChange={(ev) => update(idx, f.k, ev.target.checked, ev.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  {f.label}
                </label>
              ) : f.type === 'textarea' ? (
                <div key={f.k} className={f.span}>
                  <label className="block text-sm font-semibold text-secondary mb-1.5">{f.label}</label>
                  <textarea
                    rows={3}
                    className={textCls}
                    placeholder={f.placeholder}
                    value={e[f.k] || ''}
                    onChange={(ev) => update(idx, f.k, ev.target.value)}
                  />
                </div>
              ) : (
                <div key={f.k} className={f.span}>
                  <label className="block text-sm font-semibold text-secondary mb-1.5">{f.label}</label>
                  <input
                    className={inputCls}
                    placeholder={f.placeholder}
                    value={e[f.k] || ''}
                    onChange={(ev) => update(idx, f.k, ev.target.value)}
                  />
                </div>
              )
            )}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...list, { ...config.blank, _key: uidKey() }])}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-secondary/15 text-sm font-semibold text-secondary/60 hover:text-secondary hover:border-primary transition-all"
      >
        <Plus className="w-4 h-4" /> {config.add}
      </button>
    </div>
  );
}

const initials = (name = '') =>
  name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const avatarFor = (name = '') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Seeker')}&background=FFD700&color=000&size=128`;

const ABS = {
  name: (p, c) => c.name || p?.name || '',
  title: (p, c) => c.title || p?.title || '',
  location: (p, c) => c.location || p?.location || '',
  pronouns: (p, c) => c.pronouns || p?.pronouns || '',
  phone: (p, c) => c.phone || p?.phone || '',
  linkedin: (p, c) => c.linkedin || p?.linkedin || '',
  github: (p, c) => c.github || p?.github || '',
  website: (p, c) => c.website || p?.website || '',
  availability: (p, c) => c.availability || p?.availability || '',
  bio: (p, c) => c.bio || p?.bio || '',
  summary: (p, c) => c.summary || p?.summary || '',
  avatar: (p, c) => c.avatar || p?.avatar || '',
  skills: (p, c) => (c.skills || p?.skills || []).filter(Boolean),
  languages: (p, c) => (c.languages || p?.languages || []).filter(Boolean),
};

export default function SeekerDashboard() {
  const { user, signOut } = useAuth();
  const { content } = useContent();
  const branding = content.branding || {};

  const [tab, setTab] = useState('jobs'); // 'jobs' | 'profile' | 'settings'
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Jobs
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [applied, setApplied] = useState(() => new Set());
  const [selectedJob, setSelectedJob] = useState(null);

  // Settings form
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [cvReading, setCvReading] = useState(false);
  const [cvMsg, setCvMsg] = useState('');
  const [photoReading, setPhotoReading] = useState(false);
  const photoRef = useRef(null);

  // Portfolio link
  const [copied, setCopied] = useState(false);

  // Secure chat
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const token = localStorage.getItem('tbai.token');

  // Register our E2E public key so employers can send us encrypted messages.
  useEffect(() => {
    if (!token) return;
    ensureKeys(token).catch(() => {});
  }, [token]);

  // Poll unread count for the Messages badge.
  useEffect(() => {
    if (!token) return;
    const tick = async () => setUnread(await fetchUnreadCount(token));
    tick();
    const iv = setInterval(tick, 15000);
    return () => clearInterval(iv);
  }, [token]);
  const portfolioUrl = `${window.location.origin}/portfolio/${user?.id}`;

  const loadProfile = async () => {
    try {
      const res = await fetch(`${API_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        const p = d.profile;
        setProfile(p);
        setForm({
          avatar: ABS.avatar(p, {}),
          name: ABS.name(p, {}),
          title: ABS.title(p, {}),
          location: ABS.location(p, {}),
          pronouns: ABS.pronouns(p, {}),
          phone: ABS.phone(p, {}),
          linkedin: ABS.linkedin(p, {}),
          github: ABS.github(p, {}),
          website: ABS.website(p, {}),
          availability: ABS.availability(p, {}),
          bio: ABS.bio(p, {}),
          summary: ABS.summary(p, {}),
          skills: ABS.skills(p, {}),
          languages: ABS.languages(p, {}),
          experience: (p?.experience || []).map((x) => ({ ...x })),
          education: (p?.education || []).map((x) => ({ ...x })),
          certifications: (p?.certifications || []).map((x) => ({ ...x })),
          projects: (p?.projects || []).map((x) => ({ ...x })),
          resumeLink: p?.resumeLink || '',
          cv: p?.cv || '',
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadJobs = async () => {
    setJobsLoading(true);
    try {
      const [localRes, externalRes] = await Promise.allSettled([
        fetch(`${API_URL}/jobs`),
        fetch(`${API_URL}/jobs/external`),
      ]);
      const localJobs =
        localRes.status === 'fulfilled' && localRes.value.ok
          ? (await localRes.value.json()).jobs || []
          : [];
      const externalJobs =
        externalRes.status === 'fulfilled' && externalRes.value.ok
          ? (await externalRes.value.json()).jobs || []
          : [];
      setJobs([...localJobs, ...externalJobs]);
    } catch {
      // ignore
    } finally {
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'jobs') loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setList = (k) => (v) => set(k, v);

  const mySkills = (profile?.skills || []).map((s) => s.toLowerCase());
  const myTitle = (form.title || '').toLowerCase();

  const matchFor = (job) => {
    const jobSkills = (job.skills || []).map((s) => s.toLowerCase());
    const jobTitle = (job.title || '').toLowerCase();

    // Role match: compare seeker's desired role against job title
    let roleScore = 0;
    if (myTitle && jobTitle) {
      const roleWords = myTitle.split(/\s+/).filter((w) => w.length > 2);
      const jobWords = jobTitle.split(/\s+/).filter((w) => w.length > 2);
      const roleHits = roleWords.filter((w) => jobWords.some((jw) => jw.includes(w) || w.includes(jw))).length;
      roleScore = roleWords.length > 0 ? roleHits / roleWords.length : 0;
    }

    // Skill match: overlap between seeker skills and job skills
    let skillScore = 0;
    if (jobSkills.length > 0) {
      const overlap = jobSkills.filter((s) => mySkills.includes(s)).length;
      skillScore = overlap / jobSkills.length;
    }

    // Weighted: 60% role, 40% skills (or all role if no skills listed)
    const score = jobSkills.length > 0
      ? roleScore * 0.6 + skillScore * 0.4
      : roleScore;

    return Math.round(score * 100);
  };

  const filteredJobs = jobs
    .filter((j) => (typeFilter === 'All' ? true : j.type === typeFilter))
    .filter((j) => (sourceFilter === 'All' ? true : j.source === sourceFilter))
    .filter((j) => {
      const query = q.trim().toLowerCase();
      if (!query) return true;
      return [j.title, j.company, j.location, j.description, ...(j.skills || [])]
        .join(' ')
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => matchFor(b) - matchFor(a));

  const cleanEntries = (arr) => (arr || []).map(({ _key, ...rest }) => rest);

  const saveProfile = async () => {
    setSaving(true);
    setSavedMsg('');
    setCvMsg('');
    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          avatar: form.avatar,
          name: form.name,
          title: form.title,
          location: form.location,
          pronouns: form.pronouns,
          phone: form.phone,
          bio: form.bio,
          linkedin: form.linkedin,
          github: form.github,
          website: form.website,
          availability: form.availability,
          skills: form.skills,
          languages: form.languages,
          summary: form.summary,
          experience: cleanEntries(form.experience),
          education: cleanEntries(form.education),
          certifications: cleanEntries(form.certifications),
          projects: cleanEntries(form.projects),
          resumeLink: form.resumeLink,
          cv: form.cv,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setProfile(d.profile);
        setSavedMsg('Saved — your portfolio page updated.');
        setTimeout(() => setSavedMsg(''), 3000);
      } else {
        const d = await res.json().catch(() => ({}));
        setCvMsg(d.message || 'Could not save. Try a smaller file.');
      }
    } catch {
      setCvMsg('Could not connect to server.');
    } finally {
      setSaving(false);
    }
  };

  const onPhotoFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setCvMsg('Please choose an image file.');
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      setCvMsg('Photo is too large — please use an image under 1 MB.');
      return;
    }
    setCvMsg('');
    setPhotoReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      set('avatar', reader.result);
      setPhotoReading(false);
    };
    reader.onerror = () => {
      setCvMsg('Could not read that image. Try another.');
      setPhotoReading(false);
    };
    reader.readAsDataURL(file);
  };

  const onCvFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/(pdf|document|ms-word|text)/.test(file.type) && !/\.(pdf|doc|docx|txt)$/i.test(file.name)) {
      setCvMsg('Please choose a PDF, DOC, DOCX or TXT file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCvMsg('CV is too large — please use a file under 5 MB.');
      return;
    }
    setCvMsg('');
    setCvReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      set('cv', reader.result);
      setCvReading(false);
      setCvMsg('CV attached — save your profile to keep it.');
    };
    reader.onerror = () => {
      setCvMsg('Could not read that file. Try another.');
      setCvReading(false);
    };
    reader.readAsDataURL(file);
  };

  const copyPortfolio = async () => {
    try {
      await navigator.clipboard.writeText(portfolioUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const jobTypes = ['All', ...new Set(jobs.map((j) => j.type).filter(Boolean))];
  const jobSources = ['All', ...new Set(jobs.map((j) => j.source).filter(Boolean))];
  const hasCV = !!(form.cv || profile?.cv);
  const cvFileName = (dataUrl) => {
    if (!dataUrl) return '';
    const mime = (dataUrl.match(/^data:([^;]+);/) || [])[1] || '';
    const ext = mime.includes('pdf')
      ? '.pdf'
      : mime.includes('word')
      ? '.docx'
      : mime.includes('doc')
      ? '.doc'
      : '.txt';
    return `${profile?.name?.replace(/\s+/g, '-') || 'CV'}${ext}`;
  };

  const completed = () =>
    [form.name, form.title, form.location, form.summary, (form.skills || []).length > 0, (form.experience || []).length > 0]
      .filter(Boolean).length;

  const completeness = Math.round((completed() / 6) * 100);
  const missingHints = [
    !form.title && 'Add a headline in Settings',
    !form.summary && 'Write a short summary',
    (form.skills || []).length === 0 && 'Add at least one skill',
    (form.experience || []).length === 0 && 'Add your work experience',
  ].filter(Boolean);

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
                <Briefcase className="w-4 h-4 text-secondary" />
              )}
            </div>
            <span className="font-display font-bold text-secondary">{branding.name || 'TalentriX'}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setChatOpen(true)}
              className="relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 rounded-lg transition-colors"
              title="Secure messages"
            >
              <MessageSquare className="w-4 h-4" /> Messages
              {unread > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-secondary text-[10px] font-bold grid place-items-center">
                  {unread}
                </span>
              )}
            </button>
            <span className="text-sm text-secondary/60 hidden sm:inline">
              {profile?.name || user?.name || user?.email}
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
            Job Seeker Dashboard
          </h1>
          <p className="text-secondary/60 text-sm mt-1">
            Browse roles, craft your profile, and share a portfolio employers will love.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-secondary/5 p-1 rounded-xl w-fit flex-wrap">
          {[
            { id: 'jobs', label: 'Jobs', icon: Briefcase },
            { id: 'profile', label: 'My Profile', icon: User },
            { id: 'settings', label: 'Settings', icon: SettingsIcon },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-primary text-secondary shadow-md'
                  : 'text-secondary/60 hover:text-secondary'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {tab === 'jobs' && (
              <div>
                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search jobs, companies, skills…"
                      className={`${inputCls} pl-10`}
                    />
                  </div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="sm:w-44 px-3 py-2.5 rounded-xl bg-white border border-secondary/10 text-sm outline-none"
                  >
                    {jobTypes.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="sm:w-40 px-3 py-2.5 rounded-xl bg-white border border-secondary/10 text-sm outline-none"
                  >
                    {jobSources.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {jobsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : filteredJobs.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-dashed border-secondary/20 p-12 text-center">
                    <Search className="w-8 h-8 text-primary mx-auto mb-3" />
                    <p className="font-display font-bold text-secondary">No jobs match your search</p>
                    <p className="text-sm text-secondary/60 mt-1">Try a different keyword or filter.</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {filteredJobs.map((j) => {
                      const match = matchFor(j);
                      return (
                        <div key={j._id || j.id} className="bg-white rounded-2xl border border-secondary/10 p-6 flex flex-col cursor-pointer hover:border-primary/40 hover:shadow-md transition-all" onClick={() => setSelectedJob(j)}>
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                                <Building2 className="w-5 h-5 text-secondary" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-display font-bold text-secondary leading-tight truncate" title={j.title}>
                                  {j.title}
                                </div>
                                <div className="text-xs text-secondary/60">
                                  {j.company}
                                  {j.location ? ` · ${j.location}` : ''}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {j.source && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
                                  j.source === 'Remotive' ? 'bg-blue-100 text-blue-700'
                                  : j.source === 'Arbeitnow' ? 'bg-purple-100 text-purple-700'
                                  : j.source === 'RemoteOK' ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-secondary/10 text-secondary/60'
                                }`}>
                                  {j.source}
                                </span>
                              )}
                              {match > 0 && (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold shrink-0 ${
                                  match >= 60
                                    ? 'bg-green-100 text-green-700'
                                    : match >= 35
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-secondary/10 text-secondary/60'
                                }`}
                                title="Skill match"
                              >
                                {match}% match
                              </span>
                            )}
                            </div>
                          </div>

                          {j.salary && (
                            <div className="flex items-center gap-2 text-sm text-secondary/70 mb-2">
                              <Clock className="w-4 h-4 text-primary" />
                              {j.salary} · {j.type}
                            </div>
                          )}

                          {j.description && (
                            <p className="text-sm text-secondary/70 leading-relaxed mb-3">{j.description}</p>
                          )}

                          {(j.skills || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-4">
                              {j.skills.map((s) => (
                                <span
                                  key={s}
                                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                    mySkills.includes(s.toLowerCase())
                                      ? 'bg-primary/20 text-secondary'
                                      : 'bg-secondary/5 text-secondary/60'
                                  }`}
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-auto flex items-center justify-end pt-2">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-accent transition-colors">
                              View Details <ExternalLink className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === 'profile' && (
              <div className="grid md:grid-cols-3 gap-6">
                {/* Profile card */}
                <div className="md:col-span-2 bg-white rounded-2xl border border-secondary/10 p-8">
                  <div className="flex flex-col sm:flex-row items-start gap-5">
                    <div className="relative">
                      <img
                        src={form.avatar || avatarFor(profile?.name)}
                        alt={profile?.name}
                        className="w-24 h-24 rounded-2xl ring-2 ring-primary"
                      />
                      {(profile?.availability || '').toLowerCase().includes('open') && (
                        <span className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-green-500 ring-4 ring-white" title="Open to work" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-display text-2xl font-bold text-secondary">{profile?.name || 'Your name'}</h2>
                      <div className="text-secondary/70 text-sm">
                        {profile?.title || 'Add a headline in Settings'}
                        {profile?.pronouns ? ` (${profile.pronouns})` : ''}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary/60 mt-1.5">
                        {profile?.location && (
                          <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {profile.location}</span>
                        )}
                        {profile?.availability && (
                          <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> {profile.availability}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {[
                          { href: profile?.linkedin, label: 'LinkedIn', icon: ExternalLink },
                          { href: profile?.github && (profile.github.startsWith('http') ? profile.github : `https://${profile.github}`), label: 'GitHub', icon: Github },
                          { href: profile?.website && (profile.website.startsWith('http') ? profile.website : `https://${profile.website}`), label: 'Website', icon: Globe },
                        ]
                          .filter((l) => l.href)
                          .map((l) => (
                            <a
                              key={l.label}
                              href={l.href}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-secondary bg-secondary/5 px-2.5 py-1.5 rounded-lg hover:bg-secondary/10 transition-colors"
                            >
                              <l.icon className="w-3.5 h-3.5" /> {l.label}
                            </a>
                          ))}
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  {(profile?.skills?.length > 0 || (profile?.experience || []).length > 0 || (profile?.projects || []).length > 0 || (profile?.certifications || []).length > 0) && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-7">
                      {[
                        { n: (profile?.experience || []).length, l: 'Roles' },
                        { n: (profile?.skills || []).length, l: 'Skills' },
                        { n: (profile?.projects || []).length, l: 'Projects' },
                        { n: (profile?.certifications || []).length, l: 'Certifications' },
                      ].map((s) => (
                        <div key={s.l} className="rounded-xl bg-secondary/[0.03] border border-secondary/10 text-center py-4">
                          <div className="font-display text-2xl font-bold text-secondary">{s.n}</div>
                          <div className="text-xs text-secondary/50">{s.l}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {profile?.summary && (
                    <div className="mt-6">
                      <div className="text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5">Summary</div>
                      <p className="text-sm text-secondary/80 leading-relaxed">{profile.summary}</p>
                    </div>
                  )}

                  {profile?.bio && (
                    <div className="mt-5">
                      <div className="text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5">About</div>
                      <p className="text-sm text-secondary/80 leading-relaxed">{profile.bio}</p>
                    </div>
                  )}

                  {(profile?.experience || []).length > 0 && (
                    <div className="mt-5 space-y-3">
                      <div className="text-xs font-bold uppercase tracking-widest text-secondary/50">Experience</div>
                      {profile.experience.map((e, i) => (
                        <div key={e._id || i} className="flex gap-3">
                          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                          <div>
                            <div className="text-sm font-bold text-secondary">{e.title || 'Role'}</div>
                            {(e.company || e.start || e.end) && (
                              <div className="text-xs text-secondary/60">
                                {e.company}
                                {e.start || e.end ? ` · ${e.start || '…'}${e.current ? ' — Present' : e.end ? ` — ${e.end}` : ''}` : ''}
                              </div>
                            )}
                            {e.description && <p className="text-sm text-secondary/70 mt-1">{e.description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(profile?.education || []).length > 0 && (
                    <div className="mt-5">
                      <div className="text-xs font-bold uppercase tracking-widest text-secondary/50 mb-2">Education</div>
                      {profile.education.map((e, i) => (
                        <div key={e._id || i} className="text-sm text-secondary/80 mb-1">
                          <span className="font-bold text-secondary">{e.degree || e.school}</span> — {e.school}
                          {e.end || e.start ? ` (${e.start || '…'}—${e.current ? 'Present' : e.end || '…'})` : ''}
                        </div>
                      ))}
                    </div>
                  )}

                  {(profile?.projects || []).length > 0 && (
                    <div className="mt-5">
                      <div className="text-xs font-bold uppercase tracking-widest text-secondary/50 mb-2">Projects</div>
                      {profile.projects.map((p, i) => (
                        <div key={p._id || i} className="text-sm text-secondary/80 mb-1">
                          <span className="font-bold text-secondary">{p.name}</span>
                          {p.tech ? ` — ${p.tech}` : ''}
                          {p.link && (
                            <a href={p.link} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 text-secondary/50 hover:text-primary">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {(profile?.skills || []).length > 0 && (
                    <div className="mt-5">
                      <div className="text-xs font-bold uppercase tracking-widest text-secondary/50 mb-2">Skills</div>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.skills.map((s) => (
                          <span key={s} className="text-xs font-medium bg-primary/15 text-secondary px-2.5 py-1 rounded-full">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {(profile?.languages || []).length > 0 && (
                    <div className="mt-5">
                      <div className="text-xs font-bold uppercase tracking-widest text-secondary/50 mb-2">Languages</div>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.languages.map((l) => (
                          <span key={l} className="text-xs font-medium bg-secondary/5 text-secondary px-2.5 py-1 rounded-full">
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-8 flex items-center gap-2 text-xs text-secondary/50">
                    <FileText className="w-4 h-4 text-primary" />
                    {profile?.cv || profile?.resumeLink ? (
                      <span>CV attached — employers can open it from your portfolio.</span>
                    ) : (
                      <span>No CV attached yet. Upload one in Settings.</span>
                    )}
                  </div>
                </div>

                {/* Portfolio link card */}
                <div className="bg-secondary text-white rounded-2xl p-7 h-fit">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
                      <LinkIcon className="w-4 h-4 text-secondary" />
                    </div>
                    <h3 className="font-display font-bold">Your portfolio link</h3>
                  </div>
                  <p className="text-white/60 text-sm mt-1 mb-4">
                    Everything in your profile & settings is combined into this public page. Share it anywhere.
                  </p>

                  <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 font-mono text-xs text-primary break-all mb-3">
                    {portfolioUrl}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={copyPortfolio}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied!' : 'Copy link'}
                    </button>
                    <a
                      href={portfolioUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> View portfolio
                    </a>
                  </div>

                  {/* Completeness meter */}
                  <div className="mt-6 pt-5 border-t border-white/10">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-white/60">Portfolio completeness</span>
                      <span className="font-bold text-primary">{completeness}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${completeness}%` }} />
                    </div>
                    {missingHints.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {missingHints.map((h) => (
                          <li key={h} className="flex items-center gap-1.5 text-xs text-white/50">
                            <Lightbulb className="w-3.5 h-3.5 text-primary" /> {h}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {tab === 'settings' && (
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                  {/* Photo + basics */}
                  <div className="bg-white rounded-2xl border border-secondary/10 p-8">
                    <SectionTitle
                      icon={User}
                      title="Photo & basics"
                      subtitle="The header of your portfolio — make a great first impression."
                    />

                    <div className="flex flex-col sm:flex-row gap-6 items-start">
                      {/* Photo */}
                      <div className="flex flex-col items-center gap-3 shrink-0">
                        <div className="relative">
                          <img
                            src={form.avatar || avatarFor(form.name || 'Seeker')}
                            alt="Profile"
                            className="w-28 h-28 rounded-2xl object-cover ring-2 ring-primary"
                          />
                          {form.avatar && (
                            <button
                              type="button"
                              onClick={() => set('avatar', '')}
                              className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                              aria-label="Remove photo"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
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
                        <p className="text-[11px] text-secondary/40 max-w-[9rem] text-center">
                          JPG or PNG under 1 MB
                        </p>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4 flex-1">
                        <Field label="Full name">
                          <input className={inputCls} value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
                        </Field>
                        <Field label="Headline / desired role">
                          <input
                            className={inputCls}
                            placeholder="e.g. Senior Frontend Engineer"
                            value={form.title || ''}
                            onChange={(e) => set('title', e.target.value)}
                          />
                        </Field>
                        <Field label="Pronouns">
                          <input
                            className={inputCls}
                            placeholder="e.g. she/her, he/him, they/them"
                            value={form.pronouns || ''}
                            onChange={(e) => set('pronouns', e.target.value)}
                          />
                        </Field>
                        <Field label="Availability">
                          <select
                            className={selectCls}
                            value={form.availability || ''}
                            onChange={(e) => set('availability', e.target.value)}
                          >
                            <option value="">Select…</option>
                            <option>Open to work</option>
                            <option>Open to relocation</option>
                            <option>Open to freelance / contract</option>
                            <option>Actively interviewing</option>
                            <option>Employed — not looking</option>
                          </select>
                        </Field>
                        <Field label="Location" icon={MapPin}>
                          <input
                            className={`${inputCls} pl-9`}
                            placeholder="e.g. Lagos, Nigeria / Remote"
                            value={form.location || ''}
                            onChange={(e) => set('location', e.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="bg-white rounded-2xl border border-secondary/10 p-8">
                    <SectionTitle
                      icon={Mail}
                      title="Contact & links"
                      subtitle="Shown on your public portfolio so employers can reach you."
                    />
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="Email">
                        <input className={`${inputCls} bg-secondary/5 text-secondary/60`} value={user?.email || ''} disabled />
                      </Field>
                      <Field label="Phone">
                        <input
                          className={inputCls}
                          placeholder="+234 …"
                          value={form.phone || ''}
                          onChange={(e) => set('phone', e.target.value)}
                        />
                      </Field>
                      <Field label="LinkedIn URL" icon={ExternalLink}>
                        <input
                          className={`${inputCls} pl-9`}
                          placeholder="linkedin.com/in/your-handle"
                          value={form.linkedin || ''}
                          onChange={(e) => set('linkedin', e.target.value)}
                        />
                      </Field>
                      <Field label="GitHub URL" icon={Github}>
                        <input
                          className={`${inputCls} pl-9`}
                          placeholder="github.com/your-handle"
                          value={form.github || ''}
                          onChange={(e) => set('github', e.target.value)}
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Website / portfolio URL" icon={Globe}>
                          <input
                            className={`${inputCls} pl-9`}
                            placeholder="https://yourdomain.com"
                            value={form.website || ''}
                            onChange={(e) => set('website', e.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  {/* About */}
                  <div className="bg-white rounded-2xl border border-secondary/10 p-8">
                    <SectionTitle
                      icon={FileText}
                      title="About you"
                      subtitle="Words are what make you human — recruiters read these first."
                    />
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <Field label="Summary" hint="One or two punchy sentences for the top of your portfolio.">
                          <textarea
                            rows={2}
                            className={textCls}
                            placeholder="e.g. Frontend engineer with 6+ years shipping products for 2M+ users."
                            value={form.summary || ''}
                            onChange={(e) => set('summary', e.target.value)}
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field label="About / bio" hint="Your full story — your journey, what drives you, the problems you love solving.">
                          <textarea
                            rows={5}
                            className={textCls}
                            placeholder="Tell your story…"
                            value={form.bio || ''}
                            onChange={(e) => set('bio', e.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  {/* Skills + languages */}
                  <div className="bg-white rounded-2xl border border-secondary/10 p-8">
                    <SectionTitle
                      icon={Languages}
                      title="Skills & languages"
                      subtitle="Skills power your job-match score; languages round out your story."
                    />
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div>
                        <Field label="Core skills" hint="Press Enter to add. These also boost your % match on jobs.">
                          <ChipsInput
                            values={form.skills || []}
                            onChange={setList('skills')}
                            placeholder="e.g. React, Python, Figma…"
                            emptyText="You haven't added any skills yet."
                          />
                        </Field>
                      </div>
                      <div>
                        <Field label="Languages">
                          <ChipsInput
                            values={form.languages || []}
                            onChange={setList('languages')}
                            placeholder="e.g. English, French, Yoruba…"
                            emptyText="No languages added."
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  {/* Experience */}
                  <div className="bg-white rounded-2xl border border-secondary/10 p-8">
                    <SectionTitle icon={Briefcase} title={ENTRY_CONFIGS.experience.plural} subtitle={ENTRY_CONFIGS.experience.subtitle} />
                    <EntryEditor
                      config={ENTRY_CONFIGS.experience}
                      entries={form.experience || []}
                      onChange={setList('experience')}
                    />
                  </div>

                  {/* Projects */}
                  <div className="bg-white rounded-2xl border border-secondary/10 p-8">
                    <SectionTitle icon={FolderGit2} title={ENTRY_CONFIGS.projects.plural} subtitle={ENTRY_CONFIGS.projects.subtitle} />
                    <EntryEditor
                      config={ENTRY_CONFIGS.projects}
                      entries={form.projects || []}
                      onChange={setList('projects')}
                    />
                  </div>

                  {/* Education */}
                  <div className="bg-white rounded-2xl border border-secondary/10 p-8">
                    <SectionTitle icon={GraduationCap} title={ENTRY_CONFIGS.education.plural} subtitle={ENTRY_CONFIGS.education.subtitle} />
                    <EntryEditor
                      config={ENTRY_CONFIGS.education}
                      entries={form.education || []}
                      onChange={setList('education')}
                    />
                  </div>

                  {/* Certifications */}
                  <div className="bg-white rounded-2xl border border-secondary/10 p-8">
                    <SectionTitle icon={Award} title={ENTRY_CONFIGS.certifications.plural} subtitle={ENTRY_CONFIGS.certifications.subtitle} />
                    <EntryEditor
                      config={ENTRY_CONFIGS.certifications}
                      entries={form.certifications || []}
                      onChange={setList('certifications')}
                    />
                  </div>

                  {/* CV */}
                  <div className="bg-white rounded-2xl border border-secondary/10 p-8">
                    <SectionTitle
                      icon={Upload}
                      title="Curriculum vitae (CV)"
                      subtitle="A formal one-through-20-pages document employers can download."
                    />
                    <div className="flex flex-col sm:flex-row items-start gap-4">
                      <input
                        type="file"
                        id="cv-upload"
                        accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,text/plain"
                        className="hidden"
                        onChange={onCvFile}
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById('cv-upload')?.click()}
                        disabled={cvReading}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-60"
                      >
                        {cvReading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {hasCV ? 'Replace CV' : 'Upload CV'}
                      </button>

                      <div className="flex-1 flex items-center gap-3 text-sm text-secondary/80 min-w-0">
                        <FileText className="w-5 h-5 text-primary shrink-0" />
                        {hasCV ? (
                          <>
                            <span className="truncate">{cvFileName(form.cv || profile?.cv)}</span>
                            <a
                              href={form.cv || profile?.cv}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0"
                            >
                              <Eye className="w-3.5 h-3.5" /> Preview
                            </a>
                            <button
                              type="button"
                              onClick={() => set('cv', '')}
                              className="inline-flex items-center gap-1 text-xs text-red-600 font-medium shrink-0"
                            >
                              <X className="w-3.5 h-3.5" /> Remove
                            </button>
                          </>
                        ) : (
                          <span className="text-secondary/50">No CV attached yet.</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4">
                      <Field label="Or link an external resume URL" hint="Useful for hosted resumes, e.g. Google Drive.">
                        <input
                          className={inputCls}
                          placeholder="https://…/resume.pdf"
                          value={form.resumeLink || ''}
                          onChange={(e) => set('resumeLink', e.target.value)}
                        />
                      </Field>
                    </div>

                    {cvMsg && (
                      <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {cvMsg}
                      </div>
                    )}
                  </div>

                  {/* Save */}
                  <div className="bg-white rounded-2xl border border-secondary/10 p-6 flex items-center gap-4 sticky bottom-4 shadow-lg shadow-black/5">
                    <button
                      onClick={saveProfile}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-6 py-3 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Save profile
                    </button>
                    {savedMsg && <span className="text-xs text-emerald-700">{savedMsg}</span>}
                    {!savedMsg && !saving && (
                      <span className="text-xs text-secondary/50">Your public portfolio page updates instantly.</span>
                    )}
                  </div>
                </div>

                {/* Side card */}
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl border border-secondary/10 p-7 h-fit">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
                        <LinkIcon className="w-4 h-4 text-secondary" />
                      </div>
                      <h3 className="font-display font-bold text-secondary">Your portfolio link</h3>
                    </div>
                    <p className="text-sm text-secondary/60 mb-4">
                      This public page auto-updates whenever you save your profile.
                    </p>
                    <div className="bg-secondary/5 border border-secondary/10 rounded-xl px-3 py-2.5 font-mono text-xs text-secondary break-all mb-3">
                      {portfolioUrl}
                    </div>
                    <button
                      onClick={copyPortfolio}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-accent transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied!' : 'Copy link'}
                    </button>
                    <a
                      href={portfolioUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-secondary/15 text-secondary text-sm font-semibold hover:bg-secondary/5 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> Preview portfolio
                    </a>
                  </div>

                  {/* Tips */}
                  <div className="bg-secondary text-white rounded-2xl p-7">
                    <h3 className="font-display font-bold text-primary flex items-center gap-2">
                      <Lightbulb className="w-5 h-5" /> Great portfolios…
                    </h3>
                    <ul className="mt-3 space-y-2 text-sm text-white/70">
                      <li className="flex gap-2"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Use a friendly, genuine photo.</li>
                      <li className="flex gap-2"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Write your summary like a first impression.</li>
                      <li className="flex gap-2"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Lead experience with measurable wins.</li>
                      <li className="flex gap-2"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Link projects — proof beats claims.</li>
                      <li className="flex gap-2"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Attach your CV for the formal details.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Secure end-to-end encrypted chat */}
      <SecureChat
        open={chatOpen}
        onClose={() => {
          setChatOpen(false);
          setUnread(0);
        }}
      />

      {/* Job detail modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedJob(null)}>
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-secondary/10 px-6 py-4 flex items-start justify-between gap-4 rounded-t-3xl">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-secondary" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-bold text-secondary leading-tight">{selectedJob.title}</h2>
                  <p className="text-sm text-secondary/60">{selectedJob.company}{selectedJob.location ? ` · ${selectedJob.location}` : ''}</p>
                </div>
              </div>
              <button onClick={() => setSelectedJob(null)} className="p-2 rounded-lg hover:bg-secondary/5 transition-colors shrink-0">
                <X className="w-5 h-5 text-secondary/60" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Meta row */}
              <div className="flex flex-wrap gap-2">
                {selectedJob.source && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                    selectedJob.source === 'Remotive' ? 'bg-blue-100 text-blue-700'
                    : selectedJob.source === 'Arbeitnow' ? 'bg-purple-100 text-purple-700'
                    : selectedJob.source === 'RemoteOK' ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-secondary/10 text-secondary/60'
                  }`}>
                    {selectedJob.source}
                  </span>
                )}
                {selectedJob.type && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary/5 text-secondary/70">
                    {selectedJob.type}
                  </span>
                )}
                {selectedJob.salary && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
                    <Clock className="w-3 h-3" /> {selectedJob.salary}
                  </span>
                )}
                {(() => {
                  const m = matchFor(selectedJob);
                  return m > 0 ? (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                      m >= 60 ? 'bg-green-100 text-green-700'
                      : m >= 35 ? 'bg-amber-100 text-amber-700'
                      : 'bg-secondary/10 text-secondary/60'
                    }`}>
                      {m}% match
                    </span>
                  ) : null;
                })()}
              </div>

              {/* Skills */}
              {(selectedJob.skills || []).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-secondary/40 mb-2">Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedJob.skills.map((s) => (
                      <span
                        key={s}
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          mySkills.includes(s.toLowerCase())
                            ? 'bg-primary/20 text-secondary'
                            : 'bg-secondary/5 text-secondary/60'
                        }`}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedJob.description && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-secondary/40 mb-2">Description</h4>
                  <div className="text-sm text-secondary/70 leading-relaxed whitespace-pre-line">
                    {selectedJob.description}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-secondary/10 px-6 py-4 flex items-center justify-between gap-3 rounded-b-3xl">
              <p className="text-xs text-secondary/40">
                via {selectedJob.source || 'Platform'}
              </p>
              <div className="flex items-center gap-3">
                {selectedJob.url && (
                  <a
                    href={selectedJob.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 transition-colors"
                  >
                    Open Original <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  onClick={() => {
                    if (selectedJob.url) {
                      window.open(selectedJob.url, '_blank', 'noopener');
                    }
                    setApplied((prev) => new Set(prev).add(selectedJob._id || selectedJob.id));
                    setSelectedJob(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-secondary hover:bg-accent transition-colors"
                >
                  {applied.has(selectedJob._id || selectedJob.id) ? (
                    <><CheckCircle2 className="w-4 h-4" /> Applied</>
                  ) : (
                    <><ExternalLink className="w-4 h-4" /> Apply Now</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}