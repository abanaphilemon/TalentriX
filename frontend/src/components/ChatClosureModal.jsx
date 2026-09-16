import { useEffect, useState } from 'react';
import {
  X,
  UserCheck,
  Share2,
  Bell,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

// Multi-step "chat ended" flow for employers. Runs after they leave a chat or
// a chat goes idle for 48 hours: did they hire the talent, will they share the
// news, and — when not — a reason. If they agree to share, ready-made post
// templates are delivered to their notification bell.
export default function ChatClosureModal({ open, closure, busy, onSubmit, onDismiss }) {
  const [step, setStep] = useState('intro'); // intro → employed → post | reason → done
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && closure) {
      setStep('intro');
      setReason('');
      setErr('');
      setSubmitting(false);
    }
  }, [open, closure?.id, closure]);

  if (!open || !closure) return null;

  const name = closure.seeker?.name || 'this job seeker';
  const firstName = name.split(' ')[0];
  const withHub = !!closure.hub;
  const parties = withHub ? `you, ${closure.hub}, and ${name}` : `you and ${name}`;

  const submit = async (payload) => {
    setErr('');
    setSubmitting(true);
    try {
      await onSubmit(payload);
      setStep('done');
    } catch (e) {
      setErr(e.message || 'Could not save your answer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const goPost = (agree) => {
    if (agree) {
      submit({ employed: true, postAgreed: true, reason: '' });
    } else {
      setStep('post-reason');
    }
  };

  const submitReason = () => {
    if (!reason.trim()) {
      setErr("Please tell us a little about why this update can't be shared.");
      return;
    }
    submit({ employed: true, postAgreed: false, reason: reason.trim() });
  };

  const submitHiredNo = () => {
    if (!reason.trim()) {
      setErr('Please share a short reason so we can keep improving.');
      return;
    }
    submit({ employed: false, postAgreed: false, reason: reason.trim() });
  };

  const card = 'bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-pop-in';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-secondary/70 backdrop-blur-sm">
      <div className={card}>
        <div className="bg-secondary text-white px-6 py-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h3 className="font-display font-bold leading-tight">Your chat with {name} has ended</h3>
              <p className="text-white/60 text-xs mt-0.5">
                {closure.triggeredBy === 'leave'
                  ? 'You closed this conversation. The chat is locked and their contact details are hidden.'
                  : 'No messages were exchanged for 48 hours, so the chat was locked to protect everyone\u2019s contact details.'}
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {step === 'intro' && (
            <div>
              <h4 className="font-display text-lg font-bold text-secondary">We'd love to know how the story went</h4>
              <p className="text-sm text-secondary/60 mt-2 mb-6">
                Every connection on TalentriX deserves a good ending. Did you end up working with {firstName}?
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setStep('post')}
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <UserCheck className="w-4 h-4" /> Yes — we hired {firstName}
                </button>
                <button
                  onClick={() => setStep('hired-no')}
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary/5 text-secondary font-semibold hover:bg-secondary/10 disabled:opacity-50 transition-colors"
                >
                  No — the opportunity didn't come together
                </button>
              </div>
            </div>
          )}

          {step === 'hired-no' && (
            <div>
              <h4 className="font-display text-lg font-bold text-secondary">That's okay — help us understand</h4>
              <p className="text-sm text-secondary/60 mt-2 mb-4">
                Because no hire happened, we won't be posting a public update. Could you share a short reason why?
              </p>
              <textarea
                className="w-full px-4 py-3 rounded-2xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm resize-none"
                rows={4}
                maxLength={2000}
                placeholder="e.g. The role was closed before we could make an offer, and the search continues."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {err && <p className="text-xs text-amber-700 mt-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {err}</p>}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setReason(''); setErr(''); setStep('intro'); }}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-secondary/5 text-secondary font-semibold hover:bg-secondary/10 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={submitHiredNo}
                  disabled={submitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Submit
                </button>
              </div>
            </div>
          )}

          {step === 'post' && (
            <div>
              <h4 className="font-display text-lg font-bold text-secondary">Sharing the news is part of the match</h4>
              <p className="text-sm text-secondary/60 mt-2 mb-4">
                When a hire comes together on TalentriX, the celebration is part of the deal. This announcement will be
                shared by {parties} across your social channels — and it only takes a minute.
              </p>
              <div className="bg-primary/10 rounded-2xl p-4 mb-5 flex items-start gap-3">
                <Bell className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                <p className="text-xs text-secondary/80">
                  Agree now and you'll find ready-made captions and collaboration designs waiting in the notification
                  bell, ready to download and post on LinkedIn, Instagram, and X.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => goPost(true)}
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Yes — send me the templates
                </button>
                <button
                  onClick={() => goPost(false)}
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary/5 text-secondary font-semibold hover:bg-secondary/10 disabled:opacity-60 transition-colors"
                >
                  I can't share it right now
                </button>
              </div>
              {err && <p className="text-xs text-amber-700 mt-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {err}</p>}
            </div>
          )}

          {step === 'post-reason' && (
            <div>
              <h4 className="font-display text-lg font-bold text-secondary">Tell us what happened</h4>
              <p className="text-sm text-secondary/60 mt-2 mb-4">
                Public sharing is a must when a hire is confirmed. If something prevents it, let us know.
              </p>
              <textarea
                className="w-full px-4 py-3 rounded-2xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm resize-none"
                rows={4}
                maxLength={2000}
                placeholder="e.g. The announcement is pending an internal approval before it can be made public."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {err && <p className="text-xs text-amber-700 mt-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {err}</p>}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setReason(''); setErr(''); setStep('post'); }}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-secondary/5 text-secondary font-semibold hover:bg-secondary/10 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={submitReason}
                  disabled={submitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Submit
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h4 className="font-display text-lg font-bold text-secondary">Your post templates are ready</h4>
              <p className="text-sm text-secondary/60 mt-2">
                Open the notification bell in the top navigation. You'll find three ready-to-share templates —
                LinkedIn, Instagram, and X — each with a caption and a collaboration design to download and post on
                your social channels.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4 mb-5">
                {(withHub ? [name, closure.hub] : [name]).concat(['You']).map((p, i) => (
                  <span key={p + i} className="px-3 py-1 rounded-full bg-primary/10 text-secondary text-xs font-semibold">
                    {p}
                  </span>
                ))}
              </div>
              <button
                onClick={onDismiss}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-secondary font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                Done
              </button>
              {err && <p className="text-xs text-amber-700 mt-2 flex items-center justify-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {err}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}