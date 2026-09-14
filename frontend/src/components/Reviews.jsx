import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Star, Quote, Send, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useContent } from '../context/ContentContext.jsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Single approved review card
const ReviewCard = ({ review, index, inView }) => (
  <motion.figure
    initial={{ opacity: 0, y: 30 }}
    animate={inView ? { opacity: 1, y: 0 } : {}}
    transition={{ duration: 0.5, delay: index * 0.1 }}
    className="glass rounded-3xl p-8 flex flex-col gap-5 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
  >
    <div className="flex items-center justify-between">
      <Quote className="w-7 h-7 text-primary" />
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${i < review.rating ? 'fill-primary text-primary' : 'text-secondary/20'}`}
            aria-hidden
          />
        ))}
      </div>
    </div>

    <blockquote className="text-secondary/85 leading-relaxed flex-1">
      &ldquo;{review.message}&rdquo;
    </blockquote>

    <figcaption className="flex items-center gap-4 pt-4 border-t border-secondary/10">
      <div className="w-12 h-12 rounded-full ring-2 ring-primary/60 bg-primary/20 flex items-center justify-center font-display font-bold text-secondary">
        {(review.name || '?').charAt(0).toUpperCase()}
      </div>
      <div>
        <div className="font-display font-bold text-secondary">{review.name}</div>
        {review.role && <div className="text-sm text-secondary/60">{review.role}</div>}
      </div>
    </figcaption>
  </motion.figure>
);

// Star picker for the submit form
function StarPicker({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className="transition-transform hover:scale-110"
        >
          <Star className={`w-6 h-6 ${n <= value ? 'fill-primary text-primary' : 'text-secondary/25'}`} />
        </button>
      ))}
    </div>
  );
}

export default function Reviews() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });
  const { content } = useContent();
  const heading = content.reviewsHeading || {};

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formOk, setFormOk] = useState('');

  const loadReviews = () => {
    fetch(`${API_URL}/reviews`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setReviews(d.reviews || []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormOk('');
    if (!name.trim() || !message.trim()) {
      setFormError('Please fill in your name and review.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, rating, role, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.message || 'Could not submit your review.');
        return;
      }
      setFormOk('Thanks! Your review has been submitted and is awaiting approval.');
      setName('');
      setRole('');
      setMessage('');
      setRating(5);
      loadReviews();
    } catch {
      setFormError('Could not connect to server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formInputCls =
    'w-full px-4 py-3 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all';

  return (
    <section id="reviews" className="section-padding bg-secondary/[0.03]">
      <div className="container-x">
        <div ref={ref} className="max-w-3xl mx-auto text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="inline-block text-xs font-bold tracking-widest text-secondary/60 uppercase mb-3"
          >
            {heading.eyebrow || 'Visitor Reviews'}
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-secondary"
          >
            {heading.title || 'What people are '}
            <span className="text-gradient-gold">{heading.titleHighlight || 'saying'}</span>
            {heading.titleSuffix || ' about us.'}
          </motion.h2>
          {heading.body && (
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-4 text-lg text-secondary/70"
            >
              {heading.body}
            </motion.p>
          )}
        </div>

        <div className="grid lg:grid-cols-[1fr_420px] gap-10 items-start">
          {/* Approved reviews */}
          <div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-secondary/50">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-16 text-secondary/50">
                No reviews yet — be the first to leave one!
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {reviews.map((r, i) => (
                  <ReviewCard key={r._id} review={r} index={i} inView={inView} />
                ))}
              </div>
            )}
          </div>

          {/* Submit form */}
          <div className="glass rounded-3xl p-8 md:sticky md:top-24">
            <h3 className="font-display text-xl font-bold text-secondary mb-1">
              Leave a review
            </h3>
            <p className="text-sm text-secondary/60 mb-6">
              Tell others about your experience. Reviews are shown after
              approval.
            </p>

            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-secondary">Your rating</span>
                <StarPicker value={rating} onChange={setRating} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-secondary mb-2">Name</label>
                <input
                  className={formInputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-secondary mb-2">
                  Role / company (optional)
                </label>
                <input
                  className={formInputCls}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Head of People, Acme"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-secondary mb-2">Review</label>
                <textarea
                  className={`${formInputCls} resize-none`}
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Share your experience…"
                  maxLength={1000}
                />
              </div>

              {formError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              {formOk && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{formOk}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full justify-center disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit Review
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}