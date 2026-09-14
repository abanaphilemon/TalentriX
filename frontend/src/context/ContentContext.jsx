import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  navLinks as defaultNav,
  heroStats as defaultHeroStats,
  collaborators as defaultCollaborators,
  footerLinks as defaultFooterLinks,
  contactInfo as defaultContactInfo,
  images as defaultImages,
} from '../data/content.js';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Fully-populated default content so the site works even if the DB is empty.
const defaults = {
  branding: {
    name: 'TalentriX',
    tagline: 'A · I',
    logo: '',
  },
  hero: {
    badge: 'AI-POWERED RECRUITMENT',
    titlePrefix: 'Hire ',
    titleHighlight: 'extraordinary',
    titleSuffix: 'talent, faster.',
    subtitle:
      'TalentriX matches you with pre-vetted candidates in days, not months. Our models read beyond the resume — surfacing people who truly fit your team.',
    ctaPrimary: 'Get Started',
    ctaSecondary: 'See How It Works',
    image: defaultImages.hero,
    badgeCardTitle: 'AI Match',
    badgeCardSub: 'Live now',
  },
  heroStats: defaultHeroStats,
  navLinks: defaultNav,
  about: {
    eyebrow: 'About TalentriX',
    title: 'Recruitment, ',
    titleHighlight: 'reimagined',
    titleSuffix: ' by humans and machines.',
    body: 'We built TalentriX because hiring the best people should not be a privilege of the biggest companies. Our platform pairs advanced language models with human recruiters to bring speed, fairness, and clarity to every search.',
    image: defaultImages.about,
  },
  features: [
    { title: 'Smart Matching', desc: 'LLM-powered models read résumés, projects, and culture cues to surface the right person.' },
    { title: 'Precision Sourcing', desc: "Reach passive candidates you'd never find on traditional platforms." },
    { title: '10x Faster', desc: 'Cut your time-to-hire by 80% with automated screening and ranking.' },
    { title: 'Bias Audited', desc: 'Every model decision is logged and audited to keep hiring fair and explainable.' },
  ],
  cta: {
    title: 'The future of hiring is ',
    titleHighlight: 'already here.',
    body: 'Join 1,200+ companies using TalentriX to build world-class teams in record time.',
    buttonText: 'Book a Demo',
  },
  partnersHeading: {
    eyebrow: 'Trusted By Industry Leaders',
    title: 'Powering hiring at ',
    titleHighlight: 'amazing companies.',
  },
  collaborators: defaultCollaborators,
  footer: {
    brandTagline:
      'AI-powered recruitment that connects exceptional people with the teams who need them.',
    newsletterBlurb: 'Monthly insights on AI, hiring, and the future of work.',
    quickLinksTitle: 'Quick Links',
    quickLinks: defaultFooterLinks.quick,
    resourcesTitle: 'Resources',
    resources: defaultFooterLinks.resources,
  },
  contactInfo: defaultContactInfo,
  contactHeading: {
    eyebrow: 'Get In Touch',
    title: "Let's build your ",
    titleHighlight: 'dream team.',
    body: "Tell us what you're building — we'll be in touch within one business day.",
    officeHours: 'Mon–Fri, 9am–6pm PST. We respond to every message within one business day.',
  },
  reviewsHeading: {
    eyebrow: 'Visitor Reviews',
    title: 'What people are ',
    titleHighlight: 'saying',
    titleSuffix: ' about us.',
    body: '',
  },
};

const ContentContext = createContext(null);

export function ContentProvider({ children }) {
  const [content, setContent] = useState(defaults);
  const [loading, setLoading] = useState(true);

  // Deep-merge DB content over the defaults. Empty/blank strings and empty
  // DB is the source of truth: DB values (even empty) override the shipped
  // defaults. Defaults are only used for fields the DB doc doesn't have at all,
  // so clearing a field in the CMS actually clears it on the site.
  const merge = useCallback((db) => {
    const out = { ...defaults };
    if (!db) return out;
    for (const key of Object.keys(defaults)) {
      if (db[key] === undefined) continue;
      if (
        typeof defaults[key] === 'object' &&
        !Array.isArray(defaults[key]) &&
        defaults[key] !== null
      ) {
        const merged = { ...defaults[key] };
        const src = db[key] || {};
        for (const f of Object.keys(merged)) {
          if (src[f] !== undefined) merged[f] = src[f];
        }
        out[key] = merged;
      } else {
        out[key] = db[key];
      }
    }
    return out;
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/content`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (active) setContent(merge(d.content));
      })
      .catch(() => {
        // fall back to defaults
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [merge]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/content`);
      if (r.ok) {
        const d = await r.json();
        setContent(merge(d.content));
      }
    } catch {
      // ignore
    }
  }, [merge]);

  const value = { content, loading, refresh };
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent() {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error('useContent must be used inside <ContentProvider>');
  return ctx;
}
