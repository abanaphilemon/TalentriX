import { useEffect, useState } from 'react';
import {
  Headset,
  LifeBuoy,
  Loader2,
  Send,
  X,
  ChevronRight,
  Plus,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const CATEGORY_LABELS = {
  bug: 'Bug / technical issue',
  account: 'Account & login',
  payment: 'Payments & billing',
  chat: 'Secure chat',
  interview: 'Video interview',
  other: 'Something else',
};

const STATUS_STYLES = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-secondary/5 text-secondary/60 border-secondary/15',
};

function statusLabel(status) {
  return status.replace('_', ' ');
}

export default function SupportCenter({ token, userRole, open, onClose }) {
  const [view, setView] = useState('list'); // 'list' | 'create' | 'thread'
  const [tickets, setTickets] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(false);

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('other');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = async (showSpinner = false) => {
    if (!token) return;
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch(`${API_URL}/support/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setTickets(d.tickets || []);
      }
    } catch {
      // ignore
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setView('list');
      setActive(null);
      setError('');
      load(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token]);

  const openThread = async (t) => {
    // The list already carries the full thread; fetch to be safe.
    setActive(t);
    setView('thread');
    setError('');
    try {
      const res = await fetch(`${API_URL}/support/tickets/${t.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setActive(d.ticket);
      }
    } catch {
      // ignore
    }
  };

  const createTicket = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setError('Subject and message are required.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/support/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject, category, message }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.message || 'Could not open ticket. Try again.');
        return;
      }
      setSubject('');
      setCategory('other');
      setMessage('');
      setView('list');
      load();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSending(false);
    }
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/support/tickets/${active.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: reply }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.message || 'Could not send message.');
        return;
      }
      setActive(d.ticket);
      setReply('');
      load();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-secondary/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden animate-pop-in flex flex-col max-h-[88vh]">
        <div className="bg-secondary text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Headset className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h3 className="font-display font-bold">Help &amp; Support</h3>
              <p className="text-white/60 text-xs">Message the admin team — we usually reply within a day.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center"
            aria-label="Close support"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative flex-1 flex flex-col overflow-hidden">
          {error && (
            <div className="mx-5 mt-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              {error}
            </div>
          )}

          {/* List view */}
          {view === 'list' && (
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-display font-bold text-secondary">My tickets</h4>
                <button
                  onClick={() => { setView('create'); setError(''); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-secondary text-xs font-bold hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> New ticket
                </button>
              </div>

              {loading ? (
                <div className="py-12 grid place-items-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="py-12 text-center text-sm text-secondary/50">
                  <LifeBuoy className="w-10 h-10 text-secondary/20 mx-auto mb-2" />
                  No tickets yet. Something not working right? Open one and we'll sort it out.
                </div>
              ) : (
                <div className="space-y-2">
                  {tickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => openThread(t)}
                      className="w-full text-left bg-white rounded-2xl border border-secondary/10 p-4 hover:border-primary/40 hover:shadow-md transition-all flex items-center gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold uppercase tracking-wider text-primary">{CATEGORY_LABELS[t.category] || t.category}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLES[t.status] || STATUS_STYLES.open}`}>
                            {statusLabel(t.status)}
                          </span>
                        </div>
                        <h5 className="font-semibold text-secondary truncate mt-1">{t.subject}</h5>
                        <p className="text-xs text-secondary/50 mt-0.5">
                          Last update {new Date(t.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-secondary/40 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Create view */}
          {view === 'create' && (
            <form onSubmit={createTicket} className="flex-1 overflow-y-auto p-5">
              <button
                onClick={() => setView('list')}
                className="mb-4 text-xs font-semibold text-secondary/50 hover:text-secondary transition-colors"
              >
                ← Back to my tickets
              </button>

              <h4 className="font-display font-bold text-secondary mb-4">Open a new ticket</h4>

              <label className="block text-xs font-semibold text-secondary/70 mb-1">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                placeholder="Briefly, what's wrong?"
                className="w-full px-4 py-3 rounded-xl bg-secondary/5 border border-secondary/10 focus:border-primary/60 focus:outline-none text-secondary text-sm mb-4"
              />

              <label className="block text-xs font-semibold text-secondary/70 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-secondary/5 border border-secondary/10 focus:border-primary/60 focus:outline-none text-secondary text-sm mb-4"
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>

              <label className="block text-xs font-semibold text-secondary/70 mb-1">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={4000}
                rows={5}
                placeholder="Describe the issue so we can help quickly..."
                className="w-full px-4 py-3 rounded-xl bg-secondary/5 border border-secondary/10 focus:border-primary/60 focus:outline-none text-secondary text-sm mb-5 resize-none"
              />

              <button
                type="submit"
                disabled={sending}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit ticket
              </button>
            </form>
          )}

          {/* Thread view */}
          {view === 'thread' && active && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-5 py-3 border-b border-secondary/10 flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setView('list')}
                  className="text-xs font-semibold text-secondary/50 hover:text-secondary transition-colors"
                >
                  ← Back
                </button>
                <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLES[active.status] || STATUS_STYLES.open}`}>
                  {statusLabel(active.status)}
                </span>
                <span className="text-xs text-secondary/40 font-medium truncate">{active.subject}</span>
              </div>

              <div className="flex-1 overflow-y-auto bg-secondary/[0.03] p-5 space-y-4">
                {(active.messages || []).length === 0 && (
                  <p className="text-center text-xs text-secondary/40 py-8">No messages yet.</p>
                )}
                {(active.messages || []).map((m, i) => (
                  <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        m.from === 'user'
                          ? 'bg-primary text-secondary shadow-sm'
                          : 'bg-white border border-secondary/10 text-secondary shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                          {m.from === 'user' ? (userRole || 'You') : 'Support'}
                        </span>
                        <span className="text-[10px] opacity-40">
                          {new Date(m.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="whitespace-pre-line">{m.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={sendReply} className="p-4 border-t border-secondary/10 bg-white shrink-0">
                {active.status === 'closed' ? (
                  <p className="text-xs text-secondary/50 text-center">This ticket is closed. Open a new ticket if you need further help.</p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      maxLength={4000}
                      placeholder="Write a message..."
                      className="flex-1 px-4 py-2.5 rounded-xl bg-secondary/5 border border-secondary/10 focus:border-primary/60 focus:outline-none text-secondary text-sm"
                    />
                    <button
                      type="submit"
                      disabled={sending || !reply.trim()}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-secondary text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}