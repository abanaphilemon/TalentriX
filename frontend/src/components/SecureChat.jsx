import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Lock,
  X,
  Loader2,
  Send,
  MessagesSquare,
  ShieldCheck,
  ChevronLeft,
} from 'lucide-react';
import { ensureKeys, decryptMessage, encryptMessage, formatWhen } from '../lib/e2e.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const inputCls =
  'w-full px-4 py-2.5 rounded-2xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';

export async function fetchUnreadCount(token) {
  try {
    const res = await fetch(`${API_URL}/chat/unread`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const d = await res.json();
      return d.count || 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

const initials = (name = '') =>
  name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export default function SecureChat({ open, onClose, seedId }) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tbai.token') : null;
  const [session, setSession] = useState(0);
  const [jwk, setJwk] = useState(null);
  const [me, setMe] = useState(null);
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null); // {partner, messages[]}
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lf, setLf] = useState({ email: '', password: '', role: 'employer' });
  const [lfBusy, setLfBusy] = useState(false);
  const [lfError, setLfError] = useState('');
  const scrollRef = useRef(null);
  const seedRef = useRef(seedId);
  // seedId is read through a ref so async boot/poll closures always see the
  // latest requested chat even though SecureChat stays mounted across calls.
  useEffect(() => {
    if (seedId && seedRef.current !== seedId) seedRef.current = seedId;
  }, [seedId]);

  const jwkRef = useRef(null);
  const meRef = useRef(null);

  const doLogin = async () => {
    if (!lf.email || !lf.password) return;
    setLfBusy(true);
    setLfError('');
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lf.email, password: lf.password, role: lf.role }),
      });
      const d = await res.json();
      if (!res.ok) {
        setLfError(d.message || 'Login failed');
        return;
      }
      localStorage.setItem('tbai.token', d.token);
      localStorage.setItem('tbai.role', d.user.role);
      ensureKeys(d.token).catch(() => {});
      setSession((s) => s + 1);
    } catch {
      setLfError('Could not connect to the server.');
    } finally {
      setLfBusy(false);
    }
  };

  const loadThreads = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/chat/threads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setThreads((prev) => (prev === d.threads ? prev : d.threads || []));
      }
    } catch {
      // ignore
    }
  }, [token]);

  const readThread = useCallback(
async (partnerId, showBusy) => {
      if (!token || !jwkRef.current || !meRef.current) return;
      if (showBusy) setBusy(true);
      const me = meRef.current;
      const jwk = jwkRef.current;
      try {
        const res = await fetch(`${API_URL}/chat/thread/${partnerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          if (showBusy) setError(d.message || 'Could not open this chat.');
          return;
        }
        const d = await res.json();
        const peerKey = d.partner?.pubkey;
        const msgs = [];
        for (const m of d.messages || []) {
          let text = '';
          let sealed = false;
          if (jwk && peerKey) {
            try {
              text = await decryptMessage(jwk, peerKey, m.iv, m.ct);
            } catch {
              sealed = true;
            }
          } else {
            sealed = true;
          }
          msgs.push({
            id: m.id,
            mine: String(m.from) === String(me.id),
            text,
            sealed,
            when: m.createdAt,
          });
        }
        setActive({ partner: d.partner, messages: msgs });
        if (seedRef.current === partnerId) seedRef.current = null;
        await loadThreads();
      } catch {
        if (showBusy) setError('Could not connect to the chat server.');
      } finally {
        setBusy(false);
      }
    },
    [token, jwk, me, loadThreads]
  );

  // Bootstrap on open: load this user + keys, then threads, then the seed chat.
  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;

    const boot = async () => {
      setError('');
      setActive(null);
      const keys = await ensureKeys(token);
      if (cancelled) return;
      jwkRef.current = keys.jwk;
      setJwk(keys.jwk);

      try {
        const res = await fetch(`${API_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          if (cancelled) return;
          meRef.current = d.profile;
          setMe(d.profile);
        }
      } catch {
        // ignore
      }

      await loadThreads();
      if (cancelled) return;
      if (seedRef.current) {
        await readThread(seedRef.current, true);
      }
    };
    boot();

    const poll = setInterval(async () => {
      if (cancelled) return;
      await loadThreads();
      if (seedRef.current) {
        await readThread(seedRef.current, true);
      } else if (activeRef.current) {
        await readThread(activeRef.current.partner.id, false);
      }
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, session]);

  const activeRef = useRef(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [active?.messages, active?.partner?.id]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !active?.partner?.pubkey || !jwk) return;
    setSending(true);
    setError('');
    try {
      const { iv, ct } = await encryptMessage(jwk, active.partner.pubkey, text);
      const res = await fetch(`${API_URL}/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: active.partner.id, iv, ct }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message || 'Could not send this message.');
        return;
      }
      setActive((a) => ({
        ...a,
        messages: [...a.messages, { id: `tmp-${Date.now()}`, mine: true, text, sealed: false, when: new Date().toISOString() }],
      }));
      setInput('');
      loadThreads();
    } catch {
      setError('Could not encrypt or send this message.');
    } finally {
      setSending(false);
    }
  };

  const openThread = (id) => readThread(id, true);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6 bg-secondary/70 backdrop-blur-sm">
      <div className="bg-[#faf9f6] rounded-3xl w-full max-w-4xl h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-pop-in">
        {/* Header */}
        <div className="bg-secondary text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Lock className="w-4 h-4 text-secondary" />
            </div>
            <div>
              <h3 className="font-display font-bold">Secure messages</h3>
              <p className="text-[11px] text-white/60 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-primary" /> Messages are encrypted and private
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="Close chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!token ? (
          <div className="flex-1 grid place-items-center p-8 text-center overflow-y-auto">
            <div className="max-w-sm w-full">
              <MessagesSquare className="w-10 h-10 text-primary mx-auto mb-4" />
              <p className="font-display text-lg font-bold text-secondary">Log in to start a secure chat</p>
              <p className="text-sm text-secondary/60 mt-2 mb-6">
                Employers can message a job seeker securely — right here.
              </p>
              <div className="bg-white border border-secondary/10 rounded-2xl p-5 shadow-sm text-left">
                <label className="block text-xs font-bold uppercase tracking-widest text-secondary/50 mb-2">Log in as</label>
                <div className="grid grid-cols-2 gap-1 bg-secondary/5 p-1 rounded-xl mb-4">
                  {['employer', 'seeker'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setLf((f) => ({ ...f, role: r }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${
                        lf.role === r ? 'bg-primary text-secondary shadow' : 'text-secondary/60 hover:text-secondary'
                      }`}
                    >
                      {r === 'employer' ? 'Employer' : 'Job seeker'}
                    </button>
                  ))}
                </div>
                <label className="block text-xs font-semibold text-secondary mb-1">Email</label>
                <input
                  className={inputCls + ' mb-3'}
                  placeholder="you@company.com"
                  value={lf.email}
                  onChange={(e) => setLf((f) => ({ ...f, email: e.target.value }))}
                />
                <label className="block text-xs font-semibold text-secondary mb-1">Password</label>
                <input
                  type="password"
                  className={inputCls + ' mb-4'}
                  placeholder="••••••••"
                  value={lf.password}
                  onChange={(e) => setLf((f) => ({ ...f, password: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && doLogin()}
                />
                <button
                  onClick={doLogin}
                  disabled={lfBusy || !lf.email || !lf.password}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {lfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Log in & open secure chat
                </button>
                {lfError && <p className="text-xs text-amber-700 mt-2 text-center">{lfError}</p>}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row min-h-0">
            {/* Thread list */}
            {!active && (
              <div className="md:w-72 md:border-r border-secondary/10 md:min-h-0 md:overflow-y-auto flex flex-col">
                <div className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-secondary/50">Conversations</div>
                {threads.length === 0 ? (
                  <div className="px-4 pb-6 text-sm text-secondary/50">
                    <p>No conversations yet.</p>
                    <p className="mt-2 text-xs text-secondary/40">
                      {me?.role === 'employer'
                        ? 'Open a job seeker\u2019s portfolio and tap “Hire me” to start a secure chat.'
                        : 'When an employer contacts you, their message will appear here.'}
                    </p>
                  </div>
                ) : (
                  threads.map((t) => (
                    <button
                      key={t.partner.id}
                      onClick={() => openThread(t.partner.id)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/5 transition-colors text-left border-b border-secondary/5"
                    >
                      {t.partner.logo ? (
                        <img src={t.partner.logo} alt="" className="w-10 h-10 rounded-full object-contain bg-white ring-1 ring-secondary/10" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                          <span className="font-display font-bold text-secondary text-sm">{initials(t.partner.name)}</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-secondary text-sm truncate">{t.partner.name}</span>
                          <span className="text-[10px] text-secondary/40 shrink-0">{formatWhen(t.lastAt)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="text-xs text-secondary/50 truncate">
                            {t.partner.company || t.partner.title || t.partner.role}
                          </span>
                          {t.unread > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-secondary text-[10px] font-bold grid place-items-center shrink-0">
                              {t.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Conversation */}
            <div className="flex-1 flex flex-col min-h-0">
              {!active ? (
                <div className="flex-1 grid place-items-center p-8 text-center">
                  <div>
                    <MessagesSquare className="w-10 h-10 text-primary mx-auto mb-3" />
                    <p className="font-display font-bold text-secondary">Pick a conversation</p>
                    <p className="text-sm text-secondary/50 mt-1">All chats are end-to-end encrypted.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* conversation header */}
                  <div className="px-5 py-3 bg-white border-b border-secondary/10 flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => setActive(null)}
                      className="md:hidden w-8 h-8 rounded-lg bg-secondary/5 hover:bg-secondary/10 flex items-center justify-center mr-1"
                      aria-label="Back to conversations"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {active.partner.logo ? (
                      <img src={active.partner.logo} alt="" className="w-9 h-9 rounded-full object-contain bg-white ring-1 ring-secondary/10" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
                        <span className="font-display font-bold text-secondary text-xs">{initials(active.partner.name)}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-secondary text-sm truncate">{active.partner.name}</div>
                      <div className="text-[11px] text-secondary/50 truncate">
                        {active.partner.company || active.partner.title || active.partner.role}
                      </div>
                    </div>
                  </div>

                  {/* messages */}
                  <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {active.messages.length === 0 && (
                      <div className="text-center text-sm text-secondary/50 py-8">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
                          <ShieldCheck className="w-5 h-5 text-secondary" />
                        </div>
                        <p>Say hello to {active.partner.name.split(' ')[0]} to start this conversation.</p>
                      </div>
                    )}

                    {active.messages.map((m) =>
                      m.sealed ? (
                        <div
                          key={m.id}
                          className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-xs italic ${
                              m.mine ? 'bg-secondary text-white/60' : 'bg-white border border-secondary/10 text-secondary/40 shadow-sm'
                            }`}
                          >
                            <span className="inline-flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Encrypted message — security keys were refreshed.
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                              m.mine ? 'bg-primary text-secondary rounded-br-md' : 'bg-white text-secondary border border-secondary/10 rounded-bl-md'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                            <p className={`text-[10px] mt-1 ${m.mine ? 'text-secondary/50' : 'text-secondary/40'}`}>
                              {formatWhen(m.when)}
                            </p>
                          </div>
                        </div>
                      )
                    )}

                    {busy && (
                      <div className="flex justify-center py-2">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    )}
                  </div>

                  {/* composer */}
                  <div className="px-5 py-3 bg-white border-t border-secondary/10 shrink-0">
                    <div className="flex items-end gap-2">
                        <input
                          className={inputCls}
                          placeholder={`Secure message to ${active.partner.name.split(' ')[0]}…`}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              send();
                            }
                          }}
                          maxLength={4000}
                        />
                        <button
                          onClick={send}
                          disabled={sending || !input.trim()}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-secondary text-white text-sm font-semibold hover:bg-accent disabled:opacity-40 transition-colors"
                        >
                          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          Send
                        </button>
                      </div>
                    {error && <p className="text-xs text-amber-700 mt-2">{error}</p>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}