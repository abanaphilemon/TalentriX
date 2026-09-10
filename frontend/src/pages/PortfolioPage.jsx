import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Loader2,
  MapPin,
  Link as LinkIcon,
  FileText,
  ExternalLink,
  ArrowLeft,
  Mail,
  Phone,
  Github,
  Globe,
  Briefcase,
  GraduationCap,
  Award,
  FolderGit2,
  Languages,
  Sparkles,
  CheckCircle2,
  Calendar,
  Clock,
  Star,
  BadgeCheck,
  Lock,
  MessageSquare,
} from 'lucide-react';
import { useContent } from '../context/ContentContext.jsx';
import SecureChat from '../components/SecureChat.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const avatarFor = (name = '') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Seeker')}&background=F5E1A8&color=141E2E&size=128`;

const toUrl = (v) => (v && v.startsWith('http') ? v : `https://${v}`);

const yearsOfExperience = (exp) =>
  (exp || []).reduce((acc, e) => {
    const s = parseInt((e.start || '').match(/\d{4}/)?.[0], 10) || 0;
    const en = e.current
      ? new Date().getFullYear()
      : parseInt((e.end || '').match(/\d{4}/)?.[0], 10) || 0;
    return acc + (en > s && s > 0 ? en - s : 0);
  }, 0);

const period = (e) => {
  const s = e.start || '';
  const en = e.current ? 'Present' : e.end || '';
  if (!s && !en) return null;
  return `${s || '…'} — ${en || '…'}`;
};

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-secondary text-primary flex items-center justify-center shadow-md">
        <Icon className="w-5 h-5" />
      </div>
      <h2 className="font-display text-xs font-bold uppercase tracking-[0.25em] text-secondary">
        {children}
      </h2>
      <div className="h-px flex-1 bg-gradient-to-r from-primary/60 to-transparent" />
    </div>
  );
}

function SkillPill({ skill }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-secondary bg-white border border-secondary/10 px-3 py-1.5 rounded-full shadow-sm hover:border-primary hover:-translate-y-0.5 transition-all">
      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
      {skill}
    </span>
  );
}

export default function PortfolioPage() {
  const { id } = useParams();
  const { content } = useContent();
  const branding = content.branding || {};
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [notice, setNotice] = useState('');
  const token = typeof window !== 'undefined' ? localStorage.getItem('tbai.token') : null;
  const viewerRole = typeof window !== 'undefined' ? localStorage.getItem('tbai.role') : null;

  // Identify the logged-in viewer so we can tell the owner "this is yours".
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMe(d.profile))
      .catch(() => {});
  }, [token]);

  const startChat = () => {
    setNotice('');
    if (token && me && me.role === 'seeker' && String(me.id) === String(id)) {
      setNotice('This is your own portfolio — employers will message you from here.');
      return;
    }
    if (viewerRole === 'hub') {
      setNotice('Only employers can open a secure chat with a job seeker.');
      return;
    }
    setChatOpen(true);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    setP(null);
    fetch(`${API_URL}/public/profile/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => active && setP(d.portfolio))
      .catch(() => active && setNotFound(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const stats = useMemo(() => {
    if (!p) return [];
    const years = yearsOfExperience(p.experience);
    const items = [
      years > 0 && { label: 'Years experience', value: `${years}+` },
      (p.experience || []).length > 0 && { label: 'Roles held', value: p.experience.length },
      (p.projects || []).length > 0 && { label: 'Projects', value: p.projects.length },
      (p.certifications || []).length > 0 && { label: 'Certifications', value: p.certifications.length },
      (p.skills || []).length > 0 && { label: 'Skills', value: p.skills.length },
    ].filter(Boolean);
    return items.slice(0, 4);
  }, [p]);

  const availabilityTone = () => {
    const a = (p?.availability || '').toLowerCase();
    if (a.includes('open')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (a.includes('interview')) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (a.includes('not')) return 'bg-secondary/5 text-secondary/60 border-secondary/10';
    return 'bg-white/10 text-white/70 border-white/15';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f5f0] grid place-items-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !p) {
    return (
      <div className="min-h-screen bg-[#f7f5f0] grid place-items-center px-6">
        <div className="text-center animate-pop-in">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 mx-auto flex items-center justify-center mb-6">
            <FolderGit2 className="w-8 h-8 text-secondary" />
          </div>
          <h1 className="font-display text-3xl font-bold text-secondary">This portfolio doesn't exist</h1>
          <p className="text-secondary/50 mt-2">
            The link may be wrong, or the portfolio was removed.
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-secondary text-white text-sm font-semibold hover:bg-accent transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to {branding.name || 'home'}
          </Link>
        </div>
      </div>
    );
  }

  const name = p.name || 'Anonymous';
  const avatar = p.avatar || avatarFor(name);
  const phoneHref = p.phone ? `tel:${p.phone.replace(/[^\d+]/g, '')}` : '';
  const hasDoc = !!(p.cv || p.resumeLink);

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-secondary selection:bg-primary selection:text-black">
      {/* ===== Top bar ===== */}
      <header className="sticky top-0 z-40 bg-[#f7f5f0]/85 backdrop-blur-xl border-b border-secondary/5">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center overflow-hidden shadow-md shadow-primary/40">
              {branding.logo ? (
                <img src={branding.logo} alt="" className="w-full h-full object-contain p-0.5" />
              ) : (
                <Sparkles className="w-4 h-4 text-black" />
              )}
            </div>
            <span className="font-display font-bold tracking-tight group-hover:text-primary transition-colors">
              {branding.name || 'TalentriX'}
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            {hasDoc && (
              <a
                href={p.cv || p.resumeLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-secondary text-white text-xs font-semibold hover:bg-accent hover:-translate-y-0.5 transition-all shadow-md"
              >
                <FileText className="w-3.5 h-3.5" /> Download CV
              </a>
            )}
            <button
              onClick={startChat}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-black text-xs font-bold hover:brightness-105 hover:-translate-y-0.5 transition-all shadow-md shadow-primary/30"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Hire me
            </button>
          </nav>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-primary/30 blur-3xl" />
        <div className="pointer-events-none absolute top-10 right-0 w-64 h-64 rounded-full bg-primary/20 blur-3xl" />

        <div className="relative max-w-5xl mx-auto px-6 pt-14 pb-12 text-center">
          <div className="animate-fade-up flex flex-wrap items-center justify-center gap-2">
            {p.availability ? (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${availabilityTone()}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {p.availability}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-secondary/10 bg-white/60 text-secondary/60 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5" /> Availability not set
              </span>
            )}

            {p.endorsement?.recommend && p.endorsement?.hub && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-black border border-primary text-xs font-bold shadow-md shadow-primary/30">
                <BadgeCheck className="w-4 h-4" /> Recommended by {p.endorsement.hub.name}
              </span>
            )}

            {p.endorsement?.rating > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/70 backdrop-blur border border-secondary/10 text-xs font-semibold text-secondary/80">
                <span className="inline-flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className={`w-3.5 h-3.5 ${i <= p.endorsement.rating ? 'fill-primary text-primary' : 'text-secondary/20'}`} />
                  ))}
                </span>
                {p.endorsement.hub?.name ? `Endorsed by ${p.endorsement.hub.name}` : `${p.endorsement.rating}/5`}
              </span>
            )}
          </div>

          <div className="mt-7 animate-pop-in" style={{ animationDelay: '0.1s' }}>
            <div className="relative inline-block">
              <div className="absolute inset-0 rounded-full bg-primary/40 blur-xl scale-110" aria-hidden="true" />
              <img src={avatar} alt={name} className="relative w-36 h-36 md:w-40 md:h-40 rounded-full object-cover ring-4 ring-white shadow-2xl" />
            </div>
          </div>

          <h1 className="mt-7 font-display text-4xl md:text-6xl font-bold tracking-tight animate-fade-up" style={{ animationDelay: '0.2s' }}>
            {name}
          </h1>

          <div className="mt-3 animate-fade-up" style={{ animationDelay: '0.3s' }}>
            {p.title && (
              <div className="font-display text-xl md:text-2xl font-medium text-secondary/80">
                {p.title}
                {p.pronouns ? <span className="text-secondary/40 font-normal"> · {p.pronouns}</span> : null}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-sm text-secondary/60 animate-fade-up" style={{ animationDelay: '0.4s' }}>
            {p.location && (
              <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" /> {p.location}</span>
            )}
            {p.email && (
              p.contactLocked ? (
                <span className="inline-flex items-center gap-1.5" title="Contact details unlock inside the secure chat">
                  <Mail className="w-4 h-4 text-primary" />
                  <Lock className="w-3 h-3 text-secondary/40" />
                  <span className="blur-[3px] select-none">{p.email}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5"><Mail className="w-4 h-4 text-primary" /> {p.email}</span>
              )
            )}
          </div>

          {notice && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-full animate-pop-in">
              <Lock className="w-3 h-3" /> {notice}
            </p>
          )}

          {/* Action row */}
          {(hasDoc || p.email || p.phone || p.linkedin || p.github || p.website) && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 animate-fade-up" style={{ animationDelay: '0.5s' }}>
              {hasDoc && (
                <a
                  href={p.cv || p.resumeLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-secondary text-white text-sm font-semibold hover:bg-accent hover:-translate-y-0.5 transition-all shadow-lg"
                >
                  <FileText className="w-4 h-4" /> Download CV
                </a>
              )}
              {p.email && (
                <button
                  onClick={startChat}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-black text-sm font-bold hover:brightness-105 hover:-translate-y-0.5 transition-all shadow-lg shadow-primary/30"
                >
                  <MessageSquare className="w-4 h-4" /> Get in touch
                </button>
              )}
              {(p.linkedin || p.github || p.website || p.phone) && (
                <span className="inline-flex items-center gap-2 border border-secondary/10 bg-white/70 backdrop-blur px-3 py-1.5 rounded-full shadow-sm">
                  {p.phone && (
                    p.contactLocked ? (
                      <span title="Unlocks in the secure chat" className="w-9 h-9 grid place-items-center rounded-full text-secondary/40">
                        <Lock className="w-4 h-4" />
                      </span>
                    ) : (
                      <a href={phoneHref} title="Phone" className="w-9 h-9 grid place-items-center rounded-full text-secondary/70 hover:bg-primary/20 hover:text-secondary transition-colors">
                        <Phone className="w-4 h-4" />
                      </a>
                    )
                  )}
                  {p.linkedin && (
                    p.contactLocked ? (
                      <span title="Unlocks in the secure chat" className="w-9 h-9 grid place-items-center rounded-full text-secondary/40">
                        <Lock className="w-4 h-4" />
                      </span>
                    ) : (
                      <a href={toUrl(p.linkedin)} target="_blank" rel="noreferrer" title="LinkedIn" className="w-9 h-9 grid place-items-center rounded-full text-secondary/70 hover:bg-primary/20 hover:text-secondary transition-colors">
                        <LinkIcon className="w-4 h-4" />
                      </a>
                    )
                  )}
                  {p.github && (
                    p.contactLocked ? (
                      <span title="Unlocks in the secure chat" className="w-9 h-9 grid place-items-center rounded-full text-secondary/40">
                        <Lock className="w-4 h-4" />
                      </span>
                    ) : (
                      <a href={toUrl(p.github)} target="_blank" rel="noreferrer" title="GitHub" className="w-9 h-9 grid place-items-center rounded-full text-secondary/70 hover:bg-primary/20 hover:text-secondary transition-colors">
                        <Github className="w-4 h-4" />
                      </a>
                    )
                  )}
                  {p.website && (
                    p.contactLocked ? (
                      <span title="Unlocks in the secure chat" className="w-9 h-9 grid place-items-center rounded-full text-secondary/40">
                        <Lock className="w-4 h-4" />
                      </span>
                    ) : (
                      <a href={toUrl(p.website)} target="_blank" rel="noreferrer" title="Website" className="w-9 h-9 grid place-items-center rounded-full text-secondary/70 hover:bg-primary/20 hover:text-secondary transition-colors">
                        <Globe className="w-4 h-4" />
                      </a>
                    )
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ===== Stats band ===== */}
      {stats.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 animate-fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-secondary/10 border border-secondary/10 rounded-2xl overflow-hidden shadow-lg">
            {stats.map((s) => (
              <div key={s.label} className="bg-white py-6 px-4 text-center hover:bg-primary/5 transition-colors">
                <div className="font-display text-3xl md:text-4xl font-bold text-secondary">{s.value}</div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-secondary/50 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== Body ===== */}
      <main className="max-w-5xl mx-auto px-6 py-14 grid lg:grid-cols-[1.6fr_1fr] gap-10 items-start">

        {/* ---- Left column ---- */}
        <div className="space-y-12">
          {p.endorsement?.hub && (p.endorsement.recommend || p.endorsement.note || p.endorsement.rating > 0) && (
            <section className="animate-fade-up">
              <SectionLabel icon={BadgeCheck}>Endorsement</SectionLabel>
              <div className="relative overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 rounded-2xl p-7">
                <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary/30 blur-2xl" />
                <div className="relative">
                  {p.endorsement.note ? (
                    <blockquote className="font-display text-lg md:text-xl leading-relaxed text-secondary/85">
                      “{p.endorsement.note}”
                    </blockquote>
                  ) : (
                    <blockquote className="font-display text-lg md:text-xl leading-relaxed text-secondary/85">
                      A talent we are proud to recommend.
                    </blockquote>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                    <span className="inline-flex items-center gap-1.5 font-bold text-secondary">
                      <BadgeCheck className="w-4 h-4 text-primary" />
                      {p.endorsement.hub.name}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className={`w-4 h-4 ${i <= (p.endorsement.rating || 0) ? 'fill-primary text-primary' : 'text-secondary/20'}`} />
                      ))}
                    </span>
                    <span className="text-secondary/50">
                      {p.endorsement.recommend ? 'Publicly recommended' : 'Hub-endorsed'}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {p.summary && (
            <section className="animate-fade-up">
              <SectionLabel icon={Sparkles}>Summary</SectionLabel>
              <p className="font-display text-xl md:text-2xl leading-relaxed text-secondary/85 font-medium">
                {p.summary}
              </p>
            </section>
          )}

          {(p.experience || []).length > 0 && (
            <section className="animate-fade-up">
              <SectionLabel icon={Briefcase}>Experience</SectionLabel>
              <div className="relative pl-6">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-secondary/10" aria-hidden="true" />
                <div className="space-y-8">
                  {p.experience.map((e, i) => {
                    const label = period(e);
                    return (
                      <article key={e._id || i} className="relative group">
                        <span className="absolute -left-6 top-1.5 w-[13px] h-[13px] rounded-full bg-primary ring-4 ring-[#f7f5f0] group-hover:scale-125 transition-transform" />
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <h3 className="font-display text-lg font-bold text-secondary">
                            {e.title || 'Role'}
                          </h3>
                          {e.company && <span className="text-primary font-semibold">{e.company}</span>}
                          {label && (
                            <span className="inline-flex items-center gap-1 text-xs text-secondary/50 ml-auto">
                              <Calendar className="w-3.5 h-3.5" /> {label}
                            </span>
                          )}
                        </div>
                        {e.description && (
                          <p className="mt-2 text-secondary/70 leading-relaxed">{e.description}</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {(p.projects || []).length > 0 && (
            <section className="animate-fade-up">
              <SectionLabel icon={FolderGit2}>Projects</SectionLabel>
              <div className="grid sm:grid-cols-2 gap-4">
                {p.projects.map((pr, i) => (
                  <article key={pr._id || i} className="group bg-white rounded-2xl border border-secondary/10 p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-primary/50 transition-all">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/80 to-primary/40 grid place-items-center shadow-md">
                        <FolderGit2 className="w-5 h-5 text-black" />
                      </div>
                      {pr.link && (
                        <a
                          href={toUrl(pr.link)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-secondary/40 hover:text-primary transition-colors"
                          title="Open project"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    <h3 className="font-display font-bold text-secondary leading-snug">{pr.name || 'Project'}</h3>
                    {pr.description && <p className="mt-1.5 text-sm text-secondary/60 leading-relaxed">{pr.description}</p>}
                    {pr.tech && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {pr.tech.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                          <span key={t} className="text-[11px] font-semibold bg-secondary/5 text-secondary/60 px-2 py-0.5 rounded-md">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {p.bio && (
            <section className="animate-fade-up">
              <SectionLabel icon={Sparkles}>About me</SectionLabel>
              <div className="bg-white rounded-2xl border border-secondary/10 p-7 shadow-sm">
                <p className="text-secondary/75 leading-relaxed whitespace-pre-line">{p.bio}</p>
              </div>
            </section>
          )}
        </div>

        {/* ---- Right column ---- */}
        <aside className="space-y-8 lg:sticky lg:top-24">
          {(p.skills || []).length > 0 && (
            <section className="bg-white rounded-2xl border border-secondary/10 p-6 shadow-sm animate-fade-up">
              <SectionLabel icon={CheckCircle2}>Skills</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {p.skills.map((s) => <SkillPill key={s} skill={s} />)}
              </div>
            </section>
          )}

          {(p.education || []).length > 0 && (
            <section className="bg-white rounded-2xl border border-secondary/10 p-6 shadow-sm animate-fade-up">
              <SectionLabel icon={GraduationCap}>Education</SectionLabel>
              <div className="space-y-4">
                {p.education.map((e, i) => {
                  const label = period(e);
                  return (
                    <div key={e._id || i} className="relative pl-4 border-l-2 border-primary/60">
                      <div className="font-bold text-secondary">{e.degree || e.school || 'Education'}</div>
                      {e.school !== e.degree && e.school && <div className="text-sm text-secondary/60">{e.school}</div>}
                      {e.field && <div className="text-sm text-secondary/50">{e.field}</div>}
                      {label && <div className="text-xs text-secondary/40 mt-0.5">{label}</div>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {(p.certifications || []).length > 0 && (
            <section className="bg-white rounded-2xl border border-secondary/10 p-6 shadow-sm animate-fade-up">
              <SectionLabel icon={Award}>Certifications</SectionLabel>
              <div className="space-y-3">
                {p.certifications.map((c, i) => (
                  <div key={c._id || i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/15 grid place-items-center shrink-0">
                      <Award className="w-4 h-4 text-secondary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-secondary truncate">{c.name || 'Certification'}</div>
                      {(c.issuer || c.year) && (
                        <div className="text-xs text-secondary/50">
                          {c.issuer}
                          {c.issuer && c.year ? ' · ' : ''}{c.year}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(p.languages || []).length > 0 && (
            <section className="bg-white rounded-2xl border border-secondary/10 p-6 shadow-sm animate-fade-up">
              <SectionLabel icon={Languages}>Languages</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {p.languages.map((l) => (
                  <span key={l} className="inline-flex items-center gap-1.5 text-sm font-medium text-secondary/80 bg-secondary/5 px-3 py-1.5 rounded-full">
                    <Languages className="w-3.5 h-3.5 text-primary" /> {l}
                  </span>
                ))}
              </div>
            </section>
          )}
        </aside>
      </main>

      {/* ===== Contact CTA ===== */}
      {(hasDoc || p.email || p.phone || p.linkedin || p.github || p.website) && (
        <section className="max-w-5xl mx-auto px-6 pb-16 animate-fade-up">
          <div className="relative overflow-hidden bg-secondary text-white rounded-3xl px-8 py-14 text-center shadow-2xl">
            <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative">
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                Let's build something great together.
              </h2>
              {p.summary && (
                <p className="mt-3 max-w-xl mx-auto text-white/60">
                  {p.summary}
                </p>
              )}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {p.email && (
                  <button
                    onClick={startChat}
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-black font-bold hover:brightness-105 hover:-translate-y-0.5 transition-all shadow-lg shadow-primary/30"
                  >
                    <MessageSquare className="w-4 h-4" /> Get in touch
                  </button>
                )}
                {hasDoc && (
                  <a
                    href={p.cv || p.resumeLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 hover:-translate-y-0.5 transition-all"
                  >
                    <FileText className="w-4 h-4" /> Download CV
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== Footer ===== */}
      <footer className="border-t border-secondary/10">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-secondary/50">
          <span>
            © {new Date().getFullYear()} {branding.name || 'TalentriX'} · Live portfolio
          </span>
          {p.createdAt && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Member since {new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
      </footer>

      {/* Secure end-to-end encrypted chat */}
      <SecureChat open={chatOpen} seedId={id} onClose={() => setChatOpen(false)} />
    </div>
  );
}