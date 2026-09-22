import { useEffect, useMemo, useState } from 'react';
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
  Timer,
  CalendarX2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useContent } from '../context/ContentContext.jsx';
import BrandBadge from '../components/BrandBadge.jsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const TZ = 'Africa/Lagos';
const SLOT_START = 8 * 60; // 08:00
const SLOT_END = 20 * 60; // last slot starts no later than 19:30 (3h block)
const SLOT_STEP = 30;
const LAGOS_OFFSET_MS = 60 * 60 * 1000; // UTC+1 (Nigeria has no DST)

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';

// "YYYY-MM-DD" + "HH:MM" wall-clock (Nigeria) → absolute Date.
function toLagos(DateLike, timeStr) {
  const [y, m, d] = String(DateLike).slice(0, 10).split('-').map(Number);
  const [hh, mm] = String(timeStr || '').split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0) - LAGOS_OFFSET_MS);
}

// Current wall-clock date/time in Nigeria.
function lagosNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => (parts.find((p) => p.type === t)?.value || '');
  const hh = get('hour') === '24' ? '00' : get('hour');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hh}:${get('minute')}:${get('second')}`,
    instant: new Date(Date.UTC(get('year'), get('month') - 1, get('day'), hh, get('minute'), get('second')) - LAGOS_OFFSET_MS),
  };
}

function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function genSlots() {
  const out = [];
  for (let m = SLOT_START; m < SLOT_END; m += SLOT_STEP) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}
const ALL_SLOTS = genSlots();

const fmtLong = (iv) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(iv.proposedDate));

export default function InterviewSchedulingPage() {
  const { user, role, signOut, updateUser } = useAuth();
  const { content } = useContent();
  const branding = content.branding || {};
  const navigate = useNavigate();
  const token = localStorage.getItem('tbai.token');

  const [interviews, setInterviews] = useState([]);
  const [booked, setBooked] = useState([]); // { id, userId, start, end }
  const [loading, setLoading] = useState(true);
  const [proposing, setProposing] = useState(false);
  const [booking, setBooking] = useState(false); // true → show the picker
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const nowLagos = useMemo(() => lagosNow(), [loading]);

  // Default to the next free Nigeria slot (today if possible, else tomorrow).
  const defaults = useMemo(() => {
    const n = lagosNow();
    let pickDate = n.date;
    let slot = ALL_SLOTS.find((t) => {
      const st = toLagos(pickDate, t);
      return st > n.instant;
    });
    if (!slot) {
      pickDate = addDays(n.date, 1);
    }
    return { defaultDate: pickDate, defaultTime: slot || '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [meRes, slotsRes] = await Promise.all([
        fetch(`${API_URL}/interviews/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/interviews/slots`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (meRes.ok) {
        const d = await meRes.json();
        setInterviews(d.interviews || []);
      }
      if (slotsRes.ok) {
        const d = await slotsRes.json();
        setBooked(d.slots || []);
      }
    } catch { /* ignore */ } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!date) setDate(defaults.defaultDate);
    if (!time) setTime(defaults.defaultTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults]);

  useEffect(() => {
    load();
    // Stay fresh: when the admin approves/expires the request this page should
    // notice without a manual refresh, and blocked slots must update too.
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          updateUser({ status: d.user.status, active: d.user.active, interviewDone: d.user.interviewDone });
        }
        load(true);
      } catch { /* ignore */ }
    }, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = interviews.find((i) => ['proposed', 'accepted'].includes(i.status));
  const expiredList = interviews.filter((i) => i.status === 'expired');

  const blockedForSlot = (slotTime) => {
    const st = toLagos(date || defaults.defaultDate, slotTime);
    return booked.some((r) => st >= new Date(r.start) && st < new Date(r.end));
  };
  const isMine = (slotTime) => {
    const st = toLagos(date || defaults.defaultDate, slotTime);
    return booked.some((r) => String(r.userId) === String(user?.id) && st >= new Date(r.start) && st < new Date(r.end));
  };
  const slotLocked = (slotTime) => {
    const st = toLagos(date, slotTime);
    return st <= (nowLagos?.instant || new Date());
  };

  const propose = async (e) => {
    e.preventDefault();
    if (!date) return setMsg('Please choose a date for your interview.');
    if (!time) return setMsg('Please choose a time slot for your interview.');
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
      setBooking(false);
      await load();
    } catch (e) {
      setMsg(e.message || 'Could not reach the server.');
    } finally {
      setProposing(false);
    }
  };

  const cancelReschedule = (id) => {
    setCancelling(true);
    setInterviews((is) => is.map((i) => (i.id === id ? { ...i, status: 'cancelled' } : i)));
    setCancelling(false);
  };

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

  const showPicker = booking || !active;

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
            has a short video call with a site administrator. Times below are Nigeria time (WAT).
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {expiredList.length > 0 && <ExpiredNotice count={expiredList.length} />}

            {!showPicker && active && active.status === 'accepted' && (
              <AcceptedCard
                active={active}
                isSeeker={role === 'seeker'}
                onReschedule={() => { setBooking(true); setMsg(''); }}
              />
            )}

            {!showPicker && active && active.status === 'proposed' && (
              <WaitingCard active={active} isSeeker={role === 'seeker'} cancel={cancelReschedule} cancelling={cancelling} />
            )}

            {showPicker && (
              <BookingCard
                date={date}
                setDate={setDate}
                time={time}
                setTime={setTime}
                notes={notes}
                setNotes={setNotes}
                isMine={isMine}
                blockedForSlot={blockedForSlot}
                slotLocked={slotLocked}
                today={nowLagos?.date}
                msg={msg}
                setMsg={setMsg}
                proposing={proposing}
                onSubmit={propose}
                rescheduling={!!active}
                onBack={() => { setBooking(false); setMsg(''); }}
              />
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function ExpiredNotice({ count }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-3xl p-6 flex items-start gap-4">
      <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
        <CalendarX2 className="w-5 h-5 text-red-700" />
      </div>
      <div>
        <h2 className="font-display font-bold text-secondary">Your previous time passed without approval</h2>
        <p className="text-sm text-secondary/70 mt-1">
          {count > 1
            ? `We couldn't confirm ${count} proposed times before they passed.`
            : "The admin couldn't confirm that time before it passed, so it was released."}{' '}
          Please set a new time below.
        </p>
      </div>
    </div>
  );
}

function AcceptedCard({ active, isSeeker, onReschedule }) {
  return (
    <div className="bg-white rounded-3xl border border-secondary/10 p-8 shadow-sm text-center">
      <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-5">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="font-display text-xl font-bold text-secondary">Your interview is confirmed</h2>
      <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold">
        <Clock className="w-4 h-4 text-primary" />
        {fmtLong(active)} · {active.proposedTime} WAT
      </div>
      <p className="text-secondary/60 text-sm mt-3">
        Join the call at your scheduled time. The admin will open the room — you'll see them once they connect.
        A reminder is sent to your email about an hour before.
      </p>
      <button
        onClick={() => window.open(`/call/${active.id}`, '_blank')}
        className="mt-6 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors"
      >
        <Video className="w-4 h-4" /> Join the video call
      </button>
      <div className="mt-4">
        <button
          onClick={onReschedule}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 rounded-xl transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Change this time
        </button>
      </div>
      <p className="text-xs text-secondary/50 mt-3">
        The call opens in a new tab. Make sure camera &amp; mic permissions are allowed.
      </p>
      {isSeeker && (
        <p className="text-xs text-secondary/40 mt-2">
          Your portfolio link is already shared with the admin — feel free to preview it in the meantime.
        </p>
      )}
    </div>
  );
}

function WaitingCard({ active, isSeeker, cancel, cancelling }) {
  return (
    <div className="bg-white rounded-3xl border border-secondary/10 p-8 shadow-sm text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-5">
        <Hourglass className="w-8 h-8 text-amber-600" />
      </div>
      <h2 className="font-display text-xl font-bold text-secondary">Waiting for admin confirmation</h2>
      <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold">
        <Clock className="w-4 h-4 text-primary" />
        {fmtLong(active)} · {active.proposedTime} WAT
      </div>
      <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
        <Timer className="w-3.5 h-3.5" /> This time is held for 3 hours — if it passes unapproved it will be released.
      </div>
      <p className="text-secondary/60 text-sm mt-3">
        We've emailed your proposed time to the admin. Once they accept, you'll be able to join the video call from this page.
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

function BookingCard({
  date, setDate, time, setTime, notes, setNotes,
  isMine, blockedForSlot, slotLocked, today, msg, setMsg, proposing, onSubmit, rescheduling, onBack,
}) {
  const freeCount = ALL_SLOTS.filter((t) => !slotLocked(t) && !blockedForSlot(t)).length;
  return (
    <form onSubmit={onSubmit} className="bg-white rounded-3xl border border-secondary/10 p-6 md:p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-display font-bold text-secondary">{rescheduling ? 'Change your interview time' : 'Pick a date &amp; time'}</h2>
          <p className="text-xs text-secondary/50">Calls happen on the platform — video + screen share included.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-secondary/5 text-xs text-secondary/70">
        <Clock className="w-3.5 h-3.5 text-primary" />
        All times are <strong>Nigeria time (WAT)</strong>. Each booking holds its slot for 3 hours — blocked slots below are already taken.
      </div>

      <label className="block text-sm font-semibold text-secondary mt-5 mb-1.5">Date</label>
      <input
        type="date"
        min={today}
        value={date}
        onChange={(e) => { setDate(e.target.value); setTime(''); setMsg(''); }}
        className={inputCls}
      />

      <label className="block text-sm font-semibold text-secondary mt-5 mb-1.5">Time <span className="text-secondary/40 font-normal">(WAT)</span></label>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {ALL_SLOTS.map((t) => {
          const past = slotLocked(t);
          const blocked = blockedForSlot(t);
          const mine = isMine(t);
          const selected = time === t;
          return (
            <button
              key={t}
              type="button"
              disabled={past || (blocked && !mine)}
              onClick={() => { setTime(t); setMsg(''); }}
              className={`relative py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                selected
                  ? 'bg-primary text-secondary border-primary shadow'
                  : mine && blocked
                    ? 'bg-green-50 border-green-300 text-green-700 cursor-pointer hover:bg-green-100'
                    : blocked
                      ? 'bg-secondary/5 border-secondary/10 text-secondary/30 line-through cursor-not-allowed'
                      : past
                        ? 'bg-secondary/5 border-secondary/10 text-secondary/30 cursor-not-allowed'
                        : 'bg-white border-secondary/10 text-secondary hover:border-primary hover:text-primary'
              }`}
            >
              {t}
              {mine && blocked && <span className="block text-[9px] font-bold uppercase tracking-wide">your call</span>}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-secondary/50 mt-2">
        {freeCount} free slot{freeCount === 1 ? '' : 's'} on this day. A slot is free when no other booking occupies the same 3-hour window.
      </p>

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
        type="submit"
        disabled={proposing || !time}
        className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {proposing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
        {rescheduling ? 'Save new time' : 'Propose this time'}
      </button>

      {rescheduling && (
        <button
          type="button"
          onClick={onBack}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-secondary/5 text-secondary text-sm font-semibold hover:bg-secondary/10 transition-colors"
        >
          Keep my current time
        </button>
      )}

      <p className="text-xs text-secondary/50 mt-4 text-center">
        {rescheduling
          ? 'Saving a new time replaces your current booking and asks the admin to approve it again.'
          : 'You can change it later — the admin only needs to approve once.'}
      </p>
    </form>
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
          <BrandBadge branding={branding} />
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