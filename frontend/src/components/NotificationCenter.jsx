import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Copy, Download, Loader2, X, Award, CreditCard, FileText, MessageSquare } from 'lucide-react';
import { isStandalone } from '../lib/push.js';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Distinct icon per notification type so receipts and hire notices stand out.
const NOTIF_ICONS = {
  payment_receipt: CreditCard,
  hired: Award,
  chat_start: MessageSquare,
  post_templates: FileText,
};

// Scale an injected inline SVG to fill its container (the design is authored at
// a fixed 1080×1080 size so it also downloads cleanly as a PNG).
function SvgScaler({ html }) {
  const ref = useRef(null);
  useEffect(() => {
    const svg = ref.current?.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', 'auto');
      svg.style.width = '100%';
      svg.style.height = 'auto';
    }
  }, [html]);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

function downloadPng(svg, filename) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    canvas.getContext('2d').drawImage(img, 0, 0, 1080, 1080);
    URL.revokeObjectURL(url);
    canvas.toBlob((png) => {
      if (!png) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(png);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

export default function NotificationCenter({ token }) {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const panelRef = useRef(null);
  const seenIds = useRef(new Set());

  const load = async (showSpinner = false) => {
    if (!token) return;
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch(`${API_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        const list = d.notifications || [];
        setNotifs(list);
        setUnread(list.filter((n) => !n.read).length);

        // Inside the installed (standalone) app, newly-arrived unread notices
        // pop up even before the server push lands — belt & braces for phones.
        const fresh = list.filter((n) => !n.read && !seenIds.current.has(n._id));
        for (const n of fresh) seenIds.current.add(n._id);
        if (
          fresh.length &&
          isStandalone() &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          for (const n of fresh.slice(0, 3)) {
            try {
              new Notification(n.title || 'TalentriX', {
                body: n.body || '',
                icon: '/icons/icon-192.png',
                tag: `talentrix-${n._id}`,
              });
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
    const iv = setInterval(() => load(false), 45000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Close the panel on outside clicks.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setCopied(null);
      try {
        await fetch(`${API_URL}/notifications/read-all`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        setUnread(0);
      } catch {
        // ignore
      }
      load();
    }
  };

  const copyCaption = async (id, caption) => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = caption;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(id); } catch { /* ignore */ }
      document.body.removeChild(ta);
      setTimeout(() => setCopied(null), 1800);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggle}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg bg-secondary/5 hover:bg-secondary/10 transition-colors"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4 text-secondary" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-[min(92vw,420px)] max-h-[70vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-secondary/10 overflow-hidden z-[95]">
          <div className="px-4 py-3 bg-secondary text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="font-display font-bold text-sm">Notifications</span>
            </div>
            <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center" aria-label="Close notifications">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 grid place-items-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : notifs.length === 0 ? (
              <div className="p-8 text-center text-sm text-secondary/50">
                <Bell className="w-8 h-8 text-secondary/20 mx-auto mb-2" />
                You're all caught up.
              </div>
            ) : (
              notifs.map((n) => {
                const Icon = NOTIF_ICONS[n.type] || Check;
                return (
                <div key={n._id} className="px-4 py-4 border-b border-secondary/5">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-secondary" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-secondary text-sm">{n.title}</h4>
                      {n.body && <p className="text-xs text-secondary/60 mt-0.5">{n.body}</p>}
                    </div>
                  </div>

                  {n.type === 'post_templates' && (n.payload?.templates || []).map((t, idx) => (
                    <div key={idx} className="mt-4 border border-secondary/10 rounded-2xl overflow-hidden">
                      <div className="px-3 py-2 bg-secondary/5 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-secondary/70">{t.platform}</span>
                        <span className="text-[10px] text-secondary/40 font-medium">Caption + design</span>
                      </div>

                      <div className="aspect-square bg-secondary/5">
                        <SvgScaler html={t.svg} />
                      </div>

                      <div className="p-3">
                        <button
                          onClick={() => copyCaption(idx, t.caption)}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/5 text-secondary text-xs font-semibold hover:bg-secondary/10 transition-colors"
                        >
                          {copied === idx ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied === idx ? 'Caption copied!' : 'Copy caption'}
                        </button>
                        <button
                          onClick={() => downloadPng(t.svg, `${n.payload?.seekerName || 'talent'}-${t.platform.toLowerCase().replace(/[^a-z]/g, '')}.png`)}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-secondary text-xs font-bold hover:bg-primary/90 transition-colors mt-2"
                        >
                          <Download className="w-3.5 h-3.5" /> Download design
                        </button>
                      </div>

                      <details className="px-3 pb-3">
                        <summary className="cursor-pointer text-[11px] text-secondary/50 font-semibold hover:text-secondary">Preview caption</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-secondary/80 bg-secondary/5 rounded-xl p-3 font-sans">{t.caption}</pre>
                      </details>
                    </div>
                  ))}
                </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}