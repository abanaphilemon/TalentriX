import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  Save,
  RotateCcw,
  Undo2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Plus,
  Trash2,
  Star,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Search,
  AlertTriangle,
  X,
  Upload,
  Image as ImageIcon,
  CreditCard,
  Key,
  Users,
  UserCheck,
  UserX,
  Power,
  CalendarDays,
  Video,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useContent } from '../context/ContentContext.jsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const ADMIN_TOKEN_KEY = 'tbai.adminToken';

// Navigation: grouped + searchable.
const SECTION_GROUPS = [
  {
    id: 'branding',
    label: 'Branding',
    items: [
      { id: 'branding', label: 'Site Name & Logo', desc: 'Name, tagline and logo shown in the header and footer.' },
    ],
  },
  {
    id: 'moderation',
    label: 'Moderation',
    items: [
      { id: 'reviews', label: 'Review Moderation', desc: 'Approve or remove visitor reviews.', special: 'reviews' },
    ],
  },
  {
    id: 'landing',
    label: 'Landing Page',
    items: [
      { id: 'hero', label: 'Hero', desc: 'Badge, headline, buttons and hero image.' },
      { id: 'heroStats', label: 'Hero Stats', desc: 'Stat counters below the headline.' },
      { id: 'navLinks', label: 'Navigation', desc: 'Links in the header menu.' },
      { id: 'about', label: 'About', desc: 'Intro text and image.' },
      { id: 'features', label: 'About Features', desc: 'Feature cards in the about section.' },
      { id: 'cta', label: 'CTA Banner', desc: 'Mid-page call-to-action banner.' },
    ],
  },
  {
    id: 'social',
    label: 'Social Proof',
    items: [
      { id: 'reviewsHeading', label: 'Reviews Heading', desc: 'Heading for the visitor review section.' },
      { id: 'partnersHeading', label: 'Partners Heading', desc: 'Heading above partner logos.' },
      { id: 'collaborators', label: 'Partners', desc: 'Partner logos shown on the site.' },
    ],
  },
  {
    id: 'footer',
    label: 'Site Footer',
    items: [
      { id: 'footer', label: 'Footer', desc: 'Tagline, links and newsletter blurb.' },
      { id: 'contactInfo', label: 'Contact Info', desc: 'Email, phone and address.' },
      { id: 'contactHeading', label: 'Contact Heading', desc: 'Heading for the contact section.' },
    ],
  },
  {
    id: 'users',
    label: 'Users & Access',
    items: [
      { id: 'users', label: 'Users', desc: 'Approve, reject, deactivate or remove accounts.', special: 'users' },
      { id: 'interviews', label: 'Onboarding Interviews', desc: 'Approve interview times, join calls, mark complete.', special: 'interviews' },
    ],
  },
  {
    id: 'payments',
    label: 'Payments',
    items: [
      { id: 'payments', label: 'Monnify Config', desc: 'API keys, contract code, and chat pricing.', special: 'payments' },
    ],
  },
];
const ALL_SECTIONS = SECTION_GROUPS.flatMap((g) => g.items);
const ARRAY_SECTIONS = new Set(['heroStats', 'navLinks', 'features', 'collaborators']);

// Contextual field labels per section (overrides the generic LABELS map).
const SECTION_LABELS = {
  branding: { name: 'Site name', tagline: 'Tagline (small text under the name)', logo: 'Site logo' },
  collaborators: { logo: 'Partner logo' },
};

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';
const textCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm resize-none';

const LONG_FIELDS = new Set(['body', 'subtitle', 'brandTagline', 'newsletterBlurb', 'officeHours', 'desc']);

// Field labels used across every section
const LABELS = {
  badge: 'Badge text',
  title: 'Title (before highlight)',
  titlePrefix: 'Title (before highlight)',
  titleHighlight: 'Highlighted word(s)',
  titleSuffix: 'Title (after highlight)',
  subtitle: 'Subtitle',
  body: 'Body text',
  eyebrow: 'Eyebrow / label',
  ctaPrimary: 'Primary button',
  ctaSecondary: 'Secondary button',
  image: 'Image URL',
  buttonText: 'Button text',
  brandTagline: 'Brand tagline',
  newsletterBlurb: 'Newsletter blurb',
  quickLinksTitle: 'Quick links title',
  resourcesTitle: 'Resources title',
  officeHours: 'Office hours',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  name: 'Name',
  logo: 'Logo URL',
  tagline: 'Tagline',
  quote: 'Quote',
  role: 'Role / title',
  avatar: 'Avatar URL',
  label: 'Label',
  href: 'Href',
  value: 'Value',
  quickLinks: 'Quick links',
  resources: 'Resources',
};

// Which fields make up each list-type section
const ARRAY_FIELDS = {
  heroStats: ['value', 'label'],
  navLinks: ['label', 'href'],
  features: ['title', 'desc'],
  collaborators: ['name', 'logo'],
};

const clone = (x) => JSON.parse(JSON.stringify(x));

function PaymentsConfig({ token }) {
  const [monnify, setMonnify] = useState({ apiKey: '', secretKey: '', contractCode: '', environment: 'sandbox' });
  const [pricing, setPricing] = useState({ amount: 5000, vatRate: 0.075, serviceCharge: 100, currency: 'NGN' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [mRes, pRes] = await Promise.all([
          fetch(`${API_URL}/admin/config/monnify`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/admin/config/chatPricing`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (mRes.ok) { const d = await mRes.json(); if (d.value?.apiKey) setMonnify(d.value); }
        if (pRes.ok) { const d = await pRes.json(); if (d.value?.amount) setPricing(d.value); }
      } catch { /* ignore */ } finally { setLoading(false); }
    };
    load();
  }, [token]);

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      await fetch(`${API_URL}/admin/config/monnify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: monnify }),
      });
      await fetch(`${API_URL}/admin/config/chatPricing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: pricing }),
      });
      setMsg('Payment config saved.');
      setTimeout(() => setMsg(''), 3000);
    } catch { setMsg('Could not save.'); } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center gap-2 py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /> Loading config…</div>;

  const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';

  return (
    <div className="space-y-8">
      {/* Monnify API credentials */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-secondary">Monnify API Credentials</h3>
        </div>
        <p className="text-xs text-secondary/50 mb-4">
          Get these from your Monnify dashboard at <span className="font-mono">dashboard.monnify.com</span>.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5">Environment</label>
            <select value={monnify.environment} onChange={(e) => setMonnify((m) => ({ ...m, environment: e.target.value }))} className={inputCls}>
              <option value="sandbox">Sandbox (Testing)</option>
              <option value="production">Production (Live)</option>
            </select>
          </div>
          <div />
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5">API Key</label>
            <input value={monnify.apiKey} onChange={(e) => setMonnify((m) => ({ ...m, apiKey: e.target.value }))} className={inputCls} placeholder="MK_TEST_..." />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5">Secret Key</label>
            <input type="password" value={monnify.secretKey} onChange={(e) => setMonnify((m) => ({ ...m, secretKey: e.target.value }))} className={inputCls} placeholder="••••••••" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5">Contract Code</label>
            <input value={monnify.contractCode} onChange={(e) => setMonnify((m) => ({ ...m, contractCode: e.target.value }))} className={inputCls} placeholder="MK_PROJ_..." />
          </div>
        </div>
      </div>

      {/* Chat pricing */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-secondary">Chat Access Pricing</h3>
        </div>
        <p className="text-xs text-secondary/50 mb-4">
          Employers pay this amount (plus VAT and service charge) to unlock chat with each job seeker.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5">Base amount (NGN)</label>
            <input type="number" value={pricing.amount} onChange={(e) => setPricing((p) => ({ ...p, amount: Number(e.target.value) }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5">VAT rate</label>
            <input type="number" step="0.001" value={pricing.vatRate} onChange={(e) => setPricing((p) => ({ ...p, vatRate: Number(e.target.value) }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5">Service charge (NGN)</label>
            <input type="number" value={pricing.serviceCharge} onChange={(e) => setPricing((p) => ({ ...p, serviceCharge: Number(e.target.value) }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-secondary/50 mb-1.5">Currency</label>
            <input value={pricing.currency} onChange={(e) => setPricing((p) => ({ ...p, currency: e.target.value }))} className={inputCls} />
          </div>
        </div>
        <div className="mt-3 p-3 rounded-xl bg-secondary/5 text-sm text-secondary/70">
          Total per chat: <span className="font-bold text-secondary">₦{(pricing.amount + pricing.amount * pricing.vatRate + pricing.serviceCharge).toLocaleString()}</span>
          {' '}(₦{pricing.amount.toLocaleString()} + {(pricing.vatRate * 100).toFixed(1)}% VAT + ₦{pricing.serviceCharge.toLocaleString()} service charge)
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-secondary text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save payment config
        </button>
        {msg && <span className="text-xs text-emerald-700 font-semibold">{msg}</span>}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { adminUser: user, adminRole: role, adminSignOut } = useAuth();
  const { content, refresh } = useContent();

  const [section, setSection] = useState('hero');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(() => {
    const initial = content && content['hero'];
    return initial !== undefined ? clone(initial) : {};
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'ok'|'err', msg }
  const [confirm, setConfirm] = useState(null); // { kind, ... }
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewFilter, setReviewFilter] = useState('pending');

  // Users & access
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');
  const [usersPendingCount, setUsersPendingCount] = useState(0);

  // Interviews & calls
  const [interviews, setInterviews] = useState([]);
  const [interviewsLoading, setInterviewsLoading] = useState(false);
  const [interviewStatusFilter, setInterviewStatusFilter] = useState('all');
  const [interviewsPendingCount, setInterviewsPendingCount] = useState(0);

  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const current = content[section];

  // ── Form sync: load section data whenever section or content changes ──
  useEffect(() => {
    setForm(current !== undefined ? clone(current) : {});
    setToast(null);
  }, [section, content]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dirty tracking ──
  const originalKey = useMemo(() => JSON.stringify(content[section] ?? null), [content, section]);
  const dirty = useMemo(() => JSON.stringify(form) !== originalKey, [form, originalKey]);

  // ── Reviews loading ──
  useEffect(() => {
    if (section !== 'reviews') return;
    let active = true;
    (async () => {
      setReviewsLoading(true);
      try {
        const res = await fetch(`${API_URL}/admin/reviews`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to load reviews');
        if (active) setReviews(data.reviews || []);
      } catch (e) {
        if (active) setToast({ type: 'err', msg: e.message || 'Could not load reviews.' });
      } finally {
        if (active) setReviewsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [section, token]);

  // ── Users loading ──
  useEffect(() => {
    if (section !== 'users') return;
    let active = true;
    (async () => {
      setUsersLoading(true);
      try {
        const params = new URLSearchParams();
        if (userRoleFilter !== 'all') params.set('role', userRoleFilter);
        if (userStatusFilter !== 'all') params.set('status', userStatusFilter);
        if (userSearch.trim()) params.set('q', userSearch.trim());
        const res = await fetch(`${API_URL}/admin/users?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to load users');
        if (active) {
          setUsers(data.users || []);
          setUsersPendingCount(data.pendingCount || 0);
        }
      } catch (e) {
        if (active) setToast({ type: 'err', msg: e.message || 'Could not load users.' });
      } finally {
        if (active) setUsersLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [section, token, userRoleFilter, userStatusFilter, userSearch]);

  // Keep the pending badge count fresh even when the Users section is closed.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/admin/users?status=pending`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active) setUsersPendingCount(data.pendingCount || 0);
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  // ── Interviews loading ──
  useEffect(() => {
    if (section !== 'interviews') return;
    let active = true;
    (async () => {
      setInterviewsLoading(true);
      try {
        const params = new URLSearchParams();
        if (interviewStatusFilter !== 'all') params.set('status', interviewStatusFilter);
        const res = await fetch(`${API_URL}/admin/interviews?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to load interviews');
        if (active) {
          setInterviews(data.interviews || []);
          setInterviewsPendingCount(data.pendingCount || 0);
        }
      } catch (e) {
        if (active) setToast({ type: 'err', msg: e.message || 'Could not load interviews.' });
      } finally {
        if (active) setInterviewsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [section, token, interviewStatusFilter]);

  // Keep the pending-interview badge count fresh even when the section is closed.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/admin/interviews?status=proposed`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active) setInterviewsPendingCount(data.pendingCount || 0);
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const isArraySection = ARRAY_SECTIONS.has(section);

  // ── Field setters ──
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const updateListItem = (index, field, val) =>
    setForm((f) => {
      const arr = [...(f || [])];
      arr[index] = { ...arr[index], [field]: val };
      return arr;
    });
  const addListItem = () => setForm((f) => [...(f || []), {}]);
  const removeListItem = (index) => setForm((f) => (f || []).filter((_, i) => i !== index));

  // ── Save ──
  const save = async () => {
    setSaving(true);
    setToast(null);
    try {
      const res = await fetch(`${API_URL}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [section]: form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save');
      await refresh();
      setToast({ type: 'ok', msg: 'Saved. The landing page now shows these changes.' });
    } catch (e) {
      setToast({ type: 'err', msg: e.message || 'Could not connect to server.' });
    } finally {
      setSaving(false);
    }
  };

  // ── Per-section reset (only this section) ──
  const resetSection = async () => {
    setSaving(true);
    setToast(null);
    try {
      const res = await fetch(`${API_URL}/content/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ section }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to reset');
      await refresh();
      setToast({ type: 'ok', msg: `${section} reset to its defaults.` });
    } catch (e) {
      setToast({ type: 'err', msg: e.message || 'Could not connect to server.' });
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  };

  // ── Reset everything ──
  const resetAll = async () => {
    setSaving(true);
    setToast(null);
    try {
      const res = await fetch(`${API_URL}/content/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to reset');
      await refresh();
      setToast({ type: 'ok', msg: 'All content reset to defaults.' });
    } catch (e) {
      setToast({ type: 'err', msg: e.message || 'Could not connect to server.' });
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  };

  // ── Reviews actions ──
  const setReviewApproved = async (id, approved) => {
    try {
      const res = await fetch(`${API_URL}/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ approved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update review');
      setReviews((rs) => rs.map((r) => (r._id === id ? data.review : r)));
    } catch (e) {
      setToast({ type: 'err', msg: e.message || 'Could not update review.' });
    }
  };

  const deleteReview = async (id) => {
    try {
      const res = await fetch(`${API_URL}/admin/reviews/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete review');
      setReviews((rs) => rs.filter((r) => r._id !== id));
      setToast({ type: 'ok', msg: 'Review deleted.' });
    } catch (e) {
      setToast({ type: 'err', msg: e.message || 'Could not delete review.' });
    } finally {
      setConfirm(null);
    }
  };

  // ── Users actions ──
  const updateUserStatus = async (id, patch) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update user');
      setUsers((us) => us.map((u) => (u.id === id ? data.user : u)));
      setToast({ type: 'ok', msg: 'User updated.' });
    } catch (e) {
      setToast({ type: 'err', msg: e.message || 'Could not update user.' });
    }
  };

  const deleteUser = async (id) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete user');
      setUsers((us) => us.filter((u) => u.id !== id));
      setToast({ type: 'ok', msg: 'User deleted.' });
    } catch (e) {
      setToast({ type: 'err', msg: e.message || 'Could not delete user.' });
    } finally {
      setConfirm(null);
    }
  };

  // ── Interviews actions ──
  const updateInterviewStatus = async (id, status, adminNotes) => {
    try {
      const body = { status };
      if (adminNotes !== undefined) body.adminNotes = adminNotes;
      const res = await fetch(`${API_URL}/admin/interviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update interview');
      setInterviews((is) => is.map((i) => (i.id === id ? { ...i, ...data.interview, user: i.user } : i)));
      setToast({ type: 'ok', msg: status === 'completed' ? 'Interview completed — user dashboard unlocked.' : `Interview ${status}.` });
    } catch (e) {
      setToast({ type: 'err', msg: e.message || 'Could not update interview.' });
    }
  };

  const completeInterview = async (id) => updateInterviewStatus(id, 'completed', 'Marked as complete.');

  // ── Navigation with unsaved-changes guard ──
  // Switch the section AND load its data in the same tick, so the editor never
  // renders stale data (or a form of the wrong type) while waiting on an effect.
  const switchTo = (id) => {
    setSection(id);
    setForm(id === 'reviews' ? {} : clone(content[id] ?? {}));
  };
  const goTo = (id) => {
    if (id === section) return;
    if (dirty) {
      setConfirm({ kind: 'switch', to: id });
      return;
    }
    switchTo(id);
  };

  // Filter sidebar items by search
  const q = search.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!q) return SECTION_GROUPS;
    return SECTION_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((s) =>
        (s.label + ' ' + (s.desc || '') + ' ' + s.id).toLowerCase().includes(q)
      ),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  const keyword = /(ctrl|meta)\+s/i;

  // Ctrl/Cmd+S to save
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && section !== 'reviews' && section !== 'users' && section !== 'interviews' && section !== 'payments' && !saving) save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (role !== 'admin' || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-hero-gradient">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <h1 className="font-display text-xl font-bold text-secondary">Admin access only</h1>
          <p className="text-sm text-secondary/60 mt-2">Please sign in with an admin account.</p>
          <button onClick={() => navigate('/', { replace: true })} className="mt-6 btn-primary w-full justify-center">
            Go to home
          </button>
        </div>
      </div>
    );
  }

  const activeMeta = ALL_SECTIONS.find((s) => s.id === section);
  const pendingCount = reviews.filter((r) => !r.approved).length;
  const filteredReviews =
    reviewFilter === 'pending' ? reviews.filter((r) => !r.approved) : reviewFilter === 'approved' ? reviews.filter((r) => r.approved) : reviews;

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      {/* Top bar */}
      <header className="bg-white border-b border-secondary/10 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <LayoutDashboard className="w-4 h-4 text-secondary" />
            </div>
            <span className="font-display font-bold text-secondary">Admin CMS</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/', { replace: true })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 rounded-lg transition-colors"
            >
              <Eye className="w-4 h-4" /> View site
            </button>
            <button
              onClick={adminSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-secondary mb-1">Website Content</h1>
        <p className="text-secondary/60 text-sm mb-6">
          Pick a section on the left to edit it. Changes are saved per section —{" "}
          {dirty ? <span className="text-amber-700 font-semibold">you have unsaved changes.</span> : 'everything is saved.'}
        </p>

        <div className="grid lg:grid-cols-[260px_1fr] gap-8">
          {/* ── Section nav ── */}
          <aside className="md:sticky md:top-24 self-start">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sections…"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm"
              />
            </div>

            <nav className="space-y-5">
              {filteredGroups.map((g) => (
                <div key={g.id}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-secondary/40 mb-1.5 px-1">
                    {g.label}
                  </div>
                  <div className="space-y-0.5">
                    {g.items.map((s) => {
                      const active = section === s.id;
                      const isReviews = s.id === 'reviews';
                      const isUsers = s.id === 'users';
                      const isInterviews = s.id === 'interviews';
                      return (
                        <button
                          key={s.id}
                          onClick={() => goTo(s.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                            active ? 'bg-primary text-secondary shadow' : 'text-secondary/70 hover:text-secondary hover:bg-secondary/5'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">{s.label}</span>
                            {isReviews && pendingCount > 0 && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/25' : 'bg-amber-100 text-amber-800'}`}>
                                {pendingCount} pending
                              </span>
                            )}
                            {isUsers && usersPendingCount > 0 && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/25' : 'bg-amber-100 text-amber-800'}`}>
                                {usersPendingCount} to review
                              </span>
                            )}
                            {isInterviews && interviewsPendingCount > 0 && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/25' : 'bg-blue-100 text-blue-800'}`}>
                                {interviewsPendingCount} to schedule
                              </span>
                            )}
                          </div>
                          {active && s.desc && <div className="text-[11px] opacity-70 mt-0.5 leading-snug">{s.desc}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {filteredGroups.length === 0 && (
                <p className="text-xs text-secondary/50 px-1">No sections match “{search}”.</p>
              )}
            </nav>
          </aside>

          {/* ── Editor ── */}
          <div className="bg-white rounded-2xl border border-secondary/10 p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
              <div>
                <h2 className="font-display text-xl font-bold text-secondary">{activeMeta?.label}</h2>
                {activeMeta?.desc && <p className="text-sm text-secondary/60 mt-0.5">{activeMeta.desc}</p>}
              </div>
              {section !== 'reviews' && section !== 'payments' && section !== 'users' && section !== 'interviews' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setForm(current !== undefined ? clone(current) : {})}
                    disabled={!dirty}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/5 text-secondary text-sm font-semibold hover:bg-secondary/10 transition-colors disabled:opacity-40"
                  >
                    <Undo2 className="w-4 h-4" /> Discard
                  </button>
                  <button
                    onClick={() => setConfirm({ kind: 'resetSection', section })}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/5 text-secondary text-sm font-semibold hover:bg-secondary/10 transition-colors disabled:opacity-60"
                  >
                    <RotateCcw className="w-4 h-4" /> Reset this section
                  </button>
                  <button
                    onClick={save}
                    disabled={!dirty || saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-secondary text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </button>
                </div>
              )}
            </div>

            {dirty && section !== 'reviews' && section !== 'payments' && section !== 'users' && section !== 'interviews' && (
              <div className="mb-5 flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Unsaved changes to this section.
                <span className="ml-auto hidden md:inline text-amber-600/80">Tip: press Ctrl/Cmd+S to save</span>
              </div>
            )}

            {toast && (
              <div
                className={`mb-5 flex items-center gap-2 p-3 rounded-xl border text-sm ${
                  toast.type === 'ok'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                {toast.msg}
                <button onClick={() => setToast(null)} className="ml-auto text-inherit opacity-60 hover:opacity-100">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {section === 'payments' ? (
              <EditorBoundary>
                <PaymentsConfig token={token} />
              </EditorBoundary>
            ) : section === 'users' ? (
              <EditorBoundary>
                <UsersManager
                  users={users}
                  loading={usersLoading}
                  roleFilter={userRoleFilter}
                  setRoleFilter={setUserRoleFilter}
                  statusFilter={userStatusFilter}
                  setStatusFilter={setUserStatusFilter}
                  search={userSearch}
                  setSearch={setUserSearch}
                  pendingCount={usersPendingCount}
                  onUpdate={updateUserStatus}
                  onDelete={(id) => setConfirm({ kind: 'deleteUser', id })}
                />
              </EditorBoundary>
            ) : section === 'interviews' ? (
              <EditorBoundary>
                <InterviewsManager
                  interviews={interviews}
                  loading={interviewsLoading}
                  statusFilter={interviewStatusFilter}
                  setStatusFilter={setInterviewStatusFilter}
                  onUpdate={updateInterviewStatus}
                  onComplete={completeInterview}
                />
              </EditorBoundary>
            ) : section === 'reviews' ? (
              <EditorBoundary>
                <ReviewsManager
                  reviews={filteredReviews}
                  loading={reviewsLoading}
                  empty={reviews.length === 0}
                  filter={reviewFilter}
                  setFilter={setReviewFilter}
                  pendingCount={pendingCount}
                  counts={{ pending: pendingCount, approved: reviews.length - pendingCount }}
                  onApprove={(id, approved) => setReviewApproved(id, approved)}
                  onDelete={(id) => setConfirm({ kind: 'deleteReview', id })}
                />
              </EditorBoundary>
            ) : isArraySection ? (
              <EditorBoundary>
                <ArrayEditor
                  fields={ARRAY_FIELDS[section]}
                  items={form}
                  setItem={updateListItem}
                  onAdd={addListItem}
                  onRemove={removeListItem}
                />
              </EditorBoundary>
            ) : (
              <EditorBoundary>
                <ObjectEditor obj={form} set={set} section={section} />
              </EditorBoundary>
            )}

            {/* Danger zone: reset everything */}
            {section !== 'reviews' && section !== 'payments' && section !== 'users' && section !== 'interviews' && (
              <div className="mt-10 pt-6 border-t border-secondary/10 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-secondary">Reset all content</div>
                  <div className="text-xs text-secondary/60">
                    Reverts every section of the landing page back to the defaults.
                  </div>
                </div>
                <button
                  onClick={() => setConfirm({ kind: 'resetAll' })}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100 transition-colors"
                >
                  <AlertTriangle className="w-4 h-4" /> Reset everything
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Confirm dialog ── */}
      <ConfirmDialog
        confirm={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'resetSection') resetSection();
          else if (confirm?.kind === 'resetAll') resetAll();
          else if (confirm?.kind === 'deleteReview') deleteReview(confirm.id);
          else if (confirm?.kind === 'deleteUser') deleteUser(confirm.id);
          else if (confirm?.kind === 'switch') {
            switchTo(confirm.to);
            setConfirm(null);
          }
        }}
        saving={saving}
      />
    </div>
  );
}

// ── Object (single-section) editor with inline lists (e.g. footer links) ──
function ObjectEditor({ obj, set, section }) {
  const safeObj = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  const stringKeys = Object.keys(safeObj).filter((k) => typeof safeObj[k] === 'string');
  const listKeys = Object.keys(safeObj).filter((k) => Array.isArray(safeObj[k]));

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        {stringKeys.map((k) =>
          <TextField
            key={k}
            k={k}
            v={safeObj[k]}
            onV={(val) => set(k, val)}
            label={SECTION_LABELS[section]?.[k]}
          />
        )}
      </div>
      {listKeys.map((k) => (
        <div key={k}>
          <div className="text-sm font-bold text-secondary mb-2">{LABELS[k] || k}</div>
          <ArrayEditor
            fields={['label', 'href']}
            items={safeObj[k]}
            setItem={(i, f, v) => {
              const arr = [...safeObj[k]];
              arr[i] = { ...arr[i], [f]: v };
              set(k, arr);
            }}
            onAdd={() => set(k, [...safeObj[k], {}])}
            onRemove={(i) => set(k, safeObj[k].filter((_, j) => j !== i))}
          />
        </div>
      ))}
    </div>
  );
}

// ── Single text input / textarea / logo upload ──
function TextField({ k, v, onV, label }) {
  const long = LONG_FIELDS.has(k);
  const resolved = label || LABELS[k] || k;
  return (
    <div>
      <label className="block text-xs font-semibold text-secondary/70 mb-1.5">
        {resolved}
      </label>
      {k === 'logo' ? (
        <LogoField v={v} onV={onV} />
      ) : long ? (
        <textarea rows={4} className={textCls} value={v || ''} onChange={(e) => onV(e.target.value)} />
      ) : (
        <input className={inputCls} value={v || ''} onChange={(e) => onV(e.target.value)} />
      )}
    </div>
  );
}

// ── Logo field: upload a local image (stored as a data URL) or paste a URL ──
function LogoField({ v, onV }) {
  const fileRef = useRef(null);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState('');

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErr('Please choose an image file (PNG, JPG, SVG, …).');
      return;
    }
    if (file.size > 1024 * 1024) {
      setErr('Image is too large — please use a file under 1 MB.');
      return;
    }
    setErr('');
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      onV(reader.result);
      setReading(false);
    };
    reader.onerror = () => {
      setErr('Could not read that file. Try another one.');
      setReading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-white border border-secondary/10 flex items-center justify-center overflow-hidden shrink-0">
          {v ? (
            <img src={v} alt="logo preview" className="w-full h-full object-contain p-1" />
          ) : (
            <ImageIcon className="w-5 h-5 text-secondary/30" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={reading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-60"
            >
              {reading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {v ? 'Replace logo' : 'Upload logo'}
            </button>
            {v && (
              <button
                type="button"
                onClick={() => onV('')}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            )}
          </div>
          <p className="text-xs text-secondary/50 mt-1.5">
            Upload an image (≤1 MB) or paste an image URL below.
          </p>
        </div>
      </div>
      <input
        className={inputCls}
        placeholder="https://…/logo.png"
        value={v || ''}
        onChange={(e) => onV(e.target.value)}
      />
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

// ── List-of-objects editor ──
function ArrayEditor({ fields, items, setItem, onAdd, onRemove }) {
  const safeItems = Array.isArray(items) ? items : [];
  return (
    <div className="space-y-4">
      {safeItems.map((item, i) => (
        <div key={i} className="border border-secondary/10 rounded-xl p-4 bg-secondary/[0.02] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-secondary/50">
              {fields[0] && item[fields[0]] ? item[fields[0]] : `Item ${i + 1}`}
            </span>
            <button
              onClick={() => onRemove(i)}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
          {fields.map((f) => (
            <TextField key={f} k={f} v={item[f]} onV={(val) => setItem(i, f, val)} />
          ))}
        </div>
      ))}
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/5 text-secondary font-semibold text-sm hover:bg-secondary/10 transition-colors"
      >
        <Plus className="w-4 h-4" /> Add item
      </button>
    </div>
  );
}

// ── Reviews management ──
function ReviewsManager({ reviews, loading, empty, filter, setFilter, counts, onApprove, onDelete }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        {[
          { id: 'pending', label: `Pending (${counts.pending})` },
          { id: 'approved', label: `Approved (${counts.approved})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === t.id ? 'bg-primary text-secondary shadow' : 'bg-secondary/5 text-secondary/70 hover:text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-secondary/50">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center justify-center py-16 text-secondary/50 gap-3">
          <MessageSquare className="w-8 h-8" />
          <span>No reviews yet. Submissions from the landing page appear here.</span>
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-secondary/50 gap-3">
          <MessageSquare className="w-8 h-8" />
          <span>Nothing in this filter.</span>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div
              key={r._id}
              className={`border rounded-xl p-5 space-y-3 ${
                r.approved ? 'border-green-200 bg-green-50/40' : 'border-amber-200 bg-amber-50/40'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-secondary">{r.name}</span>
                    {r.role && <span className="text-sm text-secondary/60">· {r.role}</span>}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-primary text-primary' : 'text-secondary/20'}`} />
                      ))}
                    </div>
                    <span className={`ml-2 text-xs font-semibold ${r.approved ? 'text-green-700' : 'text-amber-700'}`}>
                      {r.approved ? 'Approved · showing' : 'Pending approval'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => onApprove(r._id, !r.approved)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      r.approved ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-green-100 text-green-800 hover:bg-green-200'
                    }`}
                  >
                    {r.approved ? <ThumbsDown className="w-3.5 h-3.5" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                    {r.approved ? 'Unapprove' : 'Approve'}
                  </button>
                  <button
                    onClick={() => onDelete(r._id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
              <p className="text-secondary/85 text-sm leading-relaxed">&ldquo;{r.message}&rdquo;</p>
              <div className="text-xs text-secondary/50">Submitted {new Date(r.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── User management ──
const ROLE_BADGE = {
  admin: 'bg-purple-100 text-purple-700',
  hub: 'bg-blue-100 text-blue-700',
  seeker: 'bg-emerald-100 text-emerald-700',
  employer: 'bg-amber-100 text-amber-800',
};
const STATUS_BADGE = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};
const initials = (name = '') =>
  name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

function UsersManager({ users, loading, roleFilter, setRoleFilter, statusFilter, setStatusFilter, search, setSearch, pendingCount, onUpdate, onDelete }) {
  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, company, hub code…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="sm:w-40 px-3 py-2.5 rounded-xl bg-white border border-secondary/10 text-sm outline-none focus:border-primary"
        >
          {['all', 'hub', 'seeker', 'employer', 'admin'].map((r) => (
            <option key={r} value={r}>{r === 'all' ? 'All roles' : r.charAt(0).toUpperCase() + r.slice(1) + 's'}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="sm:w-40 px-3 py-2.5 rounded-xl bg-white border border-secondary/10 text-sm outline-none focus:border-primary"
        >
          {['all', 'pending', 'approved', 'rejected'].map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex items-center gap-2 text-xs text-secondary/50">
        <Users className="w-4 h-4" />
        {users.length} {users.length === 1 ? 'account' : 'accounts'}
        {pendingCount > 0 && <span className="text-amber-700 font-semibold">· {pendingCount} pending approval</span>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-secondary/50">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-secondary/50 gap-3">
          <Users className="w-8 h-8" />
          <span>No accounts match these filters.</span>
        </div>
      ) : (
        <div className="space-y-4">
          {users.map((u) => {
            const isAdmin = u.role === 'admin';
            const inactive = u.active === false;
            const approved = u.status === 'approved';
            const seekerLink = u.role === 'seeker' ? `${window.location.origin}/portfolio/${u.id}` : '';
            return (
              <div
                key={u.id}
                className={`border rounded-xl p-5 ${
                  inactive ? 'border-secondary/10 bg-secondary/[0.03] opacity-80'
                  : u.status === 'rejected' ? 'border-red-200 bg-red-50/40'
                  : u.status === 'pending' ? 'border-amber-200 bg-amber-50/40'
                  : 'border-secondary/10 bg-white'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center font-display font-bold text-secondary shrink-0">
                    {initials(u.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-bold text-secondary">{u.name}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${ROLE_BADGE[u.role] || 'bg-secondary/10 text-secondary/60'}`}>
                        {u.role}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${STATUS_BADGE[u.status] || 'bg-secondary/10 text-secondary/60'}`}>
                        {u.status || 'approved'}
                      </span>
                      {inactive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-red-100 text-red-700">
                          <Power className="w-3 h-3" /> Disabled
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-secondary/60 mt-0.5 truncate">{u.email}</div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary/50 mt-1.5">
                      {u.company && <span>{u.company}</span>}
                      {u.role === 'seeker' && <span>{u.title || 'Job seeker'}</span>}
                      <span>Joined {new Date(u.createdAt).toLocaleDateString()}</span>
                      {seekerLink && approved && !inactive && (
                        <a href={seekerLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline font-semibold">
                          <ExternalLink className="w-3 h-3" /> Portfolio
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    {u.status !== 'approved' && (
                      <button
                        onClick={() => onUpdate(u.id, { status: 'approved' })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5" /> Approve
                      </button>
                    )}
                    {u.status === 'pending' && !isAdmin && (
                      <button
                        onClick={() => onUpdate(u.id, { status: 'rejected' })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
                      >
                        <UserX className="w-3.5 h-3.5" /> Reject
                      </button>
                    )}
                    {!isAdmin && (
                      <button
                        onClick={() => onUpdate(u.id, { active: inactive })}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          inactive ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-secondary/5 text-secondary/70 hover:bg-secondary/10'
                        }`}
                        title={inactive ? 'Re-enable this account' : 'Disable this account'}
                      >
                        <Power className="w-3.5 h-3.5" /> {inactive ? 'Reactivate' : 'Deactivate'}
                      </button>
                    )}
                    {!isAdmin && (
                      <button
                        onClick={() => onDelete(u.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Interview management ──
const INT_STATUS_BADGE = {
  proposed: 'bg-amber-100 text-amber-800',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-secondary/10 text-secondary/50',
};

function InterviewsManager({ interviews, loading, statusFilter, setStatusFilter, onUpdate, onComplete }) {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex gap-1 bg-secondary/5 p-1 rounded-xl w-fit">
          {['all', 'proposed', 'accepted', 'completed'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                statusFilter === s ? 'bg-primary text-secondary shadow' : 'text-secondary/60 hover:text-secondary'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-secondary/50">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : interviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-secondary/50 gap-3">
          <CalendarDays className="w-8 h-8" />
          <span>No interviews match this filter.</span>
        </div>
      ) : (
        <div className="space-y-4">
          {interviews.map((iv) => {
            const u = iv.user || {};
            const date = iv.proposedDate ? new Date(iv.proposedDate) : null;
            const dateStr = date
              ? `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' })}${iv.proposedTime ? ' · ' + iv.proposedTime : ''}`
              : '—';
            return (
              <div
                key={iv.id}
                className={`border rounded-xl p-5 ${
                  iv.status === 'accepted' ? 'border-green-200 bg-green-50/40'
                  : iv.status === 'completed' ? 'border-emerald-200 bg-emerald-50/40'
                  : iv.status === 'rejected' ? 'border-red-200 bg-red-50/40'
                  : 'border-secondary/10 bg-white'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center font-display font-bold text-secondary shrink-0">
                    {initials(u.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-bold text-secondary">{u.name || 'Unknown user'}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${ROLE_BADGE[u.role] || 'bg-secondary/10 text-secondary/60'}`}>
                        {u.role}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${INT_STATUS_BADGE[iv.status] || 'bg-secondary/10 text-secondary/60'}`}>
                        {iv.status}
                      </span>
                    </div>
                    <div className="text-sm text-secondary/60 mt-0.5">{u.email}</div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary/50 mt-1.5">
                      <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {dateStr}</span>
                      <span>Proposed {new Date(iv.createdAt).toLocaleDateString()}</span>
                    </div>
                    {iv.notes && (
                      <div className="mt-2 text-sm text-secondary/70 bg-secondary/5 rounded-lg px-3 py-2 italic">"{iv.notes}"</div>
                    )}
                    {iv.adminNotes && (
                      <div className="mt-2 text-xs text-secondary/50">Admin note: {iv.adminNotes}</div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    {iv.status === 'proposed' && (
                      <>
                        <button
                          onClick={() => onUpdate(iv.id, 'accepted')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                        </button>
                        <button
                          onClick={() => onUpdate(iv.id, 'rejected')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {iv.status === 'accepted' && (
                      <>
                        <a
                          href={`/call/${iv.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-secondary hover:bg-primary/90 transition-colors"
                        >
                          <Video className="w-3.5 h-3.5" /> Join call
                        </a>
                        <button
                          onClick={() => onComplete(iv.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mark complete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Confirm dialog ──
function ConfirmDialog({ confirm, onCancel, onConfirm, saving }) {
  if (!confirm) return null;
  const copy = {
    resetSection: {
      title: 'Reset this section?',
      body: `“${confirm.section || ''}” will be restored to its default values. Your edits to this section will be lost.`,
      yes: 'Reset section',
      danger: true,
    },
    resetAll: {
      title: 'Reset ALL content?',
      body: 'Every section on the landing page will be restored to the defaults. Your current edits will be lost. This cannot be undone.',
      yes: 'Reset everything',
      danger: true,
    },
    deleteReview: {
      title: 'Delete this review?',
      body: 'The review will be permanently removed and will no longer show on the site.',
      yes: 'Delete review',
      danger: true,
    },
    deleteUser: {
      title: 'Delete this account?',
      body: 'The account and all of its data will be permanently removed. This cannot be undone.',
      yes: 'Delete account',
      danger: true,
    },
    switch: {
      title: 'Discard unsaved changes?',
      body: 'You have unsaved changes in this section. They will be lost if you switch now.',
      yes: 'Discard & switch',
      danger: true,
    },
  }[confirm.kind];

  return (
    <div className="fixed inset-0 z-[80] flex p-4 pointer-events-none overflow-y-auto">
      <div className="fixed inset-0 bg-secondary/50 backdrop-blur-sm pointer-events-auto" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto m-auto p-6">
        <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>
        <h3 className="font-display text-lg font-bold text-secondary">{copy.title}</h3>
        <p className="text-sm text-secondary/60 mt-1 mb-6">{copy.body}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-secondary/5 text-secondary text-sm font-semibold hover:bg-secondary/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null} {copy.yes}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Error boundary: if any section stalls while rendering, show a friendly
//    message instead of white-screening the whole admin panel. ──
class EditorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  render() {
    if (this.state.err) {
      return (
        <div className="p-5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Something went wrong rendering this section. Click another section and come back.
        </div>
      );
    }
    return this.props.children;
  }
}