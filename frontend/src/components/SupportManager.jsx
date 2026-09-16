import { useEffect, useState } from 'react';
import {
  Headset,
  Loader2,
  Send,
  CheckCircle2,
  Archive,
  PencilLine,
  Bug,
  Search,
  AlertTriangle,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const STATUS_STYLES = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-secondary/5 text-secondary/60 border-secondary/15',
};

const ROLE_LABELS = { hub: 'Hub', seeker: 'Seeker', employer: 'Employer' };

const statusLabel = (s) => s.replace('_', ' ');

export default function SupportManager({ token }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async (openId = null) => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      if (filter && filter !== 'all') params.set('status', filter);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`${API_URL}/admin/support/tickets?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setTickets(d.tickets || []);
        if (openId) {
          const found = (d.tickets || []).find((t) => String(t.id) === String(openId));
          if (found) setSelected(found);
        } else if (selected) {
          const found = (d.tickets || []).find((t) => String(t.id) === String(selected.id));
          if (found) setSelected(found);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, q, token]);

  const openTicket = async (t) => {
    setSelected(t);
    setReply('');
    setMsg('');
    try {
      const res = await fetch(`${API_URL}/admin/support/tickets/${t.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        const updated = { ...d.ticket, user: t.user };
        setSelected(updated);
        const inList = tickets.some((x) => String(x.id) === String(updated.id));
        if (!inList) setTickets((prev) => [updated, ...prev]);
      }
    } catch {
      // ignore
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`${API_URL}/admin/support/tickets/${selected.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: reply }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d.message || 'Could not send reply.');
        return;
      }
      setReply('');
      setSelected({ ...selected, ...d.ticket });
      load(String(selected.id));
    } catch {
      setMsg('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status) => {
    if (!selected) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`${API_URL}/admin/support/tickets/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d.message || 'Could not update ticket.');
        return;
      }
      setSelected({ ...selected, ...d.ticket });
      load(String(selected.id));
    } catch {
      setMsg('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const counted = tickets.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <Headset className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg font-bold text-secondary">Support Tickets</h2>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tickets…"
            className="pl-9 pr-3 py-2 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {['all', 'open', 'in_progress', 'resolved', 'closed'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              filter === s
                ? 'bg-secondary text-white border-secondary'
                : 'bg-white text-secondary/70 border-secondary/10 hover:border-secondary/30'
            }`}
          >
            {s === 'all' ? 'All' : statusLabel(s)}
          </button>
        ))}
      </div>

      {msg && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
          <AlertTriangleIcon /> {msg}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 items-start">
        {/* Ticket list */}
        <div className="bg-white rounded-2xl border border-secondary/10 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-secondary/5 border-b border-secondary/10 text-sm font-bold text-secondary">
            Tickets {filter !== 'all' && <span className="text-secondary/40 font-medium">({counted})</span>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-secondary/5">
            {loading ? (
              <div className="p-8 grid place-items-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-center text-sm text-secondary/50">
                No tickets{filter !== 'all' ? ` with status “${statusLabel(filter)}”` : ''}.
              </div>
            ) : (
              tickets.map((t) => (
                <button
                  key={String(t.id)}
                  onClick={() => openTicket(t)}
                  className={`w-full text-left px-4 py-3.5 hover:bg-secondary/5 transition-colors ${
                    selected && String(selected.id) === String(t.id) ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLES[t.status] || STATUS_STYLES.open}`}>
                      {statusLabel(t.status)}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">{ROLE_LABELS[t.userRole] || t.userRole}</span>
                  </div>
                  <div className="font-semibold text-secondary text-sm truncate">{t.subject}</div>
                  <div className="text-xs text-secondary/50 truncate mt-0.5">
                    {t.user?.name} {t.user?.email ? `· ${t.user.email}` : ''}
                  </div>
                  <div className="text-[10px] text-secondary/40 mt-1">
                    {new Date(t.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {t.messageCount ?? t.messages?.length ?? 0} message{(t.messageCount ?? t.messages?.length ?? 0) !== 1 ? 's' : ''}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread view */}
        <div className="bg-white rounded-2xl border border-secondary/10 shadow-sm overflow-hidden">
          {!selected ? (
            <div className="p-10 text-center text-sm text-secondary/50">
              <Headset className="w-8 h-8 text-secondary/20 mx-auto mb-2" />
              Select a ticket to view the conversation.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-secondary/10 bg-secondary/5 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-secondary truncate">{selected.subject}</div>
                  <div className="text-[11px] text-secondary/50">
                    {selected.user?.name} · {selected.user?.email} · {ROLE_LABELS[selected.userRole] || selected.userRole}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setStatus('open')}
                    disabled={busy || selected.status === 'open'}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 transition-colors"
                    title="Mark open"
                  >
                    <Bug className="w-3 h-3" /> Open
                  </button>
                  <button
                    onClick={() => setStatus('in_progress')}
                    disabled={busy || selected.status === 'in_progress'}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 transition-colors"
                    title="Mark in progress"
                  >
                    <PencilLine className="w-3 h-3" /> In progress
                  </button>
                  <button
                    onClick={() => setStatus('resolved')}
                    disabled={busy || selected.status === 'resolved'}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                    title="Mark resolved"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Resolved
                  </button>
                  <button
                    onClick={() => setStatus('closed')}
                    disabled={busy || selected.status === 'closed'}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-secondary/15 text-secondary/70 bg-secondary/5 hover:bg-secondary/10 disabled:opacity-40 transition-colors"
                    title="Close ticket"
                  >
                    <Archive className="w-3 h-3" /> Close
                  </button>
                </div>
              </div>

              <div className="max-h-[46vh] overflow-y-auto bg-secondary/[0.03] p-4 space-y-3">
                {(selected.messages || []).length === 0 && (
                  <p className="text-center text-xs text-secondary/40 py-6">No messages yet.</p>
                )}
                {(selected.messages || []).map((m, i) => (
                  <div key={i} className={`flex ${m.from === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        m.from === 'user'
                          ? 'bg-white border border-secondary/10 text-secondary shadow-sm'
                          : 'bg-primary text-secondary shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                          {m.from === 'user' ? ROLE_LABELS[selected.userRole] || 'User' : 'Admin'}
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

              <form
                onSubmit={(e) => { e.preventDefault(); sendReply(); }}
                className="p-4 border-t border-secondary/10 bg-white"
              >
                <div className="flex gap-2">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    maxLength={4000}
                    placeholder="Reply to this user…"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-secondary/5 border border-secondary/10 focus:border-primary focus:outline-none text-sm"
                  />
                  <button
                    type="submit"
                    disabled={busy || !reply.trim()}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-secondary text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Reply
                  </button>
                </div>
                <p className="text-[11px] text-secondary/40 mt-2">
                  The talent, hub or employer gets a notification as soon as you reply.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AlertTriangleIcon() {
  return <AlertTriangle className="w-3.5 h-3.5 shrink-0" />;
}