import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Clock,
  Loader2,
  CheckCircle2,
  Hourglass,
  Video,
  LogOut,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  Network,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useContent } from '../context/ContentContext.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';

export default function InterviewSchedulingPage() {
  const { user, role, signOut, updateUser } = useAuth();
  const { content } = useContent();
  const branding = content.branding || {};
  const navigate = useNavigate();
  const token = localStorage.getItem('tbai.token');

  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [proposing, setProposing] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/interviews/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setInterviews(d.interviews || []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Keep the account status fresh — when the admin marks the interview
    // complete, this page should notice without a manual refresh.
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          updateUser({ status: d.user.status, active: d.user.active, interviewDone: d.user.interviewDone });
          load();
        }
      } catch { /* ignore */ }
    }, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = interviews.find(
    (i) => ['proposed', 'accepted'].includes(i.status)
  );

  const propose = async () => {
    if (!date) return setMsg('Please choose a date for your interview.');
    setMsg('');
    setProposing(true);
    try {
      const res = await fetch(`${API_URL}/interviews/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ proposedDate: date, proposedTime: time, notes }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not propose the interview.');
      await load();
    } catch (e) {
      setMsg(e.message || 'Could not reach the server.');
    } finally {
      setProposing(false);
    }
  };

  const cancel = async (id) => {
    setCancelling(true);
    // Hiding the current proposal locally; proposing another time on the server
    // automatically cancels any previous proposed interview.
    setInterviews((is) => is.map((i) => (i.id === id ? { ...i, status: 'cancelled' } : i)));
    setCancelling(false);
  };

  const today = new Date().toISOString().split('T')[0];

  // Fully interviewed → unlock dashboard.
  if (user?.interviewDone) {
    return (
      <Shell branding={branding} user={user} signOut={signOut}>
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="bg-white rounded-3xl border border-secondary/10 p-8 md:p-10 shadow-sm text-center">
            <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-secondary">Interview complete — welcome!</h1>
            <p className="text-secondary/60 text-sm mt-2 leading-relaxed">
              Your profile is approved and your interview is done. Your dashboard is now fully unlocked.
            </p>
            <ButtonRow role={role} navigate={navigate} signOut={signOut} />
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell branding={branding} user={user} signOut={signOut}>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 text-primary text-[11px] font-bold uppercase tracking-widest mb-2">
            <Video className="w-3.5 h-3.5" /> Step 2 of 2 — Onboarding interview
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-secondary">Schedule your introduction call</h1>
          <p className="text-secondary/60 text-sm mt-2 max-w-xl mx-auto">
            As part of our onboarding every new {role === 'seeker' ? 'job seeker' : role === 'hub' ? 'talent hub' : 'employer'}
            has a short video call with a site administrator. Pick a time that works and we'll confirm it.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : active ? (
          <ActiveInterview active={active} isSeeker={role === 'seeker'} cancel={cancel} cancelling={cancelling} />
        ) : (
          <div className="bg-white rounded-3xl border border-secondary/10 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-display font-bold text-secondary">Pick a date &amp; time</h2>
                <p className="text-xs text-secondary/50">Calls happen on the platform — video + screen share included.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1.5">Date</label>
                <input
                  type="date"
                  min={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1.5">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <label className="block text-sm font-semibold text-secondary mt-5 mb-1.5">
              Notes for the admin <span className="text-secondary/40 font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything we should know before the call?"
              className="w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm resize-none"
            />

            {msg && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mt-4">
                <AlertCircle className="w-4 h-4 shrink-0" /> {msg}
              </div>
            )}

            <button
              onClick={propose}
              disabled={proposing}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {proposing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Propose this time
            </button>

            <p className="text-xs text-secondary/50 mt-4 text-center">
              You can change it later — the admin only needs to approve once.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}

function ActiveInterview({ active, isSeeker, cancel, cancelling }) {
  const selected = active.proposedDate ? new Date(active.proposedDate) : null;
  if (active.status === 'accepted') {
    return (
      <div className="bg-white rounded-3xl border border-secondary/10 p-8 shadow-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="font-display text-xl font-bold text-secondary">Your interview is confirmed</h2>
        <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold">
          <Clock className="w-4 h-4 text-primary" />
          {selected?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          {active.proposedTime && <> · {active.proposedTime}</>}
        </div>
        <p className="text-secondary/60 text-sm mt-3">
          Join the call at your scheduled time. The admin will open the room — you'll see them once they connect.
        </p>
        <button
          onClick={() => window.open(`/call/${active.id}`, '_blank')}
          className="mt-6 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors"
        >
          <Video className="w-4 h-4" /> Join the video call
        </button>
        <p className="text-xs text-secondary/50 mt-3">
          The call opens in a new tab. Make sure camera &amp; mic permissions are allowed.
        </p>
      </div>
    );
  }

  // proposed
  return (
    <div className="bg-white rounded-3xl border border-secondary/10 p-8 shadow-sm text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-5">
        <Hourglass className="w-8 h-8 text-amber-600" />
      </div>
      <h2 className="font-display text-xl font-bold text-secondary">Waiting for admin confirmation</h2>
      <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold">
        <Clock className="w-4 h-4 text-primary" />
        {selected?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        {active.proposedTime && <> · {active.proposedTime}</>}
      </div>
      <p className="text-secondary/60 text-sm mt-3">
        We've sent your proposed time to the admin. Once they accept, you'll be able to join the video call from this page.
      </p>
      <button
        onClick={() => cancel(active.id)}
        disabled={cancelling}
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary/5 text-secondary text-sm font-semibold hover:bg-secondary/10 transition-colors disabled:opacity-60"
      >
        <RefreshCw className="w-4 h-4" /> Propose a different time
      </button>
      {isSeeker && (
        <p className="text-xs text-secondary/40 mt-4">
          Your portfolio link above is already shared with the admin — feel free to preview it in the meantime.
        </p>
      )}
    </div>
  );
}

function ButtonRow({ role, navigate, signOut }) {
  return (
    <div className="flex flex-wrap justify-center gap-3 mt-6">
      <button
        onClick={() => navigate(`/dashboard/${role}`)}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors"
      >
        <ArrowRight className="w-4 h-4" /> Go to dashboard
      </button>
      <button
        onClick={signOut}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary/5 text-secondary font-semibold hover:bg-secondary/10 transition-colors"
      >
        <LogOut className="w-4 h-4" /> Log out
      </button>
    </div>
  );
}

function Shell({ branding, user, signOut, children }) {
  const navigate = useNavigate();
  const portfolioUrl = user?.id ? `${window.location.origin}/portfolio/${user.id}` : '';
  return (
    <main className="min-h-screen bg-[#faf9f6]">
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
            {portfolioUrl && (
              <a
                href={portfolioUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center px-3 py-2 text-sm font-semibold text-primary hover:text-primary/80"
              >
                Portfolio
              </a>
            )}
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}