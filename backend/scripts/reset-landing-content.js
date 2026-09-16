require('dotenv').config();
const mongoose = require('mongoose');

// Mirror of backend/server.js DEFAULT_SITE (verified-talent copy).
// Kept inline here so this one-off script can run without booting the server.
const DEFAULT_SITE = {
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
      'TalentriX connects you with job seekers who are already approved, interviewed, and interview-ready. Every candidate runs a live public portfolio — then chat privately in an end-to-end-encrypted room and hop on a video call before you decide.',
    ctaPrimary: 'Get Started',
    ctaSecondary: 'See How It Works',
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=70',
    badgeCardTitle: 'Verified Talent',
    badgeCardSub: 'Approved & interviewed',
  },
  heroStats: [
    { value: '100%', label: 'Vetted' },
    { value: 'E2E', label: 'Encrypted' },
    { value: 'Live', label: 'Portfolios' },
  ],
  navLinks: [
    { label: 'Home', href: '#home' },
    { label: 'About', href: '#about' },
    { label: 'Reviews', href: '#reviews' },
    { label: 'Partners', href: '#partners' },
    { label: 'Contact', href: '#contact' },
  ],
  about: {
    eyebrow: 'About TalentriX',
    title: 'Recruitment that finally ',
    titleHighlight: 'respects everyone',
    titleSuffix: '.',
    body: 'TalentriX is a secure talent marketplace. Job seekers build a polished public portfolio and are approved and interviewed by our team before they join the pool. Talent hubs invite and endorse their members and publish grants. Employers search vetted talent, unlock a private chat for a small one-off connect fee, and meet candidates over a built-in video call before they commit.',
    image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&auto=format&fit=crop&q=70',
  },
  features: [
    { title: 'Human-Vetted Talent', desc: 'Every job seeker is approved by an administrator and completes an onboarding interview before entering the talent pool — so employers meet people who are genuinely ready to talk.' },
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
  reviewsHeading: {
    eyebrow: 'Visitor Reviews',
    title: 'What people are ',
    titleHighlight: 'saying',
    titleSuffix: ' about us.',
    body: '',
  },
  partnersHeading: {
    eyebrow: 'From Hubs & Employers',
    title: 'Real partners. ',
    titleHighlight: 'Real momentum.',
  },
  collaborators: [
    { name: 'Google', logo: 'https://cdn.simpleicons.org/google/000000' },
    { name: 'Microsoft', logo: 'https://cdn.simpleicons.org/microsoft/000000' },
    { name: 'Stripe', logo: 'https://cdn.simpleicons.org/stripe/635BFF' },
    { name: 'Shopify', logo: 'https://cdn.simpleicons.org/shopify/95BF47' },
    { name: 'Notion', logo: 'https://cdn.simpleicons.org/notion/000000' },
    { name: 'Figma', logo: 'https://cdn.simpleicons.org/figma/F24E1E' },
  ],
  footer: {
    brandTagline:
      'Secure verified talent — hubs nurture communities, employers connect, and job seekers build their careers.',
    newsletterBlurb: 'New hires, product updates, and what the talent pool is up to.',
    quickLinksTitle: 'Quick Links',
    quickLinks: [
      { label: 'Home', href: '#home' },
      { label: 'About', href: '#about' },
      { label: 'Reviews', href: '#reviews' },
      { label: 'Contact', href: '#contact' },
    ],
    resourcesTitle: 'Resources',
    resources: [
      { label: 'Documentation', href: '#' },
      { label: 'API Reference', href: '#' },
      { label: 'Pricing', href: '#' },
      { label: 'Blog', href: '#' },
    ],
  },
  contactInfo: {
    email: 'hello@talentbridge.ai',
    phone: '+1 (415) 555-0142',
    address: '500 Howard Street, San Francisco, CA',
  },
  contactHeading: {
    eyebrow: 'Get In Touch',
    title: "Let's build your ",
    titleHighlight: 'dream team.',
    body: "Questions about joining as a candidate, hub, or employer? We'll be in touch within one business day.",
    officeHours: 'Mon–Fri, 9am–6pm PST. We respond to every message within one business day.',
  },
};

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/talentbridge';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected.');

  const SiteContent = mongoose.model('SiteContent', new mongoose.Schema({}, { strict: false }));
  const before = await SiteContent.findOne({ key: 'landing' });

  if (!before) {
    console.log('No "landing" document found — nothing to migrate.');
  } else {
    console.log('Stored hero.badge :', JSON.stringify(before.hero && before.hero.badge));
    console.log('Stored hero.title :', JSON.stringify(before.hero && before.hero.titleHighlight));
    console.log('Stored features   :', JSON.stringify((before.features || []).map((f) => f.title)));
  }

  await SiteContent.deleteMany({ key: 'landing' });
  console.log('Deleted old "landing" document(s).');

  const fresh = new SiteContent({ key: 'landing', ...DEFAULT_SITE });
  await fresh.save();
  console.log('Inserted new "landing" document with verified-talent defaults.');

  const check = await SiteContent.findOne({ key: 'landing' });
  console.log('Verify hero.badge :', check.hero.badge);
  console.log('Verify heroStats  :', JSON.stringify(check.heroStats));
  console.log('Verify features   :', JSON.stringify(check.features.map((f) => f.title)));

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});