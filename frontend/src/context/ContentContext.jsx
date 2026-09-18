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
    tagline: 'VERIFIED TALENT',
    logo: '',
  },
  hero: {
    badge: 'VERIFIED TALENT MARKETPLACE',
    titlePrefix: 'Hire ',
    titleHighlight: 'verified',
    titleSuffix: ' talent, securely.',
    subtitle:
      'TalentriX connects you with job seekers who are already interviewed and interview-ready. Every candidate runs a live public portfolio — then chat privately in an end-to-end-encrypted room and hop on a video call before you decide.',
    ctaPrimary: 'Get Started',
    ctaSecondary: 'See How It Works',
    image: defaultImages.hero,
    badgeCardTitle: 'Verified Talent',
    badgeCardSub: 'Screened & interviewed',
  },
  heroStats: defaultHeroStats,
  navLinks: defaultNav,
  about: {
    eyebrow: 'About TalentriX',
    title: 'Recruitment that finally ',
    titleHighlight: 'respects everyone',
    titleSuffix: '.',
    body: 'TalentriX is a secure talent marketplace. Job seekers build a polished public portfolio and are interviewed by our team before they join the pool. Talent hubs invite and endorse their members and publish grants. Employers search vetted talent, unlock a private chat for a small one-off connect fee, and meet candidates over a built-in video call before they commit.',
    image: defaultImages.about,
  },
  features: [
    { title: 'Human-Vetted Talent', desc: 'Every job seeker verifies their email and completes an onboarding interview before entering the talent pool — so employers meet people who are genuinely ready to talk.' },
    { title: 'Secure Paid Chat', desc: 'Chat privately with a candidate through end-to-end encrypted messaging, unlocked by a small one-off connect fee. No subscription, no surprise costs.' },
    { title: 'Public Portfolios', desc: 'Each candidate runs a polished public portfolio — experience, projects, skills, certifications, and hub endorsements — all in one shareable link.' },
    { title: 'Hubs & Endorsements', desc: 'Talent hubs grow their own community through a unique invite link, endorse their members, and publish grants their talent can apply for.' },
  ],
  cta: {
    title: 'The right talent is ',
    titleHighlight: 'one chat away.',
    body: 'Sign up free, browse the vetted talent pool, and start a secure conversation with your next hire — no subscription or long-term contract.',
    buttonText: 'Get in Touch',
  },
  partnersHeading: {
    eyebrow: 'From Hubs & Employers',
    title: 'Real partners. ',
    titleHighlight: 'Real momentum.',
  },
  collaborators: defaultCollaborators,
  footer: {
    brandTagline:
      'Secure verified talent — hubs nurture communities, employers connect, and job seekers build their careers.',
    newsletterBlurb: 'New hires, product updates, and what the talent pool is up to.',
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
    body: "Questions about joining as a candidate, hub, or employer? We'll be in touch within one business day.",
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
