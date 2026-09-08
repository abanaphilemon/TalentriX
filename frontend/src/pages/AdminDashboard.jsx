import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  Save,
  RotateCcw,
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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useContent } from '../context/ContentContext.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const ADMIN_TOKEN_KEY = 'tbai.adminToken';

// Sections of the CMS
const SECTIONS = [
  { id: 'reviews', label: 'Reviews', special: 'reviews' },
  { id: 'hero', label: 'Hero' },
  { id: 'heroStats', label: 'Hero Stats' },
  { id: 'navLinks', label: 'Navigation' },
  { id: 'about', label: 'About' },
  { id: 'features', label: 'About Features' },
  { id: 'cta', label: 'CTA Banner' },
  { id: 'testimonials', label: 'Testimonials' },
  { id: 'testimonialsHeading', label: 'Testimonials Heading' },
  { id: 'reviewsHeading', label: 'Reviews Heading' },
  { id: 'partnersHeading', label: 'Partners Heading' },
  { id: 'collaborators', label: 'Partners' },
  { id: 'footer', label: 'Footer' },
  { id: 'contactInfo', label: 'Contact Info' },
  { id: 'contactHeading', label: 'Contact Heading' },
];

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';

const textCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm resize-none';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { adminUser: user, adminRole: role, adminSignOut } = useAuth();
  const { content, refresh } = useContent();

  const [section, setSection] = useState('hero');
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);

  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');

  const token = localStorage.getItem(ADMIN_TOKEN_KEY);

  const loadReviews = async () => {
    setReviewsLoading(true);
    setReviewsError('');
    try {
      const res = await fetch(`${API_URL}/admin/reviews`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load reviews');
      setReviews(data.reviews || []);
    } catch (e) {
      setReviewsError(e.message || 'Could not load reviews.');
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    if (section === 'reviews') loadReviews();
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setReviewsError(e.message || 'Could not update review.');
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
    } catch (e) {
      setReviewsError(e.message || 'Could not delete review.');
    }
  };

  // Load current section data into the form whenever section changes or content updates
  useEffect(() => {
    if (content[section] !== undefined) {
      setForm(JSON.parse(JSON.stringify(content[section])));
    } else {
      setForm({});
    }
  }, [section, content]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Array helpers for list-type sections
  const updateListItem = (index, field, val) => {
    setForm((f) => {
      const arr = [...(f || [])];
      arr[index] = { ...arr[index], [field]: val };
      return arr;
    });
  };
  const addListItem = () => {
    setForm((f) => [...(f || []), {}]);
  };
  const removeListItem = (index) => {
    setForm((f) => (f || []).filter((_, i) => i !== index));
  };
  const isArraySection = ['heroStats', 'navLinks', 'features', 'testimonials', 'collaborators'].includes(section);

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const res = await fetch(`${API_URL}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [section]: form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to save');
        return;
      }
      await refresh();
      setSaved('Saved. Refresh the home page to see changes.');
      setTimeout(() => setSaved(''), 3000);
    } catch {
      setError('Could not connect to server.');
    } finally {
      setSaving(false);
    }
  };

  const resetSection = async () => {
    setResetting(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/content/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to reset');
        return;
      }
      await refresh();
      setSaved('Content reset to defaults.');
      setTimeout(() => setSaved(''), 3000);
    } catch {
      setError('Could not connect to server.');
    } finally {
      setResetting(false);
    }
  };

  // Section field metadata for rendering simple text fields
  const fieldLabels = {
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
    quote: 'Quote',
    role: 'Role / title',
    avatar: 'Avatar URL',
    label: 'Label',
    href: 'Href',
    value: 'Value',
  };

  const renderTextInput = (key, val, isLong = false) => (
    <div key={key}>
      <label className="block text-xs font-semibold text-secondary/70 mb-1.5">
        {fieldLabels[key] || key}
      </label>
      {isLong ? (
        <textarea rows={4} className={textCls} value={val || ''} onChange={(e) => set(key, e.target.value)} />
      ) : (
        <input className={inputCls} value={val || ''} onChange={(e) => set(key, e.target.value)} />
      )}
    </div>
  );

  const renderObjectFields = (obj) =>
    Object.keys(obj || {}).map((key) =>
      typeof obj[key] === 'string'
        ? renderTextInput(key, obj[key], ['body', 'subtitle', 'brandTagline', 'newsletterBlurb', 'quote', 'officeHours'].includes(key))
        : null
    );

  const renderArraySection = () => {
    const fields =
      section === 'heroStats'
        ? ['value', 'label']
        : section === 'navLinks'
        ? ['label', 'href']
        : section === 'features'
        ? ['title', 'desc']
        : section === 'testimonials'
        ? ['quote', 'name', 'role', 'avatar']
        : ['name', 'logo'];

    return (
      <div className="space-y-4">
        {(form || []).map((item, i) => (
          <div key={i} className="border border-secondary/10 rounded-xl p-4 bg-secondary/[0.02] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-secondary/50">
                Item {i + 1}
              </span>
              <button
                onClick={() => removeListItem(i)}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            </div>
            {fields.map((f) => (
              <div key={f}>
                <label className="block text-xs font-semibold text-secondary/70 mb-1.5">
                  {fieldLabels[f] || f}
                </label>
                {f === 'quote' || f === 'desc' ? (
                  <textarea rows={3} className={textCls} value={item[f] || ''} onChange={(e) => updateListItem(i, f, e.target.value)} />
                ) : (
                  <input className={inputCls} value={item[f] || ''} onChange={(e) => updateListItem(i, f, e.target.value)} />
                )}
              </div>
            ))}
          </div>
        ))}
        <button
          onClick={addListItem}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/5 text-secondary font-semibold text-sm hover:bg-secondary/10 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add item
        </button>
      </div>
    );
  };

  if (role !== 'admin' || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-hero-gradient">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <h1 className="font-display text-xl font-bold text-secondary">Admin access only</h1>
          <p className="text-sm text-secondary/60 mt-2">
            Please sign in with an admin account.
          </p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="mt-6 btn-primary w-full justify-center"
          >
            Go to home
          </button>
        </div>
      </div>
    );
  }

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
        <h1 className="font-display text-2xl md:text-3xl font-bold text-secondary mb-1">
          Website Content
        </h1>
        <p className="text-secondary/60 text-sm mb-6">
          Edit landing-page content. Changes are saved to the database.
        </p>

        <div className="grid md:grid-cols-[220px_1fr] gap-8">
          {/* Section nav */}
          <aside className="md:sticky md:top-24 self-start">
            <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap text-left transition-colors ${
                    section === s.id
                      ? 'bg-primary text-secondary shadow'
                      : 'text-secondary/60 hover:text-secondary hover:bg-secondary/5'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </nav>
          </aside>

          {/* Editor */}
          <div className="bg-white rounded-2xl border border-secondary/10 p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-bold text-secondary">
                {SECTIONS.find((s) => s.id === section)?.label}
              </h2>
              {section !== 'reviews' && (
                <div className="flex gap-2">
                  <button
                    onClick={resetSection}
                    disabled={resetting}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/5 text-secondary text-sm font-semibold hover:bg-secondary/10 transition-colors disabled:opacity-60"
                  >
                    {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    Reset
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-secondary text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </div>
            )}
            {saved && (
              <div className="mb-5 flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> {saved}
              </div>
            )}

            {reviewsError && (
              <div className="mb-5 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {reviewsError}
              </div>
            )}

            {section === 'reviews' ? (
              <div>
                {reviewsLoading ? (
                  <div className="flex items-center justify-center py-16 text-secondary/50">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-secondary/50 gap-3">
                    <MessageSquare className="w-8 h-8" />
                    <span>No reviews yet. Submissions from the landing page will appear here.</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((r) => (
                      <div
                        key={r._id}
                        className={`border rounded-xl p-5 space-y-3 ${
                          r.approved
                            ? 'border-green-200 bg-green-50/40'
                            : 'border-amber-200 bg-amber-50/40'
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
                                  <Star
                                    key={i}
                                    className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-primary text-primary' : 'text-secondary/20'}`}
                                  />
                                ))}
                              </div>
                              <span
                                className={`ml-2 text-xs font-semibold ${
                                  r.approved ? 'text-green-700' : 'text-amber-700'
                                }`}
                              >
                                {r.approved ? 'Approved · showing' : 'Pending approval'}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => setReviewApproved(r._id, !r.approved)}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                r.approved
                                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                  : 'bg-green-100 text-green-800 hover:bg-green-200'
                              }`}
                            >
                              {r.approved ? <ThumbsDown className="w-3.5 h-3.5" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                              {r.approved ? 'Unapprove' : 'Approve'}
                            </button>
                            <button
                              onClick={() => deleteReview(r._id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </div>
                        </div>
                        <p className="text-secondary/85 text-sm leading-relaxed">
                          &ldquo;{r.message}&rdquo;
                        </p>
                        <div className="text-xs text-secondary/50">
                          Submitted {new Date(r.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : isArraySection ? (
              renderArraySection()
            ) : (
              <div className="grid gap-4">{renderObjectFields(form)}</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
