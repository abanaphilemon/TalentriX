import { useEffect, useRef, useState } from 'react';
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
  Star,
  BadgeCheck,
  ExternalLink,
  ImagePlus,
  X,
  Lock,
  MessageSquare,
  CreditCard,
  AlertTriangle,
  Target,
  Mail,
  Phone,
  Github,
  Globe,
  Headset,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useContent } from '../context/ContentContext.jsx';
import SecureChat, { fetchUnreadCount } from '../components/SecureChat.jsx';
import ChatClosureModal from '../components/ChatClosureModal.jsx';
import NotificationCenter from '../components/NotificationCenter.jsx';
import SupportCenter from '../components/SupportCenter.jsx';
import EmployerRequestTalent from './EmployerRequestTalent.jsx';
import { readImageFile } from '../lib/image.js';

const API_URL = import.meta.env.VITE_API_URL || '/api';

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
  const { content } = useContent();
  const branding = content.branding || {};
  const [tab, setTab] = useState('requestTalent'); // 'requestTalent' | 'seekers' | 'profile' — talent requests load first
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [savedMsg, setSavedMsg] = useState('');
  const [logoReading, setLogoReading] = useState(false);
  const logoRef = useRef(null);

  // Seekers state
  const [seekers, setSeekers] = useState([]);
  const [seekersLoading, setSeekersLoading] = useState(false);
  const [hubs, setHubs] = useState([]); // registered hubs for the filter dropdown
  const [hubFilter, setHubFilter] = useState(''); // '' = all hubs
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState(null); // seeker detail modal

  // Secure chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeed, setChatSeed] = useState(null);
  const [unread, setUnread] = useState(0);

  // Payment gate
  const [payModal, setPayModal] = useState(null); // seeker object or null
  const [payLoading, setPayLoading] = useState(false);
  const [payPrice, setPayPrice] = useState(null);
  const [payMsg, setPayMsg] = useState('');
  const [paidSeekers, setPaidSeekers] = useState(new Set());

  // Chat locks & employment-sharing flow
  const [closureQueue, setClosureQueue] = useState([]);
  const [closureOpen, setClosureOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closureOpenRef = useRef(false);
  useEffect(() => {
    closureOpenRef.current = closureOpen;
  }, [closureOpen]);

  const [supportOpen, setSupportOpen] = useState(false);
  const [reviewables, setReviewables] = useState({}); // { [seekerId]: { rating, review } | null }
  const [reviewModal, setReviewModal] = useState(null); // seeker object (with extra fields) or null
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewMsg, setReviewMsg] = useState('');

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
          logo: d.profile.logo || '',
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
      const res = await fetch(`${API_URL}/seekers`, {
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

  const loadHubs = async () => {
    try {
      const res = await fetch(`${API_URL}/hubs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setHubs(d.hubs || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadProfile();
    loadSeekers();
    loadHubs();
    loadPaymentInfo();
    loadReviewables();
    handlePaymentCallback();
    handleChatReturn();
    loadPendingClosures();
    const closurePoll = setInterval(() => loadPendingClosures(), 60000);
    return () => clearInterval(closurePoll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'seekers') loadSeekers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onLogoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSavedMsg('');
    setLogoReading(true);
    try {
      const logo = await readImageFile(file, { forcePng: true });
      set('logo', logo);
      setSavedMsg('Logo ready — press “Save changes” to keep it.');
    } catch (err) {
      setSavedMsg(err.message || 'Could not read that image. Try another.');
    } finally {
      setLogoReading(false);
    }
  };

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
    if (hubFilter && String(s.hubId) !== String(hubFilter)) return false;
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

  // Poll unread count so a badge can surface on the Messages button.
  useEffect(() => {
    if (!token) return;
    const tick = async () => setUnread(await fetchUnreadCount(token));
    tick();
    const iv = setInterval(tick, 15000);
    return () => clearInterval(iv);
  }, [token]);

  // ── Payment helpers ──
  const loadPaymentInfo = async () => {
    try {
      const [priceRes, paymentsRes] = await Promise.all([
        fetch(`${API_URL}/payment/price`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/payment/my-payments`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (priceRes.ok) setPayPrice(await priceRes.json());
      if (paymentsRes.ok) {
        const d = await paymentsRes.json();
        setPaidSeekers(new Set((d.payments || []).map((p) => p.seekerId)));
      }
    } catch { /* ignore */ }
  };

  const loadReviewables = async () => {
    try {
      const res = await fetch(`${API_URL}/employer/reviewables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        const map = {};
        for (const item of d.items || []) {
          map[String(item.seekerId)] = item.review || null;
        }
        setReviewables(map);
      }
    } catch { /* ignore */ }
  };

  const openReviewModal = (seeker) => {
    const existing = reviewables[String(seeker.id)];
    setReviewModal(seeker);
    setReviewRating(existing?.rating || 0);
    setReviewText(existing?.review || '');
    setReviewMsg('');
  };

  const submitReview = async () => {
    if (!reviewModal || reviewRating < 1) {
      setReviewMsg('Pick a star rating (1–5) to submit.');
      return;
    }
    setReviewSaving(true);
    setReviewMsg('');
    try {
      const res = await fetch(`${API_URL}/seekers/${reviewModal.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: reviewRating, review: reviewText }),
      });
      const d = await res.json();
      if (!res.ok) {
        setReviewMsg(d.message || 'Could not save review.');
        return;
      }
      setReviewables((prev) => ({ ...prev, [String(reviewModal.id)]: { rating: d.review.rating, review: d.review.review } }));
      setReviewModal(null);
      loadSeekers();
    } catch {
      setReviewMsg('Network error. Try again.');
    } finally {
      setReviewSaving(false);
    }
  };

  const handlePaymentCallback = async () => {
    const params = new URLSearchParams(window.location.search);
    // Monnify appends paymentReference; fall back to paymentRef for manual/test callbacks.
    const payRef = params.get('paymentReference') || params.get('paymentRef');
    if (!payRef) return;
    const seekerId = params.get('seeker');
    let pendingSeeker = null;
    try {
      pendingSeeker = JSON.parse(sessionStorage.getItem('tbai.pendingSeeker') || 'null');
    } catch { /* ignore */ }
    try {
      const res = await fetch(`${API_URL}/payment/verify/${payRef}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (d.paid) {
        loadPaymentInfo();
        loadSeekers();
        const target = seekerId || pendingSeeker?.id;
        setPayMsg(target
          ? `Payment confirmed! Opening chat with ${pendingSeeker?.name || 'this job seeker'}…`
          : 'Payment confirmed! You can now chat with this job seeker.');
        // Open the chat right away for the seeker that was just unlocked.
        if (target) openChat(target, true);
        setTimeout(() => setPayMsg(''), 5000);
      } else {
        setPayMsg('Payment not confirmed yet. If you were charged, contact support.');
        setTimeout(() => setPayMsg(''), 6000);
      }
    } catch {
      setPayMsg('Could not confirm payment. Please contact support.');
    } finally {
      sessionStorage.removeItem('tbai.pendingSeeker');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const initiatePayment = async (seeker) => {
    setPayLoading(true);
    setPayMsg('');
    try {
      const res = await fetch(`${API_URL}/payment/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ seekerId: seeker.id }),
      });
      const d = await res.json();
      if (d.paid) {
        setPaidSeekers((prev) => new Set([...prev, seeker.id]));
        setSeekers((prev) => prev.map((s) => (s.id === seeker.id ? { ...s, contactLocked: false } : s)));
        setPayModal(null);
        openChat(seeker.id);
        return;
      }
      if (d.checkoutUrl) {
        sessionStorage.setItem('tbai.pendingSeeker', JSON.stringify({ id: seeker.id, name: seeker.name }));
        window.location.href = d.checkoutUrl;
        return;
      }
      setPayMsg(d.detail || d.message || 'Could not start payment.');
    } catch {
      setPayMsg('Could not connect to payment server.');
    } finally {
      setPayLoading(false);
    }
  };

  // Returning from a video call: ?chat=<seekerId> re-opens the secure chat
  // thread we were just chatting on.
  const handleChatReturn = async () => {
    const chat = new URLSearchParams(window.location.search).get('chat');
    if (!chat) return;
    openChat(chat, true);
    window.history.replaceState({}, '', window.location.pathname);
  };

  const openChat = async (seed, force = false) => {
    // Payment gate: if seeding a specific seeker, check if paid
    if (!force && seed && !paidSeekers.has(seed)) {
      const seeker = seekers.find((s) => s.id === seed);
      // Live-check with the backend — it reconciles the latest pending
      // transaction with Monnify, so a charge that already succeeded is
      // never shown as locked again.
      let unlocked = false;
      try {
        const res = await fetch(`${API_URL}/payment/check/${seed}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) unlocked = !!(await res.json()).paid;
      } catch { /* ignore */ }
      if (!unlocked) {
        if (seeker) {
          setPayModal(seeker);
          // Re-fetch pricing every time the modal opens so admin-side changes show up.
          refreshPrice();
          return;
        }
      } else {
        setPaidSeekers((prev) => new Set([...prev, seed]));
        setSeekers((prev) => prev.map((s) => (s.id === seed ? { ...s, contactLocked: false } : s)));
      }
    }
    setChatSeed(seed || null);
    setChatOpen(true);
  };

  const refreshPrice = async () => {
    try {
      const res = await fetch(`${API_URL}/payment/price`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setPayPrice(await res.json());
    } catch { /* ignore */ }
  };

  const closeChat = async () => {
    setChatOpen(false);
    setChatSeed(null);
    setUnread(await fetchUnreadCount(token));
    if (tab === 'seekers') loadSeekers();
  };

  // ── Chat locks & employment-sharing flow ────────────────────────────────
  // Load any pending "chat ended" flows. The backend closes chats idle for
  // 48 hours first, so a chat can expire while the employer is offline and
  // still ask for the popup here on the next login.
  const loadPendingClosures = async (silent = true) => {
    if (silent && closureOpenRef.current) return;
    try {
      const res = await fetch(`${API_URL}/employer/chat-closures/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        const pending = d.closures || [];
        setClosureQueue(pending);
        if (pending.length) setClosureOpen(true);
      }
    } catch {
      // ignore — retried on the next poll
    }
  };

  const submitClosure = async (payload) => {
    setClosing(true);
    try {
      const res = await fetch(`${API_URL}/employer/chat-closures/${closureQueue[0]?.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not save your answer.');
    } finally {
      setClosing(false);
    }
  };

  const dismissClosure = () => {
    const rest = closureQueue.slice(1);
    setClosureQueue(rest);
    if (rest.length === 0) setClosureOpen(false);
  };

  // Leave chat → locks it and opens the employment-sharing flow.
  const handleLeaveChat = async (partner) => {
    try {
      const res = await fetch(`${API_URL}/chat/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: partner.id }),
      });
      const d = await res.json();
      if (!res.ok) {
        setPayMsg(d.message || 'Could not leave this chat. Please try again.');
        setTimeout(() => setPayMsg(''), 5000);
        return;
      }
      await closeChat();
      if (d.closure) {
        setClosureQueue((prev) => [d.closure, ...prev.filter((c) => String(c.id) !== String(d.closure.id))]);
        setClosureOpen(true);
      }
      // The talent's contact details lock again — refresh their locked state.
      loadSeekers();
      loadPaymentInfo();
    } catch {
      setPayMsg('Could not leave this chat. Please try again.');
      setTimeout(() => setPayMsg(''), 5000);
    }
  };

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
            <NotificationCenter token={token} />
            <button
              onClick={() => setSupportOpen(true)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-secondary/5 hover:bg-secondary/10 transition-colors"
              title="Help & Support"
              aria-label="Help & Support"
            >
              <Headset className="w-4 h-4 text-secondary" />
            </button>
            <button
              onClick={() => openChat(null)}
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
          <button
            onClick={() => setTab('requestTalent')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'requestTalent'
                ? 'bg-primary text-secondary shadow-md'
                : 'text-secondary/60 hover:text-secondary'
            }`}
          >
            <Target className="w-4 h-4" /> Request Talent
          </button>
        </div>

        {tab === 'profile' && (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Left card — view mode summary */}
            <div className="md:col-span-1">
              <div className="bg-white rounded-2xl border border-secondary/10 p-6">
                <div className="flex flex-col items-center text-center">
                  <div className="relative">
                    {form.logo ? (
                      <img
                        src={form.logo}
                        alt="Profile logo"
                        className="w-20 h-20 rounded-2xl bg-white ring-2 ring-primary object-contain"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center">
                        <span className="font-display text-2xl font-bold text-secondary">
                          {initials(profile?.name || user?.name)}
                        </span>
                      </div>
                    )}
                    {form.logo && (
                      <button
                        type="button"
                        onClick={() => set('logo', '')}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                        aria-label="Remove logo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
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
                    disabled={logoReading}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary/5 hover:bg-secondary/10 text-xs font-semibold text-secondary transition-colors disabled:opacity-60"
                  >
                    {logoReading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                    {form.logo ? 'Change logo / photo' : 'Upload logo / photo'}
                  </button>
                  <p className="text-[11px] text-secondary/40 mt-1.5">
                    JPG or PNG — large photos are auto-resized; shown as your organization image.
                  </p>
                </div>
                <h2 className="font-display text-xl font-bold text-secondary mt-4 text-center">
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
              <div className="flex gap-1 p-1 rounded-xl w-fit">
                <select
                  value={hubFilter}
                  onChange={(e) => setHubFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-secondary/10 text-sm font-semibold text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all max-w-[12rem]"
                >
                  <option value="">All hubs</option>
                  {hubs.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
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
                  {hubFilter
                    ? 'No approved, interviewed talent is registered with that hub yet.'
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
                        <div className="text-xs text-secondary/50 truncate">
                          {s.contactLocked ? (
                            <span className="inline-flex items-center gap-1" title="Contact details unlock once you connect in the secure chat">
                              <Lock className="w-3 h-3 shrink-0" />
                              <span>••••••@•••••</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1" title="Contact details unlocked">
                              <Mail className="w-3 h-3 shrink-0 text-emerald-600" />
                              <span className="text-secondary/70">{s.email}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {s.title && (
                      <div className="text-sm text-secondary/70 mb-2">{s.title}</div>
                    )}

                    {(s.hubRating > 0 || s.hubRecommend) && (
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {s.hubRating > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-secondary bg-secondary/5 px-2 py-0.5 rounded-full">
                            <Star className="w-3.5 h-3.5 fill-primary text-primary" /> {s.hubRating}/5
                          </span>
                        )}
                        {s.hubRecommend && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <BadgeCheck className="w-3.5 h-3.5" /> Hub recommended
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

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-secondary/5">
                      {s.hubId ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700" title="The talent hub this seeker is registered with">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {s.hubName || 'Registered via hub'}
                        </span>
                      ) : (
                        <span className="text-xs text-secondary/40">Direct</span>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openChat(s.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-secondary/10 text-secondary text-sm font-semibold hover:border-primary hover:text-primary transition-colors"
                          title="Start a secure chat"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Message
                        </button>
                        <a
                          href={`/portfolio/${s.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-secondary text-sm font-bold hover:bg-primary/90 transition-colors"
                        >
                          <BadgeCheck className="w-3.5 h-3.5" /> Portfolio
                        </a>
                        {reviewables[String(s.id)] !== undefined && (
                          <button
                            onClick={() => openReviewModal(s)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-primary/30 text-primary text-sm font-bold hover:bg-primary/10 transition-colors"
                            title={reviewables[String(s.id)] ? 'Edit your review' : 'Leave a review'}
                          >
                            <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                            {reviewables[String(s.id)] ? 'Reviewed' : 'Review'}
                          </button>
                        )}
                        <button
                          onClick={() => setViewing(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-white text-sm font-semibold hover:bg-accent transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> Details
                        </button>
                      </div>
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
                  <p className="text-white/70 text-sm">
                    {viewing.contactLocked ? (
                      <span className="inline-flex items-center gap-1" title="Contact details unlock after payment">
                        <Lock className="w-3 h-3 shrink-0" />
                        <span>••••••@•••••</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3 h-3 shrink-0" />
                        <a href={`mailto:${viewing.email}`} className="underline">{viewing.email}</a>
                      </span>
                    )}
                  </p>
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

              {Array.isArray(viewing.experience) && viewing.experience.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-secondary/50 mb-2">
                    Experience
                  </div>
                  <div className="space-y-2.5">
                    {viewing.experience.map((e, i) => (
                      <div key={e._id || i} className="flex gap-2.5">
                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                        <div>
                          <div className="text-sm font-bold text-secondary">{e.title || 'Role'}</div>
                          {(e.company || e.start || e.end) && (
                            <div className="text-xs text-secondary/50">
                              {e.company}
                              {e.start || e.current || e.end ? ` · ${e.start || '…'}${e.current ? '—Present' : e.end ? `—${e.end}` : ''}` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewing.contactLocked ? (
                <div className="flex items-start gap-2 text-xs text-secondary bg-secondary/5 border border-secondary/10 rounded-xl px-3 py-2.5">
                  <Lock className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <p>
                    Contact details are hidden until you pay to unlock chat with this job seeker.
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-emerald-700 mb-2">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Contact details unlocked
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {viewing.email && (
                      <a href={`mailto:${viewing.email}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-primary transition-colors" title="Email">
                        <Mail className="w-4 h-4 text-primary" /> {viewing.email}
                      </a>
                    )}
                    {viewing.phone && (
                      <a href={`tel:${viewing.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-primary transition-colors" title="Phone">
                        <Phone className="w-4 h-4 text-primary" /> {viewing.phone}
                      </a>
                    )}
                    {viewing.linkedin && (
                      <a href={viewing.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-primary transition-colors" title="LinkedIn">
                        <LinkIcon className="w-4 h-4 text-primary" /> LinkedIn
                      </a>
                    )}
                    {viewing.github && (
                      <a href={viewing.github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-primary transition-colors" title="GitHub">
                        <Github className="w-4 h-4 text-primary" /> GitHub
                      </a>
                    )}
                    {viewing.website && (
                      <a href={viewing.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-primary transition-colors" title="Website">
                        <Globe className="w-4 h-4 text-primary" /> Website
                      </a>
                    )}
                  </div>
                </div>
              )}

              {viewing.location && (
                <div className="flex items-center gap-1.5 text-sm text-secondary/70">
                  <MapPin className="w-4 h-4 text-secondary/40" /> {viewing.location}
                </div>
              )}

              {(viewing.resumeLink || viewing.cv) && (
                <a
                  href={viewing.resumeLink || viewing.cv}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 underline"
                >
                  <FileText className="w-4 h-4" /> View resume
                </a>
              )}

              {(viewing.hubId || viewing.hubRating > 0 || viewing.hubRecommend) && (
                <div className="flex flex-wrap items-center gap-2">
                  {viewing.hubRecommend && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                      <BadgeCheck className="w-4 h-4" /> Recommended by their hub
                    </span>
                  )}
                  {viewing.hubRating > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-secondary bg-secondary/5 px-2.5 py-1 rounded-full">
                      <Star className="w-4 h-4 fill-primary text-primary" /> Rated {viewing.hubRating}/5
                    </span>
                  )}
                  {viewing.hubId && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {viewing.hubName || 'Registered via a hub'}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 pt-0 space-y-2">
              <button
                onClick={() => {
                  setViewing(null);
                  openChat(viewing.id);
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors"
              >
                <MessageSquare className="w-4 h-4" /> Start secure chat
              </button>
              <a
                href={`/portfolio/${viewing.id}`}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary text-white font-semibold hover:bg-accent transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Open full portfolio
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

      {tab === 'requestTalent' && <EmployerRequestTalent />}

      {/* Secure end-to-end encrypted chat */}
      <SecureChat open={chatOpen} onClose={closeChat} seedId={chatSeed} onLeaveChat={handleLeaveChat} />

      {/* Chat-lock / employment-sharing modal */}
      <ChatClosureModal
        open={closureOpen && closureQueue.length > 0}
        closure={closureQueue[0] || null}
        busy={closing}
        onSubmit={submitClosure}
        onDismiss={dismissClosure}
      />

      {/* Payment success banner */}
      {payMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-white border border-emerald-200 text-emerald-800 px-5 py-3 rounded-2xl shadow-lg flex items-center gap-2 text-sm font-semibold animate-pop-in">
          <CheckCircle2 className="w-4 h-4" />
          {payMsg}
        </div>
      )}

      {/* Payment modal */}
      {payModal && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-secondary/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-pop-in">
            <div className="bg-secondary text-white p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <h3 className="font-display font-bold">Unlock chat</h3>
                  <p className="text-white/60 text-xs">One-time payment per job seeker</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                  <span className="font-display font-bold text-secondary text-sm">
                    {payModal.name?.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-secondary">{payModal.name}</div>
                  {payModal.title && <div className="text-xs text-secondary/50">{payModal.title}</div>}
                </div>
              </div>

              <div className="bg-secondary/5 rounded-2xl p-4 mb-5">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-secondary/60">Chat access fee</span>
                  <span className="font-semibold text-secondary">₦{payPrice?.amount?.toLocaleString() || '5,000'}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-secondary/60">VAT (7.5%)</span>
                  <span className="font-semibold text-secondary">
                    ₦{payPrice ? Math.round(payPrice.amount * payPrice.vatRate).toLocaleString() : '375'}
                  </span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-secondary/60">Service charge</span>
                  <span className="font-semibold text-secondary">₦{payPrice?.serviceCharge?.toLocaleString() || '100'}</span>
                </div>
                <div className="border-t border-secondary/10 pt-2 flex justify-between">
                  <span className="font-bold text-secondary">Total</span>
                  <span className="font-bold text-secondary">
                    ₦{payPrice
                      ? (payPrice.amount + Math.round(payPrice.amount * payPrice.vatRate) + payPrice.serviceCharge).toLocaleString()
                      : '5,475'}
                  </span>
                </div>
              </div>

              <p className="text-xs text-secondary/50 mb-5">
                This is a one-time payment to unlock secure chat with this job seeker. Once paid, you can message them freely.
              </p>

              {payMsg && (
                <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {payMsg}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setPayModal(null); setPayMsg(''); }}
                  className="flex-1 py-2.5 rounded-xl bg-secondary/5 text-secondary font-semibold hover:bg-secondary/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => initiatePayment(payModal)}
                  disabled={payLoading}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {payLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  Pay & unlock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review modal */}
      {reviewModal && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-secondary/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-pop-in">
            <div className="bg-secondary text-white p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                  <Star className="w-5 h-5 text-secondary fill-primary" />
                </div>
                <div>
                  <h3 className="font-display font-bold">{reviewables[String(reviewModal.id)] ? 'Edit your review' : 'Review this talent'}</h3>
                  <p className="text-white/60 text-xs">Your review shows on {reviewModal.name?.split(' ')[0]}'s public portfolio.</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                  <span className="font-display font-bold text-secondary text-sm">
                    {reviewModal.name?.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-secondary">{reviewModal.name}</div>
                  {reviewModal.title && <div className="text-xs text-secondary/50">{reviewModal.title}</div>}
                </div>
              </div>

              <label className="block text-xs font-semibold text-secondary/70 mb-2">Your rating</label>
              <div className="flex items-center gap-1.5 mb-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setReviewRating(i)}
                    className="group p-1"
                    aria-label={`${i} star${i > 1 ? 's' : ''}`}
                  >
                    <Star
                      className={`w-8 h-8 transition-transform group-hover:scale-110 ${
                        i <= reviewRating ? 'fill-primary text-primary' : 'text-secondary/20 hover:text-secondary/40'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <label className="block text-xs font-semibold text-secondary/70 mb-1">Your review (optional)</label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="How was working with them?"
                className="w-full px-4 py-3 rounded-xl bg-secondary/5 border border-secondary/10 focus:border-primary/60 focus:outline-none text-secondary text-sm mb-5 resize-none"
              />

              {reviewMsg && (
                <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {reviewMsg}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setReviewModal(null)}
                  className="flex-1 py-2.5 rounded-xl bg-secondary/5 text-secondary font-semibold hover:bg-secondary/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitReview}
                  disabled={reviewSaving}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {reviewSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4 fill-primary" />}
                  {reviewables[String(reviewModal.id)] ? 'Update review' : 'Submit review'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SupportCenter token={token} userRole="employer" open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}
