require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Email (SMTP) ────────────────────────────────────────────────────────────
// Everything degrades gracefully: if SMTP credentials aren't configured the
// reminders are logged to the console so development still works.
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.SMTP_FROM || (SMTP_USER ? `TalentriX <${SMTP_USER}>` : 'TalentriX <noreply@talentri-x.vercel.app>');
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://talentri-x.vercel.app';

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendMail({ to, subject, html }) {
  if (!to) return false;
  try {
    if (!transporter) {
      console.log(`[email:skipped] 🕮 to=${to} subject="${subject}"`);
      return false;
    }
    await transporter.sendMail({ from: MAIL_FROM, to, subject, html });
    console.log(`[email:sent] to=${to} subject="${subject}"`);
    return true;
  } catch (error) {
    console.error('[email:error]', error.message);
    return false;
  }
}

// ── Interview scheduling calendar ───────────────────────────────────────────
// All interview times are Nigeria wall-clock (Africa/Lagos, UTC+1). Nigeria
// does not observe DST, so wall time → absolute instant is a fixed offset.
const LAGOS_OFFSET_MS = 60 * 60 * 1000; // UTC+1
const INTERVIEW_BLOCK_HOURS = 3; // each booking takes its slot + the next 3h

// 'YYYY-MM-DD' + 'HH:MM' (Nigeria wall time) → absolute Date.
function nigeriaWallToUtc(dateStr, timeStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const [hh, mm] = String(timeStr).split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0) - LAGOS_OFFSET_MS);
}

// Rebuild the absolute start instant for a stored interview (stored calendar
// day is kept as UTC midnight of the Nigeria date + separate "HH:MM" string).
function interviewStart(iv) {
  const d = iv.proposedDate instanceof Date ? iv.proposedDate : new Date(iv.proposedDate);
  const dateStr = [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
  return nigeriaWallToUtc(dateStr, iv.proposedTime);
}
function interviewEnd(iv) {
  return new Date(interviewStart(iv).getTime() + INTERVIEW_BLOCK_HOURS * 3600 * 1000);
}

// Middleware
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['https://talentri-x.vercel.app', 'https://talentri-x.vercel.app'];
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
// Allow larger payloads (CV/logo uploads are stored as data URLs)
app.use(express.json({ limit: '12mb' }));

// MongoDB Connection
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/talentbridge';
mongoose.connect(uri)
.then(async () => {
  console.log('MongoDB connected');
  try {
    await seedSite();
  } catch (e) {
    console.error('Seed error:', e.message);
  }
  // Interview housekeeping: expire unapproved times that have passed and send
  // the 1-hour reminders. Runs every minute so no background job is required.
  setInterval(() => {
    interviewHousekeeping();
  }, 60 * 1000);
  interviewHousekeeping();
})
.catch(err => console.error('MongoDB connection error:', err));

// Structured portfolio entry schemas (seeker CV/portfolio builder)
const experienceSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  company: { type: String, default: '' },
  start: { type: String, default: '' },
  end: { type: String, default: '' },
  current: { type: Boolean, default: false },
  description: { type: String, default: '' },
});

const educationSchema = new mongoose.Schema({
  school: { type: String, default: '' },
  degree: { type: String, default: '' },
  field: { type: String, default: '' },
  start: { type: String, default: '' },
  end: { type: String, default: '' },
  current: { type: Boolean, default: false },
});

const certificationSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  issuer: { type: String, default: '' },
  year: { type: String, default: '' },
});

const projectSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  description: { type: String, default: '' },
  link: { type: String, default: '' },
  tech: { type: String, default: '' },
});

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['hub', 'seeker', 'employer', 'admin'], required: true },

  // Admin moderation — every new account starts as `pending` and needs an
  // admin to approve it before the dashboard/portfolio becomes accessible.
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  active: { type: Boolean, default: true },
  // Set once the user completes onboarding — used to route them into the
  // onboarding flow after registration, even if they don't finish it in one go.
  onboardingDone: { type: Boolean, default: false },
  // Set once the user completes the (mandatory) admin video interview. Users
  // can only open their dashboard after this step is finished.
  interviewDone: { type: Boolean, default: false },

  // Secure chat — keypair is generated and stored by the server so chat works
  // with zero setup. pubkey = SPKI base64 (shared with chat partners);
  // e2ePriv = JSON-serialized private JWK, returned only to the owner.
  pubkey: { type: String, default: '' },
  e2ePriv: { type: String, default: '' },

  // Hub-specific: unique invite code used in the shared registration link
  hubRef: { type: String, default: null },

  // Employer profile fields
  company: { type: String, default: '' },
  title: { type: String, default: '' },
  location: { type: String, default: '' },
  bio: { type: String, default: '' },
  linkedin: { type: String, default: '' },
  // Organization logo — used on the landing page partners section for hubs/employers
  logo: { type: String, default: '' },

  // Seeker portfolio fields
  avatar: { type: String, default: '' },
  skills: { type: [String], default: [] },
  languages: { type: [String], default: [] },
  summary: { type: String, default: '' },
  pronouns: { type: String, default: '' },
  phone: { type: String, default: '' },
  github: { type: String, default: '' },
  website: { type: String, default: '' },
  availability: { type: String, default: '' },
  experience: { type: [experienceSchema], default: [] },
  education: { type: [educationSchema], default: [] },
  certifications: { type: [certificationSchema], default: [] },
  projects: { type: [projectSchema], default: [] },
  resumeLink: { type: String, default: '' },
  // Uploaded CV — stored as a data URL so it can render/download without a file server
  cv: { type: String, default: '' },

  // Which hub this seeker registered through (hub's userId)
  hubId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Hub endorsement — rated/recommended by the hub this seeker registered through.
  // hubRating is 0 until the hub rates the talent (1–5 stars).
  hubRating: { type: Number, min: 0, max: 5, default: 0 },
  hubRecommend: { type: Boolean, default: false },
  hubNote: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const User = mongoose.model('User', userSchema);

// E2E encrypted direct messages. Content is AES-GCM ciphertext (iv + ct);
// the server stores it as-is and can never read it.
const Message = mongoose.model(
  'Message',
  new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    iv: { type: String, required: true },
    ct: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  })
);

// Placeholder used whenever a seeker's contact details are locked.
const MASK_EMAIL = '••••••@•••••';
const MASK_LINE = '••••••••••';

// Server-managed chat keys. The keypair is created automatically for every
// account (registration + lazy backfill), so chat works with no user action:
// the browser fetches its own keypair from GET /api/chat/keys and uses it to
// encrypt/decrypt. Partners only ever see the public half.
const ecSubtle = require('crypto').webcrypto.subtle;
const EC_PARAMS = { name: 'ECDH', namedCurve: 'P-256' };

function b64ToBuf(b64) {
  return Buffer.from(b64, 'base64');
}
function bufToB64(buf) {
  return Buffer.from(new Uint8Array(buf)).toString('base64');
}

async function provisionKeys(user) {
  if (user.pubkey && user.e2ePriv) return;
  const kp = await ecSubtle.generateKey(EC_PARAMS, true, ['deriveBits']);
  const privJwk = await ecSubtle.exportKey('jwk', kp.privateKey);
  const pubB64 = bufToB64(await ecSubtle.exportKey('spki', kp.publicKey));
  user.pubkey = pubB64;
  user.e2ePriv = JSON.stringify(privJwk);
  await user.save();
}

// Public projection: no password, returns profile fields as a plain object
function publicUser(u) {
  return {
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status || 'approved',
    active: u.active !== false,
    onboardingDone: u.onboardingDone !== false,
    interviewDone: u.interviewDone !== false,
    hubRef: u.hubRef,
    company: u.company,
    title: u.title,
    location: u.location,
    bio: u.bio,
    linkedin: u.linkedin,
    logo: u.logo,
    avatar: u.avatar,
    skills: u.skills,
    languages: u.languages,
    summary: u.summary,
    pronouns: u.pronouns,
    phone: u.phone,
    github: u.github,
    website: u.website,
    availability: u.availability,
    experience: Array.isArray(u.experience) ? u.experience : [],
    education: Array.isArray(u.education) ? u.education : [],
    certifications: Array.isArray(u.certifications) ? u.certifications : [],
    projects: Array.isArray(u.projects) ? u.projects : [],
    resumeLink: u.resumeLink,
    cv: u.cv,
    hubId: u.hubId,
    hubRating: u.hubRating,
    hubRecommend: u.hubRecommend,
    hubNote: u.hubNote,
    contactLocked: false,
    createdAt: u.createdAt,
  };
}

// Overwrite a public-user object's contact fields with masked placeholders.
// Real contact details are never exposed on the talent-pool list.
function lockContacts(u) {
  return {
    ...u,
    email: MASK_EMAIL,
    phone: MASK_LINE,
    linkedin: MASK_LINE,
    github: MASK_LINE,
    website: MASK_LINE,
    contactLocked: true,
  };
}

// Secure chat pairing rules — only an employer and a job seeker may chat.
function chatPairOk(a, b) {
  const roles = new Set([a.role, b.role]);
  return roles.has('employer') && roles.has('seeker');
}

const SiteContent = mongoose.model('SiteContent', new mongoose.Schema({
  key: { type: String, default: 'landing' },
  // Brand — site name + logo (also shown in header/footer)
  branding: {
    name: { type: String, default: 'TalentriX' },
    tagline: { type: String, default: 'A · I' },
    logo: { type: String, default: '' },
  },
  // Hero
  hero: {
    badge: { type: String, default: 'AI-POWERED RECRUITMENT' },
    titlePrefix: { type: String, default: 'Hire ' },
    titleHighlight: { type: String, default: 'extraordinary' },
    titleSuffix: { type: String, default: 'talent, faster.' },
    subtitle: { type: String, default: '' },
    ctaPrimary: { type: String, default: 'Get Started' },
    ctaSecondary: { type: String, default: 'See How It Works' },
    image: { type: String, default: '' },
  },
  // Hero stats
  heroStats: [{
    value: { type: String, default: '' },
    label: { type: String, default: '' },
  }],
  // Navigation links
  navLinks: [{
    label: { type: String, default: '' },
    href: { type: String, default: '#' },
  }],
  // About
  about: {
    eyebrow: { type: String, default: '' },
    title: { type: String, default: '' },
    titleHighlight: { type: String, default: '' },
    body: { type: String, default: '' },
    image: { type: String, default: '' },
  },
  // Feature blocks (About grid)
  features: [{
    title: { type: String, default: '' },
    desc: { type: String, default: '' },
  }],
  // CTA banner
  cta: {
    title: { type: String, default: '' },
    titleHighlight: { type: String, default: '' },
    body: { type: String, default: '' },
    buttonText: { type: String, default: 'Book a Demo' },
  },
  // Collaborators / partners
  partnersHeading: {
    eyebrow: { type: String, default: '' },
    title: { type: String, default: '' },
    titleHighlight: { type: String, default: '' },
  },
  collaborators: [{
    name: { type: String, default: '' },
    logo: { type: String, default: '' },
    // Links a partner tile back to the hub/employer that registered it,
    // so profile updates can refresh just that tile.
    hubId: { type: mongoose.Schema.Types.ObjectId, default: null },
  }],
  // Footer
  footer: {
    brandTagline: { type: String, default: '' },
    newsletterBlurb: { type: String, default: '' },
    quickLinksTitle: { type: String, default: 'Quick Links' },
    quickLinks: [{
      label: { type: String, default: '' },
      href: { type: String, default: '#' },
    }],
    resourcesTitle: { type: String, default: 'Resources' },
    resources: [{
      label: { type: String, default: '' },
      href: { type: String, default: '#' },
    }],
  },
  // Contact
  contactInfo: {
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
  },
  contactHeading: {
    eyebrow: { type: String, default: '' },
    title: { type: String, default: '' },
    titleHighlight: { type: String, default: '' },
    body: { type: String, default: '' },
    officeHours: { type: String, default: '' },
  },
  reviewsHeading: {
    eyebrow: { type: String, default: '' },
    title: { type: String, default: '' },
    titleHighlight: { type: String, default: '' },
    titleSuffix: { type: String, default: '' },
    body: { type: String, default: '' },
  },
}));

// Visitor reviews — submitted on the landing page, approved by an admin
// before they are shown publicly.
const Review = mongoose.model('Review', new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  rating: { type: Number, default: 5, min: 1, max: 5 },
  role: { type: String, default: '' },
  message: { type: String, required: true, trim: true },
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}));

// Job listings shown to job seekers on their dashboard.
const Job = mongoose.model('Job', new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, default: '' },
  location: { type: String, default: '' },
  type: { type: String, default: 'Full-time' },
  salary: { type: String, default: '' },
  description: { type: String, default: '' },
  skills: { type: [String], default: [] },
  postedAt: { type: Date, default: Date.now },
}));

// Admin video-interview workflow — after a user is approved they must pick a
// date/time for a call with an admin, the admin confirms it, and then the two
// sides meet in the on-site video room. interviewDone on the user flips to
// true only after the admin marks the call as completed.
const Interview = mongoose.model('Interview', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  proposedDate: { type: Date, required: true },
  proposedTime: { type: String, default: '' },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['proposed', 'accepted', 'rejected', 'completed', 'cancelled', 'expired'], default: 'proposed' },
  adminNotes: { type: String, default: '' },
  scheduledAt: { type: Date, default: Date.now },
  // Absolute Nigeria (Lagos) instants for the booked 3-hour block — enables
  // overlap checks, expiry sweeps and reminders without timezone math on read.
  startAt: { type: Date },
  endAt: { type: Date },
  reminderSentAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}));

// WebRTC signaling payloads for the on-site video interview. Two sides (the
// admin + the user) exchange their offer/answer and ICE candidates by polling
// these records, so no external signaling server is required.
const Signal = mongoose.model('Signal', new mongoose.Schema({
  interviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Interview', required: true },
  kind: { type: String, enum: ['offer', 'answer'], required: true },
  sdp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}));
const IceCandidate = mongoose.model('IceCandidate', new mongoose.Schema({
  interviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Interview', required: true },
  kind: { type: String, enum: ['offer', 'answer'], required: true },
  candidate: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}));

// Employer "Request Talent" — the employer describes the role they're hiring
// for (skills, tools, requirements) and the platform scores every approved
// seeker against it, returning ranked matches with a match %.
const TalentRequest = mongoose.model('TalentRequest', new mongoose.Schema({
  employerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: '' },
  role: { type: String, required: true },
  location: { type: String, default: '' },
  type: { type: String, default: 'Full-time' },
  description: { type: String, default: '' },
  skills: { type: [String], default: [] },
  tools: { type: [String], default: [] },
  requirements: { type: [String], default: [] },
  budget: { type: String, default: '' },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  results: { type: mongoose.Schema.Types.Mixed, default: [] },
  createdAt: { type: Date, default: Date.now },
}));

// Full default landing-page content. This is the source of truth for initial
// seeding, per-section resets, and backfilling older/empty docs.
const DEFAULT_SITE = {
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
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=70',
  },
  heroStats: [
    { value: '50K+', label: 'Talent Matches' },
    { value: '92%', label: 'Placement Success' },
    { value: '1,200+', label: 'Partner Companies' },
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
    title: 'Recruitment, ',
    titleHighlight: 'reimagined',
    titleSuffix: ' by humans and machines.',
    body: 'We built TalentriX because hiring the best people should not be a privilege of the biggest companies. Our platform pairs advanced language models with human recruiters to bring speed, fairness, and clarity to every search.',
    image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&auto=format&fit=crop&q=70',
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
  reviewsHeading: {
    eyebrow: 'Visitor Reviews',
    title: 'What people are ',
    titleHighlight: 'saying',
    titleSuffix: ' about us.',
    body: '',
  },
  partnersHeading: {
    eyebrow: 'Trusted By Industry Leaders',
    title: 'Powering hiring at ',
    titleHighlight: 'amazing companies.',
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
      'AI-powered recruitment that connects exceptional people with the teams who need them.',
    newsletterBlurb: 'Monthly insights on AI, hiring, and the future of work.',
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
    body: "Tell us what you're building — we'll be in touch within one business day.",
    officeHours: 'Mon–Fri, 9am–6pm PST. We respond to every message within one business day.',
  },
};

function cloneDefaults() {
  return {
    branding: { ...DEFAULT_SITE.branding },
    hero: { ...DEFAULT_SITE.hero },
    heroStats: DEFAULT_SITE.heroStats.map((x) => ({ ...x })),
    navLinks: DEFAULT_SITE.navLinks.map((x) => ({ ...x })),
    about: { ...DEFAULT_SITE.about },
    features: DEFAULT_SITE.features.map((x) => ({ ...x })),
    cta: { ...DEFAULT_SITE.cta },
    reviewsHeading: { ...DEFAULT_SITE.reviewsHeading },
    partnersHeading: { ...DEFAULT_SITE.partnersHeading },
    collaborators: DEFAULT_SITE.collaborators.map((x) => ({ ...x })),
    footer: {
      ...DEFAULT_SITE.footer,
      quickLinks: DEFAULT_SITE.footer.quickLinks.map((x) => ({ ...x })),
      resources: DEFAULT_SITE.footer.resources.map((x) => ({ ...x })),
    },
    contactInfo: { ...DEFAULT_SITE.contactInfo },
    contactHeading: { ...DEFAULT_SITE.contactHeading },
  };
}

// Seed the default admin account + landing content, and backfill any fields
// missing from older docs (so the DB is always fully editable).
async function seedSite() {
  const DEFAULT_ADMIN = {
    email: 'admin@talentbridge.ai',
    password: 'admin123',
    name: 'Site Admin',
  };

  let admin = await User.findOne({ email: DEFAULT_ADMIN.email });
  if (!admin) {
    admin = new User({ ...DEFAULT_ADMIN, role: 'admin', status: 'approved', active: true });
    await admin.save();
    console.log('Seeded default admin account');
  } else {
    // Field-update only — the doc may contain stale/invalid data written by
    // older builds, and full-document validation (admin.save()) would reject
    // it. We only need to guarantee the moderation flags below.
    admin.status = 'approved';
    admin.active = true;
    await User.updateOne({ _id: admin._id }, { $set: { status: 'approved', active: true } });
  }

  // Backfill accounts created before moderation existed — treat them as approved
  // so existing users aren't locked out by the new workflow.
  await User.updateMany(
    { status: { $exists: false } },
    { $set: { status: 'approved', active: true } }
  );

  // Accounts that existed before onboarding was introduced already know the app —
  // skip onboarding for them.
  await User.updateMany(
    { onboardingDone: { $exists: false } },
    { $set: { onboardingDone: true } }
  );

  // Accounts that existed before interviews were introduced are treated as
  // already interviewed so they aren't locked out by the new workflow.
  await User.updateMany(
    { interviewDone: { $exists: false } },
    { $set: { interviewDone: true } }
  );

  // Interviews created before the startAt/endAt fields (or stored as plain
  // dates) get their 3-hour block rebuilt from the stored Nigeria wall time.
  const legacyInterviews = await Interview.find({ startAt: { $exists: false } });
  for (const iv of legacyInterviews) {
    await Interview.updateOne(
      { _id: iv._id },
      { $set: { startAt: interviewStart(iv), endAt: interviewEnd(iv) } }
    );
  }

  let doc = await SiteContent.findOne({ key: 'landing' });
  if (!doc) {
    doc = new SiteContent({ key: 'landing', ...cloneDefaults() });
    await doc.save();
    console.log('Seeded default site content');
    return;
  }

  // Backfill missing/empty fields on existing docs.
  let changed = false;
  for (const k of Object.keys(DEFAULT_SITE)) {
    if (typeof DEFAULT_SITE[k] === 'object' && !Array.isArray(DEFAULT_SITE[k])) {
      if (!doc[k] || typeof doc[k] !== 'object') {
        doc[k] = cloneDefaults()[k];
        changed = true;
      } else {
        for (const f of Object.keys(DEFAULT_SITE[k])) {
          if (Array.isArray(DEFAULT_SITE[k][f])) {
            if (!Array.isArray(doc[k][f]) || doc[k][f].length === 0) {
              doc[k][f] = DEFAULT_SITE[k][f].map((x) => ({ ...x }));
              changed = true;
            }
          } else if (typeof doc[k][f] !== 'string' || !doc[k][f].trim()) {
            doc[k][f] = DEFAULT_SITE[k][f];
            changed = true;
          }
        }
      }
    } else {
      const val = doc[k];
      if (!Array.isArray(val) || val.length === 0) {
        doc[k] = DEFAULT_SITE[k].map((x) => ({ ...x }));
        changed = true;
      }
    }
  }
  if (changed) {
    await doc.save();
    console.log('Backfilled site content defaults');
  }
}

// Seed sample job listings only when the jobs collection is empty.
const DEFAULT_NAV = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Reviews', href: '#reviews' },
  { label: 'Partners', href: '#partners' },
  { label: 'Contact', href: '#contact' },
];

const DEFAULT_HERO_TITLES = { prefix: 'Hire ', highlight: 'extraordinary', suffix: 'talent, faster.' };

// Auto-generated logo for an organization (initials tile). Used until the
// org sets its own logo URL.
function partnerLogo(name) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Org')}&background=FFD700&color=000&size=128`;
}

// Add or refresh a talent hub in the landing-partners list.
// Matches by hubId so it updates the right tile without touching others and
// never duplicates on repeated syncs. Hubs always sync; employers only sync
// once they have a company name or logo.
async function syncSitePartner(user) {
  if (!user || (user.role !== 'hub' && user.role !== 'employer')) return;
  // Only approved, active organizations appear on the public partners list.
  if (user.status !== 'approved' || user.active === false) return;
  if (user.role === 'employer' && !(user.company && user.company.trim()) && !(user.logo && user.logo.trim())) return;
  const name = (user.company && user.company.trim()) || user.name;
  const logo = (user.logo && user.logo.trim()) || partnerLogo(name);

  let doc = await SiteContent.findOne({ key: 'landing' });
  if (!doc) doc = new SiteContent({ key: 'landing', ...cloneDefaults() });

  const list = Array.isArray(doc.collaborators) ? doc.collaborators : [];
  const hubId = String(user._id);
  const idx = list.findIndex((p) => p.hubId && String(p.hubId) === hubId);
  const entry = { name, logo, hubId: user._id };

  if (idx >= 0) {
    list[idx] = { ...list[idx].toObject?.(), name, logo };
  } else {
    list.push(entry);
  }
  doc.collaborators = list;
  await doc.save();
  console.log(`Synced partner tile for ${user.role}: ${name}`);
}

// Register endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, role, hubRef } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password, and role are required' });
    }

    if (!['hub', 'seeker', 'employer'].includes(role)) {
      return res.status(400).json({ message: 'Role must be hub, seeker, or employer' });
    }

    // This email can only be used for ONE role — block if used at all
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        message: 'An account with that email already exists. Use another email.',
      });
    }

    // If a seeker registered through a hub link, link them to that hub
    let hubId = null;
    if (hubRef) {
      const hub = await User.findOne({ hubRef, role: 'hub' });
      if (!hub) {
        return res.status(400).json({ message: 'Invalid registration link.' });
      }
      hubId = hub._id;
    }

    // Hubs get a unique invite code automatically on first registration
    let hubCode = null;
    if (role === 'hub') {
      hubCode = (require('crypto').randomUUID
        ? require('crypto').randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10));
      // ensure uniqueness
      while (await User.findOne({ hubRef: hubCode })) {
        hubCode = Math.random().toString(36).slice(2, 10);
      }
    }

    const user = new User({ name, email, password, role, hubRef: hubCode, hubId });
    await user.save();

    // Chat keys are automatic — every account gets a keypair right away.
    await provisionKeys(user);

    // Hubs and employers are organizations — add them to the landing partners
    // list automatically with an auto-generated logo.
    if (role === 'hub') {
      await syncSitePartner(user);
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Email, password, and role are required' });
    }

    if (!['hub', 'seeker', 'employer', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Find user matching BOTH email and role — an account only works in its own role space
    const user = await User.findOne({ email, role });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials for this role' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Disabled accounts can't sign in at all. Pending/rejected users may sign
    // in so the frontend can show the correct status screen — dashboards stay
    // locked until an admin approves the account.
    if (user.active === false) {
      return res.status(403).json({ message: 'This account has been disabled. Contact an administrator.' });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Middleware to verify token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Protected route example (dashboard placeholder)
app.get('/api/dashboard', authenticateToken, (req, res) => {
  // For now, return basic info - frontend can handle role-based routing
  res.json({
    message: `Welcome to your dashboard`,
    user: req.user,
    note: 'Dashboard content will be role-specific'
  });
});

// Get current user from token
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user: publicUser(user) });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get / update the logged-in user's profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ profile: publicUser(user) });
  } catch (error) {
    console.error('Profile get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const allowed = [
      'name', 'company', 'title', 'location', 'bio', 'linkedin',
      'skills', 'languages', 'summary', 'pronouns', 'phone', 'github',
      'website', 'availability', 'experience', 'education', 'certifications',
      'projects', 'avatar', 'resumeLink', 'logo', 'cv', 'onboardingDone',
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const user = await User.findByIdAndUpdate(req.user.userId, updates, {
      returnDocument: 'after',
      runValidators: true,
    }).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found' });

    // Refresh the org's tile on the landing partners section.
    if (user.role === 'hub' || user.role === 'employer') {
      await syncSitePartner(user);
    }

    res.json({ message: 'Profile updated', profile: publicUser(user) });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Hub: get (or ensure) the hub's unique registration link
app.get('/api/hub/link', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'hub') {
      return res.status(403).json({ message: 'Only hub accounts can access this' });
    }
    let hub = await User.findById(req.user.userId).select('-password');
    if (!hub) return res.status(404).json({ message: 'User not found' });

    if (!hubRefOrNull(hub)) {
      let code = (require('crypto').randomUUID || (() => Math.random().toString(36).slice(2, 10)))()
        .slice(0, 8);
      while (await User.findOne({ hubRef: code })) {
        code = Math.random().toString(36).slice(2, 10);
      }
      hub.hubRef = code;
      await hub.save();
    }
    const count = await User.countDocuments({ role: 'seeker', hubId: hub._id, status: 'approved', active: true });
    // Make sure this existing hub shows up as a landing partner too.
    await syncSitePartner(hub);
    res.json({ hubRef: hubRefOrNull(hub), link: getHubLink(hubRefOrNull(hub)), count });
  } catch (error) {
    console.error('Hub link error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Hub: list seekers who registered through this hub's link
app.get('/api/hub/seekers', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'hub') {
      return res.status(403).json({ message: 'Only hub accounts can access this' });
    }
    const seekers = await User.find({ role: 'seeker', hubId: req.user.userId, status: 'approved', active: true })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json({ seekers: seekers.map(publicUser) });
  } catch (error) {
    console.error('Hub seekers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Hub: rate & recommend a member of their own talent pool. The endorsement is
// shown as a badge on the talent's public portfolio.
app.put('/api/hub/rate/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'hub') {
      return res.status(403).json({ message: 'Only hub accounts can do this' });
    }

    const seeker = await User.findById(req.params.id);
    if (!seeker || seeker.role !== 'seeker') {
      return res.status(404).json({ message: 'Talent not found' });
    }
    if (!seeker.hubId || String(seeker.hubId) !== String(req.user.userId)) {
      return res.status(403).json({ message: 'This talent did not register through your link' });
    }

    const rating = Math.max(0, Math.min(5, Math.round(Number(req.body.rating)) || 0));
    if (rating > 0 && rating < 1) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5 stars' });
    }

    seeker.hubRating = rating;
    seeker.hubRecommend = !!req.body.recommend;
    seeker.hubNote = (req.body.note || '').toString().trim().slice(0, 200);
    await seeker.save();

    res.json({ message: 'Endorsement saved', seeker: publicUser(seeker) });
  } catch (error) {
    console.error('Hub rate error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============ Secure chat ============

// Current user's chat keypair. Server-managed: the key is created
// automatically the first time it's asked for, so it always exists.
app.get('/api/chat/keys', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await provisionKeys(user);
    res.json({ pubkey: user.pubkey || '', privateJwk: user.e2ePriv ? JSON.parse(user.e2ePriv) : null });
  } catch (error) {
    console.error('Chat keys error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Legacy upload of a browser-generated public key. Kept for older cached
// clients; new clients fetch their server-managed keypair instead.
app.put('/api/chat/keys', authenticateToken, async (req, res) => {
  try {
    const pubkey = (req.body.pubkey || '').toString().trim();
    if (!pubkey || pubkey.length > 8192) {
      return res.status(400).json({ message: 'Missing public key' });
    }
    await User.updateOne({ _id: req.user.userId }, { $set: { pubkey } });
    res.json({ pubkey });
  } catch (error) {
    console.error('Chat keys error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Chat thread list: every other party you've exchanged messages with,
// plus your unread count and their latest message time.
app.get('/api/chat/threads', authenticateToken, async (req, res) => {
  try {
    const me = req.user.userId;
    const msgs = await Message.find({ $or: [{ from: me }, { to: me }] }).sort({ createdAt: 1 });
    const byOther = new Map();
    for (const m of msgs) {
      const other = String(m.from) === me ? String(m.to) : String(m.from);
      const entry = byOther.get(other) || { unread: 0, lastAt: m.createdAt };
      if (!byOther.has(other)) byOther.set(other, entry);
      if (m.createdAt > entry.lastAt) entry.lastAt = m.createdAt;
      if (String(m.to) === me && !m.read) entry.unread += 1;
    }
    const partners = await User.find({ _id: { $in: [...byOther.keys()] } }).select('name role title company logo avatar pubkey e2ePriv');
    for (const p of partners) await provisionKeys(p);
    const threads = partners
      .map((p) => {
        const meta = byOther.get(String(p._id));
        return {
          partner: {
            id: p._id,
            name: p.name,
            role: p.role,
            title: p.title,
            company: p.company,
            logo: p.logo || p.avatar || '',
            pubkey: p.pubkey || '',
          },
          unread: meta.unread,
          lastAt: meta.lastAt,
        };
      })
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    res.json({ threads });
  } catch (error) {
    console.error('Chat threads error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Total unread count (for the dashboard badge).
app.get('/api/chat/unread', authenticateToken, async (req, res) => {
  try {
    const count = await Message.countDocuments({ to: req.user.userId, read: false });
    res.json({ count });
  } catch (error) {
    console.error('Chat unread error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Open (or resume) a thread with one party. Only employer↔seeker pairs are
// allowed. Marks everything from them as read.
app.get('/api/chat/thread/:id', authenticateToken, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    const partner = await User.findById(req.params.id).select('name role title company logo avatar pubkey e2ePriv');
    if (!me || !partner) return res.status(404).json({ message: 'User not found' });
    if (!chatPairOk(me, partner)) {
      return res.status(403).json({ message: 'Chats are available between employers and job seekers only' });
    }
    await provisionKeys(partner);

    const msgs = await Message.find({
      $or: [
        { from: me._id, to: partner._id },
        { from: partner._id, to: me._id },
      ],
    }).sort({ createdAt: 1 });

    await Message.updateMany({ from: partner._id, to: me._id, read: false }, { $set: { read: true } });

    res.json({
      partner: {
        id: partner._id,
        name: partner.name,
        role: partner.role,
        title: partner.title,
        company: partner.company,
        logo: partner.logo || partner.avatar || '',
        pubkey: partner.pubkey || '',
      },
      messages: msgs.map((m) => ({
        id: m._id,
        from: m.from,
        to: m.to,
        iv: m.iv,
        ct: m.ct,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error('Chat thread error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send one encrypted message (iv + ct only — the server can't read it).
app.post('/api/chat/messages', authenticateToken, async (req, res) => {
  try {
    const { to, iv, ct } = req.body || {};
    if (!to || !iv || !ct) return res.status(400).json({ message: 'Missing message payload' });
    if (ct.length > 20000) return res.status(413).json({ message: 'Message too large' });

    const me = await User.findById(req.user.userId);
    const other = await User.findById(to);
    if (!me || !other) return res.status(404).json({ message: 'User not found' });
    if (!chatPairOk(me, other)) {
      return res.status(403).json({ message: 'Chats are available between employers and job seekers only' });
    }

    // Payment gate: employers must pay to message a new seeker.
    // Seekers replying to employers are always allowed.
    if (me.role === 'employer' && other.role === 'seeker') {
      const hasPaid = await ChatPayment.findOne({ employerId: me._id, seekerId: other._id, status: 'paid' });
      if (!hasPaid) {
        return res.status(402).json({ message: 'Payment required', code: 'PAYMENT_REQUIRED' });
      }
    }

    await provisionKeys(other);

    const msg = await Message.create({ from: me._id, to: other._id, iv, ct });
    res.status(201).json({
      message: { id: msg._id, from: msg.from, to: msg.to, iv: msg.iv, ct: msg.ct, createdAt: msg.createdAt },
    });
  } catch (error) {
    console.error('Chat message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

function hubRefOrNull(hub) {
  return hub && hub.hubRef ? hub.hubRef : null;
}
function getHubLink(hubRef) {
  return `${process.env.FRONTEND_URL || 'http://localhost:5173'}/register?ref=${hubRef}`;
}

// Employer: view seekers. If ?source=hub, only seekers who registered via a hub link.
app.get('/api/seekers', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') {
      return res.status(403).json({ message: 'Only employer accounts can view seekers' });
    }
    const filter = { role: 'seeker', status: 'approved', active: true };
    if (req.query.source === 'hub') {
      filter.hubId = { $ne: null };
    }
    const seekers = await User.find(filter).select('-password').sort({ createdAt: -1 });

    // Contact details always stay locked in the talent pool so real emails
    // are never exposed on this page.  The contactLocked flag still reflects
    // whether the seeker has replied (for UI hints), but the actual email is
    // always replaced with a mask here.
    const me = req.user.userId;
    const out = await Promise.all(
      seekers.map(async (s) => {
        return lockContacts(publicUser(s));
      })
    );

    res.json({ seekers: out });
  } catch (error) {
    console.error('Seekers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Public: job listings for the job seeker dashboard
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await Job.find().sort({ postedAt: -1 });
    res.json({ jobs });
  } catch (error) {
    console.error('Jobs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Public: aggregated external jobs from Remotive, Arbeitnow, RemoteOK
app.get('/api/jobs/external', async (req, res) => {
  const fetchWithTimeout = async (url, timeout = 8000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'TalentriX-JobBoard/1.0' },
      });
      clearTimeout(timer);
      if (!r.ok) return null;
      return await r.json();
    } catch {
      clearTimeout(timer);
      return null;
    }
  };

  const normalizeRemotive = (data) =>
    (data.jobs || []).map((j) => ({
      id: `remotive-${j.id}`,
      title: j.title || '',
      company: j.company_name || '',
      location: j.candidate_required_location || 'Remote',
      type: j.job_type
        ? j.job_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : 'Remote',
      salary: j.salary || '',
      description: (j.description || '').replace(/<[^>]*>/g, '').slice(0, 500),
      skills: j.tags || [],
      source: 'Remotive',
      url: j.url || '',
      postedAt: j.publication_date || null,
    }));

  const normalizeArbeitnow = (data) =>
    (data.data || []).map((j) => ({
      id: `arbeitnow-${j.id}`,
      title: j.title || '',
      company: j.company_name || '',
      location: j.location || '',
      type: j.remote ? 'Remote' : 'On-site',
      salary: '',
      description: (j.description || '').replace(/<[^>]*>/g, '').slice(0, 500),
      skills: j.tags || [],
      source: 'Arbeitnow',
      url: j.url || '',
      postedAt: j.created_at || null,
    }));

  const normalizeRemoteok = (data) =>
    (Array.isArray(data) ? data : [])
      .filter((j) => j.id && j.position)
      .map((j) => ({
        id: `remoteok-${j.id}`,
        title: j.position || '',
        company: j.company || '',
        location: j.location || 'Remote',
        type: j.remote
          ? 'Remote'
          : (j.type || 'Full-time').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        salary: j.salary || '',
        description: (j.description || '').replace(/<[^>]*>/g, '').slice(0, 500),
        skills: j.tags || [],
        source: 'RemoteOK',
        url: j.url || '',
        postedAt: j.date || null,
      }));

  const results = await Promise.allSettled([
    fetchWithTimeout('https://remotive.com/api/remote-jobs?limit=100').then(normalizeRemotive),
    fetchWithTimeout('https://www.arbeitnow.com/api/job-board-api').then(normalizeArbeitnow),
    fetchWithTimeout('https://remoteok.com/api').then(normalizeRemoteok),
  ]);

  const jobs = results
    .filter((r) => r.status === 'fulfilled' && Array.isArray(r.value))
    .flatMap((r) => r.value);

  res.json({ jobs, count: jobs.length });
});

// Public: aggregated external grants from Grants.gov + EU Funding & Tenders
app.get('/api/grants/external', async (req, res) => {
  try {
    // Grants.gov — open + forecasted (POST search2 — no auth required)
    const govRes = await fetch('https://api.grants.gov/v1/api/search2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oppStatuses: 'posted', rows: 50 }),
      signal: AbortSignal.timeout(10000),
    });
    const govData = govRes.ok ? await govRes.json() : {};
    const opps = govData?.data?.oppHits || [];
    const grants = opps.map((g) => ({
      id: `grantsgov-${g.id || g.oppId}`,
      title: g.title || g.oppTitle || '',
      agency: g.agencyName || g.agency || '',
      amount: g.awardFloor && g.awardCeil
        ? `$${Number(g.awardFloor).toLocaleString()} – $${Number(g.awardCeil).toLocaleString()}`
        : g.awardCeil
        ? `Up to $${Number(g.awardCeil).toLocaleString()}`
        : '',
      deadline: g.closeDate || g.announcementCloseDate || '',
      description: (g.synopsis || g.description || '').replace(/<[^>]*>/g, '').slice(0, 500),
      eligibility: g.applicantTypes ? g.applicantTypes.join(', ') : '',
      tags: g.categories || g.fundingCategories || [],
      source: 'Grants.gov',
      url: g.oppUrl || (g.id ? `https://www.grants.gov/search-results-detail/${g.id}` : ''),
      status: g.oppStatus || 'posted',
    }));

    // EU Funding & Tenders — best-effort (POST multipart)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const euRes = await fetch('https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA', {
        method: 'POST',
        signal: controller.signal,
        body: (() => {
          const fd = new FormData();
          fd.set('text', '***');
          fd.set('status', 'open');
          fd.set('pageSize', '50');
          fd.set('pageNum', '0');
          return fd;
        })(),
      });
      clearTimeout(timer);
      if (euRes.ok) {
        const euData = await euRes.json();
        const euResults = (euData?.results || [])
          .filter((r) => {
            const m = r.metadata || {};
            const lang = Array.isArray(m.language) ? m.language[0] : m.language;
            return lang === 'en';
          })
          .slice(0, 30)
          .map((r) => {
            const m = r.metadata || {};
            const rawTitle = Array.isArray(m.title) ? m.title[0] : (r.content || '');
            const title = (rawTitle || '').replace(/<[^>]*>/g, '').trim();
            const desc = Array.isArray(m.description) ? m.description[0] : (r.summary || '');
            const programmes = Array.isArray(m.esST_programmes) ? m.esST_programmes : [];
            const endDate = Array.isArray(m.esDA_endDate) ? m.esDA_endDate[0] : '';
            const audiences = Array.isArray(m.esST_audiences) ? m.esST_audiences : [];
            return {
              id: `eu-${r.reference || Math.random().toString(36).slice(2, 8)}`,
              title: title || r.content || '',
              agency: programmes[0] || 'European Commission',
              amount: '',
              deadline: endDate ? endDate.split('T')[0] : '',
              description: (desc || '').replace(/<[^>]*>/g, '').slice(0, 500),
              eligibility: audiences.join(', '),
              tags: programmes.slice(0, 4),
              source: 'EU Funding',
              url: r.url || '',
              status: 'open',
            };
          });
        grants.push(...euResults);
      }
    } catch {
      // EU API best-effort — ignore failures
    }

    res.json({ grants, count: grants.length });
  } catch (error) {
    console.error('Grants external error:', error);
    res.json({ grants: [], count: 0 });
  }
});

// Public: a seeker's portfolio profile (built from the seeker's dashboard settings)
app.get('/api/public/profile/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'seeker') {
      return res.status(404).json({ message: 'Portfolio not found' });
    }
    // Pending or disabled accounts are not publicly visible until approved.
    if (user.status !== 'approved' || user.active === false) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }
    // Hub endorsement badge — the hub this talent registered through, if they rated them
    let hub = null;
    if (user.hubId) {
      const hubUser = await User.findById(user.hubId).select('name company');
      if (hubUser) {
        hub = {
          id: hubUser._id,
          name: hubUser.company || hubUser.name,
        };
      }
    }
    res.json({
      portfolio: lockContacts({
        id: user._id,
        name: user.name,
        avatar: user.avatar,
        title: user.title,
        pronouns: user.pronouns,
        email: user.email,
        phone: user.phone,
        location: user.location,
        availability: user.availability,
        company: user.company,
        linkedin: user.linkedin,
        github: user.github,
        website: user.website,
        skills: user.skills,
        languages: user.languages,
        summary: user.summary,
        bio: user.bio,
        experience: Array.isArray(user.experience) ? user.experience : [],
        education: Array.isArray(user.education) ? user.education : [],
        certifications: Array.isArray(user.certifications) ? user.certifications : [],
        projects: Array.isArray(user.projects) ? user.projects : [],
        resumeLink: user.resumeLink,
        cv: user.cv,
        endorsement: {
          hub,
          rating: user.hubRating || 0,
          recommend: !!user.hubRecommend,
          note: user.hubNote,
        },
        createdAt: user.createdAt,
      }),
    });
  } catch (error) {
    console.error('Portfolio error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Public: get landing page content (used by the landing page)
app.get('/api/content', async (req, res) => {
  try {
    let doc = await SiteContent.findOne({ key: 'landing' });
    if (!doc) {
      doc = await new SiteContent({ key: 'landing' }).save();
    }
    res.json({ content: doc });
  } catch (error) {
    console.error('Content get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: update landing page content (any fields present are merged)
app.put('/api/content', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    let doc = await SiteContent.findOne({ key: 'landing' });
    if (!doc) {
      doc = new SiteContent({ key: 'landing' });
    }
    const patch = req.body || {};
    ['hero', 'about', 'cta', 'reviewsHeading', 'partnersHeading', 'footer', 'contactInfo', 'contactHeading', 'branding']
      .forEach((k) => {
        if (patch[k] && typeof patch[k] === 'object') doc[k] = { ...doc[k].toObject?.() , ...patch[k] };
      });
    ['heroStats', 'navLinks', 'features', 'collaborators']
      .forEach((k) => {
        if (Array.isArray(patch[k])) doc[k] = patch[k];
      });
    await doc.save();
    res.json({ message: 'Content updated', content: doc });
  } catch (error) {
    console.error('Content update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: reset landing content to defaults.
// With { section } it only resets that one section; without it, everything.
app.post('/api/content/reset', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const { section } = req.body || {};

    if (section) {
      if (!(section in DEFAULT_SITE)) {
        return res.status(400).json({ message: 'Unknown section' });
      }
      let doc = await SiteContent.findOne({ key: 'landing' });
      if (!doc) doc = new SiteContent({ key: 'landing', ...cloneDefaults() });
      doc[section] = cloneDefaults()[section];
      await doc.save();
      const out = await SiteContent.findOne({ key: 'landing' });
      return res.json({ message: `${section} reset to defaults`, content: out });
    }

    await SiteContent.deleteOne({ key: 'landing' });
    const doc = await new SiteContent({ key: 'landing', ...cloneDefaults() }).save();
    res.json({ message: 'Content reset to defaults', content: doc });
  } catch (error) {
    console.error('Content reset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Public: get approved reviews (shown on the landing page)
app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ approved: true }).sort({ createdAt: -1 });
    res.json({ reviews });
  } catch (error) {
    console.error('Reviews get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Public: submit a review (pending admin approval)
app.post('/api/reviews', async (req, res) => {
  try {
    const { name, rating, role, message } = req.body || {};
    if (!name || !message) {
      return res.status(400).json({ message: 'Name and message are required' });
    }
    const review = new Review({
      name: String(name).slice(0, 100),
      rating: Math.min(5, Math.max(1, Number(rating) || 5)),
      role: String(role || '').slice(0, 100),
      message: String(message).slice(0, 1000),
    });
    await review.save();
    res.status(201).json({ message: 'Review submitted for approval', review });
  } catch (error) {
    console.error('Review submit error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: list all reviews (approved + pending), newest first
app.get('/api/admin/reviews', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const reviews = await Review.find().sort({ createdAt: -1 });
    res.json({ reviews });
  } catch (error) {
    console.error('Admin reviews get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: approve or reject a review
app.patch('/api/admin/reviews/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const { approved } = req.body || {};
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { approved: approved === true },
      { returnDocument: 'after' }
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ review });
  } catch (error) {
    console.error('Review update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: delete a review
app.delete('/api/admin/reviews/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ message: 'Review deleted' });
  } catch (error) {
    console.error('Review delete error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Grant catalog — hubs create grants that their talent pool can discover.
const Grant = mongoose.model('Grant', new mongoose.Schema({
  hubId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  amount: { type: String, default: '' },
  deadline: { type: String, default: '' },
  eligibility: { type: String, default: '' },
  link: { type: String, default: '' },
  tags: { type: [String], default: [] },
  status: { type: String, enum: ['open', 'closed', 'upcoming'], default: 'open' },
  createdAt: { type: Date, default: Date.now },
}));

// ── Grant Catalog CRUD (hub only) ────────────────────────────────────────────

// List grants for this hub
app.get('/api/hub/grants', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'hub') return res.status(403).json({ message: 'Hub access only' });
    const grants = await Grant.find({ hubId: req.user.userId }).sort({ createdAt: -1 });
    res.json({ grants });
  } catch (error) {
    console.error('Grant list error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a grant
app.post('/api/hub/grants', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'hub') return res.status(403).json({ message: 'Hub access only' });
    const { title, description, amount, deadline, eligibility, link, tags, status } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ message: 'Title is required' });
    const grant = new Grant({
      hubId: req.user.userId,
      title: title.trim(),
      description: description || '',
      amount: amount || '',
      deadline: deadline || '',
      eligibility: eligibility || '',
      link: link || '',
      tags: Array.isArray(tags) ? tags : [],
      status: status || 'open',
    });
    await grant.save();
    res.status(201).json({ grant });
  } catch (error) {
    console.error('Grant create error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a grant
app.put('/api/hub/grants/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'hub') return res.status(403).json({ message: 'Hub access only' });
    const grant = await Grant.findOne({ _id: req.params.id, hubId: req.user.userId });
    if (!grant) return res.status(404).json({ message: 'Grant not found' });
    const { title, description, amount, deadline, eligibility, link, tags, status } = req.body;
    if (title !== undefined) grant.title = title.trim();
    if (description !== undefined) grant.description = description;
    if (amount !== undefined) grant.amount = amount;
    if (deadline !== undefined) grant.deadline = deadline;
    if (eligibility !== undefined) grant.eligibility = eligibility;
    if (link !== undefined) grant.link = link;
    if (tags !== undefined) grant.tags = Array.isArray(tags) ? tags : [];
    if (status !== undefined) grant.status = status;
    await grant.save();
    res.json({ grant });
  } catch (error) {
    console.error('Grant update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a grant
app.delete('/api/hub/grants/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'hub') return res.status(403).json({ message: 'Hub access only' });
    const grant = await Grant.findOneAndDelete({ _id: req.params.id, hubId: req.user.userId });
    if (!grant) return res.status(404).json({ message: 'Grant not found' });
    res.json({ message: 'Grant deleted' });
  } catch (error) {
    console.error('Grant delete error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Payment / Monnify Integration ────────────────────────────────────────────

const fetch = globalThis.fetch || (() => { throw new Error('fetch not available'); });

// Site-level configuration (Monnify keys, pricing, etc.)
const SiteConfig = mongoose.model('SiteConfig', new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: {} },
}));

// Tracks which employer has paid to chat with which seeker.
const ChatPayment = mongoose.model('ChatPayment', new mongoose.Schema({
  employerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seekerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  paymentRef: { type: String, default: '' },
  monnifyRef: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date },
}));

async function getConfig(key) {
  const doc = await SiteConfig.findOne({ key });
  return doc ? doc.value : null;
}
async function setConfig(key, value) {
  await SiteConfig.findOneAndUpdate({ key }, { key, value }, { upsert: true });
}

const MONNIFY_BASE_PROD = 'https://api.monnify.com';
const MONNIFY_BASE_SANDBOX = 'https://sandbox.monnify.com';

async function monnifyToken() {
  const cfg = await getConfig('monnify');
  if (!cfg?.apiKey || !cfg?.secretKey) return null;
  const baseUrl = cfg.environment === 'sandbox' ? MONNIFY_BASE_SANDBOX : MONNIFY_BASE_PROD;
  const auth = Buffer.from(`${cfg.apiKey}:${cfg.secretKey}`).toString('base64');
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return null;
  const d = await res.json();
  return { token: d.responseBody?.accessToken || null, baseUrl };
}

// ── Admin: user management ─────────────────────────────────────────────────

// List every account with optional role/status/active filters and free-text
// search. Returns the pending count too (for the moderation badge).
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const { role, status, active, q } = req.query;
    const filter = {};
    if (role && role !== 'all') filter.role = role;
    if (status && status !== 'all') filter.status = status;
    if (active !== undefined && active !== '') filter.active = active === 'true';
    if (q && q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { company: rx }, { hubRef: rx }];
    }
    const users = await User.find(filter)
      .select('-password -e2ePriv')
      .sort({ createdAt: -1 });
    const pendingCount = await User.countDocuments({ status: 'pending' });
    res.json({ users: users.map(publicUser), pendingCount });
  } catch (error) {
    console.error('Admin users list error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: approve, reject, deactivate or reactivate an account.
app.patch('/api/admin/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const { status, active } = req.body || {};
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (String(user._id) === String(req.user.userId)) {
      return res.status(400).json({ message: 'You cannot change your own account' });
    }
    if (status !== undefined) {
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      user.status = status;
    }
    if (active !== undefined) user.active = active === true;

    await user.save();

    // Once an org is approved and active, welcome it as a landing partner.
    if (user.status === 'approved' && user.active !== false) {
      await syncSitePartner(user);
    }
    res.json({ user: publicUser(user) });
  } catch (error) {
    console.error('Admin user update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: permanently delete an account (admin accounts are protected).
app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Admin accounts cannot be deleted' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Admin user delete error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Interviews (admin video-call onboarding) ────────────────────────────────

function publicInterview(i) {
  return {
    id: i._id,
    userId: i.userId,
    proposedDate: i.proposedDate,
    proposedTime: i.proposedTime,
    notes: i.notes,
    status: i.status,
    adminNotes: i.adminNotes,
    scheduledAt: i.scheduledAt,
    startAt: i.startAt,
    endAt: i.endAt,
    createdAt: i.createdAt,
  };
}

// Both the interview owner and any admin may operate on an interview.
function interviewAccessOk(req, interview) {
  return String(interview.userId) === String(req.user.userId) || req.user.role === 'admin';
}

// ── Interview email drafts ──────────────────────────────────────────────────
function emailShell(title, body) {
  return `<!doctype html><body style="margin:0;padding:0;background:#f6f5f2;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:18px 24px;background:#f5c518;font-weight:bold;font-size:18px;color:#141921;">TalentriX</td></tr>
          <tr><td style="padding:28px 24px">
            <h1 style="margin:0 0 12px;font-size:20px;color:#141921;">${title}</h1>
            ${body}
          </td></tr>
        </table>
      </td></tr>
    </table></body></html>`;
}

function bookingSummary(iv) {
  const start = interviewStart(iv);
  const when = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(start);
  return `<p style="margin:0 0 18px;color:#4b5262;font-size:14px;line-height:1.6;background:#f6f5f2;border-radius:10px;padding:14px 16px;">
    <strong style="display:block;color:#141921;font-size:15px;">${when} (Nigeria time)</strong>
    <span style="display:block;margin-top:2px;">Booking window: 3 hours, from ${iv.proposedTime} WAT.</span>
    ${iv.notes ? `<span style="display:block;margin-top:6px;font-style:italic;">Notes: ${iv.notes}</span>` : ''}
  </p>`;
}

// ── Housekeeping: expire stale proposals + fire 1-hour reminders ──────────
async function expireStaleProposals() {
  const now = new Date();
  const stale = await Interview.find({ status: 'proposed', startAt: { $lt: now } });
  for (const iv of stale) {
    const updated = await Interview.updateOne(
      { _id: iv._id, status: 'proposed' },
      { $set: { status: 'expired' } }
    );
    if (updated.modifiedCount === 0) continue; // another sweep already did it
    const u = await User.findById(iv.userId);
    if (u) {
      void sendMail({
        to: u.email,
        subject: 'Your interview time passed — choose a new one',
        html: emailShell('Your proposed interview time has passed', `
          <p style="margin:0 0 16px;color:#4b5262;font-size:14px;line-height:1.6;">Hi ${u.name || 'there'},</p>
          <p style="margin:0 0 16px;color:#4b5262;font-size:14px;line-height:1.6;">The admin hasn't confirmed the slot below before it passed, so it has been released.</p>
          ${bookingSummary(iv)}
          <p style="margin:0 0 22px;color:#4b5262;font-size:14px;line-height:1.6;">Please log in and pick a new date and time so we can schedule your call.</p>
          <a href="${FRONTEND_URL}/interview" style="display:inline-block;padding:12px 22px;background:#f5c518;color:#141921;text-decoration:none;font-weight:bold;border-radius:10px;font-size:14px;">Pick a new time</a>`),
      });
    }
  }
}

async function sendInterviewReminders() {
  const now = new Date();
  const inAnHour = new Date(now.getTime() + 60 * 60 * 1000);
  const due = await Interview.find({
    status: 'accepted',
    startAt: { $gt: now, $lte: inAnHour },
    reminderSentAt: null,
  });
  for (const iv of due) {
    const u = await User.findById(iv.userId);
    const admin = await User.findOne({ role: 'admin', active: true });
    if (u) {
      void sendMail({
        to: u.email,
        subject: 'Reminder: your interview starts in about an hour',
        html: emailShell('Interview reminder', `
          <p style="margin:0 0 16px;color:#4b5262;font-size:14px;line-height:1.6;">Hi ${u.name || 'there'}, just a heads-up about your upcoming onboarding call:</p>
          ${bookingSummary(iv)}
          <p style="margin:0 0 22px;color:#4b5262;font-size:14px;line-height:1.6;">Join from your dashboard when it's time — make sure your camera and microphone are ready.</p>
          <a href="${FRONTEND_URL}/interview" style="display:inline-block;padding:12px 22px;background:#f5c518;color:#141921;text-decoration:none;font-weight:bold;border-radius:10px;font-size:14px;">Open interview page</a>`),
      });
    }
    if (admin) {
      void sendMail({
        to: admin.email,
        subject: `Reminder: interview with ${u ? u.name : 'a user'} in about an hour`,
        html: emailShell('Interview reminder — admin', `
          <p style="margin:0 0 16px;color:#4b5262;font-size:14px;line-height:1.6;">Hi ${admin.name || 'Admin'}, an onboarding call is coming up:</p>
          ${bookingSummary(iv)}
          ${u ? `<p style="margin:0 0 22px;color:#4b5262;font-size:14px;line-height:1.6;">User: <strong>${u.name}</strong> &lt;${u.email}&gt;</p>` : ''}
          <a href="${FRONTEND_URL}/admin" style="display:inline-block;padding:12px 22px;background:#f5c518;color:#141921;text-decoration:none;font-weight:bold;border-radius:10px;font-size:14px;">Open admin panel</a>`),
      });
    }
    await Interview.updateOne({ _id: iv._id }, { $set: { reminderSentAt: new Date() } });
  }
}

async function interviewHousekeeping() {
  try {
    await expireStaleProposals();
    await sendInterviewReminders();
  } catch (error) {
    console.error('Interview housekeeping error:', error.message);
  }
}

// User: propose a date/time for the admin video interview (Nigeria/WAT time).
app.post('/api/interviews/propose', authenticateToken, async (req, res) => {
  try {
    const { proposedDate, proposedTime, notes } = req.body || {};
    const dateStr = String(proposedDate || '').slice(0, 10);
    const timeStr = String(proposedTime || '').toString().slice(0, 5);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ message: 'Please pick a valid date for the interview.' });
    }
    if (!/^(\d{2}):(\d{2})$/.test(timeStr)) {
      return res.status(400).json({ message: 'Please pick a valid time for the interview.' });
    }

    const start = nigeriaWallToUtc(dateStr, timeStr);
    const end = new Date(start.getTime() + INTERVIEW_BLOCK_HOURS * 3600 * 1000);
    if (Number.isNaN(start.getTime()) || start <= new Date()) {
      return res.status(400).json({ message: 'That time has already passed. Please pick a future time.' });
    }

    // Rescheduling: cancel the user's own previous unfinished booking first.
    await Interview.updateMany(
      { userId: req.user.userId, status: { $in: ['proposed', 'accepted', 'rejected'] } },
      { $set: { status: 'cancelled' } }
    );

    // Shared calendar: every booking takes a 3-hour window, so another user's
    // proposal/accepted call that overlaps this slot makes it unavailable.
    const clash = await Interview.findOne({
      userId: { $ne: req.user.userId },
      status: { $in: ['proposed', 'accepted'] },
      startAt: { $lt: end },
      endAt: { $gt: start },
    });
    if (clash) {
      return res.status(400).json({
        message: 'That time falls inside a 3-hour block that is already booked. Please pick a different time.',
      });
    }

    const interview = await Interview.create({
      userId: req.user.userId,
      proposedDate: new Date(`${dateStr}T00:00:00Z`),
      proposedTime: timeStr,
      notes: (notes || '').toString().slice(0, 500),
      status: 'proposed',
      startAt: start,
      endAt: end,
    });

    // Notify everyone.
    const user = await User.findById(req.user.userId);
    const admin = await User.findOne({ role: 'admin', active: true });
    if (user) {
      void sendMail({
        to: user.email,
        subject: 'Your interview time was proposed',
        html: emailShell('We received your interview time', `
          <p style="margin:0 0 16px;color:#4b5262;font-size:14px;line-height:1.6;">Hi ${user.name || 'there'}, your proposed onboarding call is:</p>
          ${bookingSummary(interview)}
          <p style="margin:0 0 22px;color:#4b5262;font-size:14px;line-height:1.6;">The admin will confirm it. We'll email you the moment it's approved, and again an hour before the call.</p>
          <a href="${FRONTEND_URL}/interview" style="display:inline-block;padding:12px 22px;background:#f5c518;color:#141921;text-decoration:none;font-weight:bold;border-radius:10px;font-size:14px;">View your interview page</a>`),
      });
    }
    if (admin) {
      void sendMail({
        to: admin.email,
        subject: `New interview booking — ${user ? user.name : 'a user'}`,
        html: emailShell('New onboarding interview to confirm', `
          <p style="margin:0 0 16px;color:#4b5262;font-size:14px;line-height:1.6;">Hi ${admin.name || 'Admin'}, a new call has been proposed:</p>
          ${bookingSummary(interview)}
          ${user ? `<p style="margin:0 0 22px;color:#4b5262;font-size:14px;line-height:1.6;">User: <strong>${user.name}</strong> &lt;${user.email}&gt;</p>` : ''}
          <a href="${FRONTEND_URL}/admin" style="display:inline-block;padding:12px 22px;background:#f5c518;color:#141921;text-decoration:none;font-weight:bold;border-radius:10px;font-size:14px;">Open admin panel to confirm</a>`),
      });
    }

    res.status(201).json({ interview: publicInterview(interview) });
  } catch (error) {
    console.error('Interview propose error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// User: their interview (latest one, plus any history).
app.get('/api/interviews/me', authenticateToken, async (req, res) => {
  try {
    // Expire unapproved times that have passed so the user sees them as such.
    await expireStaleProposals();
    const interviews = await Interview.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json({ interviews: interviews.map(publicInterview) });
  } catch (error) {
    console.error('Interview me error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// User: shared calendar of occupied 3-hour blocks (all users + the admin).
app.get('/api/interviews/slots', authenticateToken, async (req, res) => {
  try {
    await expireStaleProposals();
    const now = new Date();
    const booked = await Interview.find({
      status: { $in: ['proposed', 'accepted'] },
      startAt: { $gte: now },
    });
    res.json({
      slots: booked.map((i) => ({
        id: i._id,
        userId: i.userId,
        start: i.startAt,
        end: i.endAt,
        status: i.status,
      })),
    });
  } catch (error) {
    console.error('Interview slots error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: all interviews (filterable by status).
app.get('/api/admin/interviews', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    await expireStaleProposals();
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    const interviews = await Interview.find(filter).sort({ createdAt: -1 });
    const users = await User.find({
      _id: { $in: interviews.map((i) => i.userId) },
    }).select('-password -e2ePriv');
    const userMap = new Map(users.map((u) => [String(u._id), publicUser(u)]));
    const pendingCount = await Interview.countDocuments({ status: 'proposed' });
    res.json({
      interviews: interviews.map((i) => ({
        ...publicInterview(i),
        user: userMap.get(String(i.userId)) || null,
      })),
      pendingCount,
    });
  } catch (error) {
    console.error('Admin interviews error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: accept/reject/cancel an interview, or mark it completed (which also
// unlocks the user's dashboard).
app.patch('/api/admin/interviews/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ message: 'Interview not found' });

    const { status, adminNotes } = req.body || {};
    if (!['proposed', 'accepted', 'rejected', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    interview.status = status;
    if (status === 'accepted') interview.scheduledAt = new Date();
    if (adminNotes !== undefined) interview.adminNotes = (adminNotes || '').toString().slice(0, 500);
    await interview.save();

    if (status === 'completed') {
      await User.updateOne({ _id: interview.userId }, { $set: { interviewDone: true } });
    }

    // Email the user about the decision (only when it changes the plan).
    if (status === 'accepted' || status === 'rejected') {
      const user = await User.findById(interview.userId);
      if (user) {
        const confirmed = status === 'accepted';
        void sendMail({
          to: user.email,
          subject: confirmed ? 'Your interview is confirmed 🎉' : 'Interview time not confirmed — please pick another',
          html: emailShell(
            confirmed ? 'Your interview is confirmed' : 'Your proposed time wasn\u2019t confirmed',
            confirmed
              ? `
                <p style="margin:0 0 16px;color:#4b5262;font-size:14px;line-height:1.6;">Hi ${user.name || 'there'}, great news — your onboarding call is booked:</p>
                ${bookingSummary(interview)}
                <p style="margin:0 0 22px;color:#4b5262;font-size:14px;line-height:1.6;">Join from your interview page when it's time. You'll also get a reminder an hour before.</p>
                <a href="${FRONTEND_URL}/interview" style="display:inline-block;padding:12px 22px;background:#f5c518;color:#141921;text-decoration:none;font-weight:bold;border-radius:10px;font-size:14px;">Open interview page</a>`
              : `
                <p style="margin:0 0 16px;color:#4b5262;font-size:14px;line-height:1.6;">Hi ${user.name || 'there'}, the admin couldn't confirm this slot:</p>
                ${bookingSummary(interview)}
                <p style="margin:0 0 22px;color:#4b5262;font-size:14px;line-height:1.6;">Please pick another date and time so we can get your call scheduled.</p>
                <a href="${FRONTEND_URL}/interview" style="display:inline-block;padding:12px 22px;background:#f5c518;color:#141921;text-decoration:none;font-weight:bold;border-radius:10px;font-size:14px;">Pick a new time</a>`
          ),
        });
      }
    }

    res.json({ interview: publicInterview(interview) });
  } catch (error) {
    console.error('Admin interview update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// WebRTC signaling — the two sides of an accepted interview exchange their
// offer/answer SDP + ICE candidates by polling these endpoints. Both sides
// must be the interview owner or an admin; signaling only opens once the
// interview has been accepted by the admin.
app.get('/api/interviews/:id/signal', authenticateToken, async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ message: 'Interview not found' });
    if (!interviewAccessOk(req, interview)) return res.status(403).json({ message: 'Not allowed' });
    if (interview.status === 'rejected' || interview.status === 'cancelled') {
      return res.status(400).json({ message: 'This interview is not active' });
    }
    const signals = await Signal.find({ interviewId: interview._id }).sort({ createdAt: 1 });
    const ices = await IceCandidate.find({ interviewId: interview._id }).sort({ createdAt: 1 });
    res.json({
      offer: signals.find((s) => s.kind === 'offer')?.sdp || '',
      answer: signals.find((s) => s.kind === 'answer')?.sdp || '',
      offerCandidates: ices.filter((c) => c.kind === 'offer').map((c) => c.candidate),
      answerCandidates: ices.filter((c) => c.kind === 'answer').map((c) => c.candidate),
    });
  } catch (error) {
    console.error('Signal get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/interviews/:id/signal', authenticateToken, async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ message: 'Interview not found' });
    if (!interviewAccessOk(req, interview)) return res.status(403).json({ message: 'Not allowed' });
    if (interview.status === 'rejected' || interview.status === 'cancelled') {
      return res.status(400).json({ message: 'This interview is not active' });
    }
    const { kind, sdp } = req.body || {};
    if (!['offer', 'answer'].includes(kind) || !sdp) {
      return res.status(400).json({ message: 'Missing signal payload' });
    }
    // Keep one offer + one answer per interview.
    await Signal.deleteMany({ interviewId: interview._id, kind });
    const sig = await Signal.create({ interviewId: interview._id, kind, sdp });
    res.status(201).json({ signal: { id: sig._id, kind: sig.kind } });
  } catch (error) {
    console.error('Signal post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/interviews/:id/ice', authenticateToken, async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ message: 'Interview not found' });
    if (!interviewAccessOk(req, interview)) return res.status(403).json({ message: 'Not allowed' });
    const ices = await IceCandidate.find({ interviewId: interview._id }).sort({ createdAt: 1 });
    res.json({
      offerCandidates: ices.filter((c) => c.kind === 'offer').map((c) => c.candidate),
      answerCandidates: ices.filter((c) => c.kind === 'answer').map((c) => c.candidate),
    });
  } catch (error) {
    console.error('Ice get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/interviews/:id/ice', authenticateToken, async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ message: 'Interview not found' });
    if (!interviewAccessOk(req, interview)) return res.status(403).json({ message: 'Not allowed' });
    const { kind, candidate } = req.body || {};
    if (!['offer', 'answer'].includes(kind) || !candidate) {
      return res.status(400).json({ message: 'Missing ICE candidate' });
    }
    if (candidate.length > 20000) return res.status(413).json({ message: 'Candidate too large' });
    await IceCandidate.create({ interviewId: interview._id, kind, candidate });
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Ice post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Employer "Request Talent" + matching ────────────────────────────────────

function normalizeTag(t) {
  return String(t || '').toLowerCase().trim().replace(/[^a-z0-9+#.-]/g, ' ');
}

// Score every approved, active seeker against a talent request and rank them.
// Match % = skills (50%) + tools (30%) + role fit (20%).
async function matchTalentRequest(tr) {
  const reqSkills = (tr.skills || []).map(normalizeTag).filter(Boolean);
  const reqTools = (tr.tools || []).map(normalizeTag).filter(Boolean);
  const skillSet = new Set(reqSkills);
  const toolSet = new Set(reqTools);
  const roleTag = normalizeTag(tr.role || '');
  const roleWords = roleTag.split(' ').filter((w) => w.length > 2);

  const seekers = await User.find({ role: 'seeker', status: 'approved', active: true }).select('-password -e2ePriv');
  const results = seekers.map((s) => {
    const profileSkills = (s.skills || []).map(normalizeTag).filter(Boolean);
    const profileSet = new Set(profileSkills);
    const titleTag = normalizeTag(s.title || '');
    const summaryTag = normalizeTag(s.summary || '');

    // Skills — exact or fuzzy substring match.
    let skillHits = 0;
    for (const rs of skillSet) {
      if (profileSet.has(rs)) skillHits += 1;
      else if (profileSkills.some((p) => p.includes(rs) || rs.includes(p))) skillHits += 0.75;
      else if (titleTag.includes(rs)) skillHits += 0.5;
    }
    const skillScore = skillSet.size ? skillHits / skillSet.size : 0;

    // Tools — exact, fuzzy, or present in the headline/title.
    let toolHits = 0;
    for (const rt of toolSet) {
      if (profileSet.has(rt)) toolHits += 1;
      else if (profileSkills.some((p) => p.includes(rt) || rt.includes(p))) toolHits += 0.75;
      else if (titleTag.includes(rt) || summaryTag.includes(rt)) toolHits += 0.5;
    }
    const toolScore = toolSet.size ? toolHits / toolSet.size : 0;

    // Role fit — headline matches the requested role title / keywords.
    let roleScore = 0;
    if (roleTag && roleWords.length) {
      if (titleTag.includes(roleTag)) roleScore = 1;
      else if (roleWords.some((w) => titleTag.includes(w) || summaryTag.includes(w))) roleScore = 0.8;
      else if (roleWords.some((w) => summaryTag.includes(w))) roleScore = 0.6;
    } else {
      roleScore = 0.5;
    }

    const match = Math.round(skillScore * 50 + toolScore * 30 + roleScore * 20);

    const matches = {
      skills: skillSet.size ? Math.min(1, skillHits / skillSet.size) : 0,
      tools: toolSet.size ? Math.min(1, toolHits / toolSet.size) : 0,
      role: roleScore >= 0.8 ? 1 : roleScore >= 0.5 ? 0.5 : 0,
    };

    return {
      seeker: lockContacts(publicUser(s)),
      match,
      skillMatches: Math.min(skillSet.size, Math.round(skillHits)),
      skillCount: reqSkills.length,
      toolMatches: Math.min(toolSet.size, Math.round(toolHits)),
      toolCount: reqTools.length,
      breakdown: matches,
    };
  });

  results.sort((a, b) => b.match - a.match);
  return results;
}

// Employer: create a talent request.
app.post('/api/talent-requests', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Only employer accounts can request talent' });
    const { role, title, location, type, description, skills, tools, requirements, budget } = req.body || {};
    if (!role || !String(role).trim()) {
      return res.status(400).json({ message: 'Role is required' });
    }
    const tr = await TalentRequest.create({
      employerId: req.user.userId,
      role: String(role).trim(),
      title: String(title || '').trim(),
      location: String(location || '').trim(),
      type: String(type || 'Full-time').trim(),
      description: String(description || '').trim(),
      skills: Array.isArray(skills) ? skills.map((x) => String(x).trim()).filter(Boolean) : [],
      tools: Array.isArray(tools) ? tools.map((x) => String(x).trim()).filter(Boolean) : [],
      requirements: Array.isArray(requirements) ? requirements.map((x) => String(x).trim()).filter(Boolean) : [],
      budget: String(budget || '').trim(),
      status: 'open',
      results: [],
    });
    res.status(201).json({ request: tr });
  } catch (error) {
    console.error('Talent request create error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Employer: list their talent requests (with a cached match summary).
app.get('/api/talent-requests', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Only employer accounts can request talent' });
    const requests = await TalentRequest.find({ employerId: req.user.userId }).sort({ createdAt: -1 });
    const counts = requests.map((tr) => ({
      id: tr._id,
      ...(Array.isArray(tr.results) && tr.results.length
        ? { topMatch: tr.results[0].match, matchedCount: tr.results.length }
        : { topMatch: null, matchedCount: 0 }),
    }));
    res.json({ requests, summaries: counts });
  } catch (error) {
    console.error('Talent request list error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Employer: view one request plus its matches.
app.get('/api/talent-requests/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Only employer accounts can request talent' });
    const tr = await TalentRequest.findById(req.params.id);
    if (!tr || String(tr.employerId) !== String(req.user.userId)) {
      return res.status(404).json({ message: 'Request not found' });
    }
    res.json({ request: tr });
  } catch (error) {
    console.error('Talent request get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Employer: run (or refresh) the matching for a request.
app.post('/api/talent-requests/:id/match', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Only employer accounts can request talent' });
    const tr = await TalentRequest.findById(req.params.id);
    if (!tr || String(tr.employerId) !== String(req.user.userId)) {
      return res.status(404).json({ message: 'Request not found' });
    }
    const results = await matchTalentRequest(tr);
    tr.results = results;
    await tr.save();
    res.json({ request: tr, results });
  } catch (error) {
    console.error('Talent request match error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Employer: close / reopen a request.
app.patch('/api/talent-requests/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Only employer accounts can request talent' });
    const tr = await TalentRequest.findById(req.params.id);
    if (!tr || String(tr.employerId) !== String(req.user.userId)) {
      return res.status(404).json({ message: 'Request not found' });
    }
    if (req.body.status && ['open', 'closed'].includes(req.body.status)) tr.status = req.body.status;
    await tr.save();
    res.json({ request: tr });
  } catch (error) {
    console.error('Talent request update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Admin: Monnify config ─────────────────────────────────────────────────

app.get('/api/admin/config/:key', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const val = await getConfig(req.params.key);
    res.json({ value: val || {} });
  } catch (error) {
    console.error('Config get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/admin/config/:key', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    await setConfig(req.params.key, req.body.value || {});
    res.json({ message: 'Config saved' });
  } catch (error) {
    console.error('Config set error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: reset own login details (name, email, password). The current password
// is always required so a leaked admin token can't silently hijack the account.
app.put('/api/admin/me/credentials', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const { currentPassword, newPassword, newEmail, name } = req.body || {};
    const admin = await User.findById(req.user.userId);
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    const ok = await bcrypt.compare(String(currentPassword || ''), admin.password);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });

    if (newPassword !== undefined && newPassword !== '') {
      if (String(newPassword).length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters' });
      }
      admin.password = await bcrypt.hash(String(newPassword), 10);
    }

    if (newEmail !== undefined && String(newEmail || '').trim()) {
      const cleanEmail = String(newEmail).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ message: 'Please provide a valid email address' });
      }
      const taken = await User.findOne({ email: cleanEmail, _id: { $ne: admin._id } });
      if (taken) return res.status(400).json({ message: 'That email is already in use by another account' });
      admin.email = cleanEmail;
    }

    if (name !== undefined && String(name || '').trim()) {
      admin.name = String(name).trim();
    }

    await admin.save();
    res.json({ user: publicUser(admin), message: 'Login details updated' });
  } catch (error) {
    console.error('Admin credentials error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Public ICE/TURN servers for WebRTC signaling ───────────────────────────
// Any authenticated participant (not just admins) must read the same STUN/TURN
// configuration so both sides of a call negotiate with identical ICE servers.
app.get('/api/interview/iceServers', authenticateToken, async (req, res) => {
  try {
    const val = await getConfig('iceServers');
    res.json({ value: val || {} });
  } catch (error) {
    console.error('ICE servers get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Payment endpoints ──────────────────────────────────────────────────────

// Get chat price for display
app.get('/api/payment/price', authenticateToken, async (req, res) => {
  try {
    const cfg = await getConfig('chatPricing');
    res.json({
      amount: cfg?.amount || 5000,
      vatRate: cfg?.vatRate || 0.075,
      serviceCharge: cfg?.serviceCharge || 100,
      currency: cfg?.currency || 'NGN',
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Check if employer has paid for a specific seeker
app.get('/api/payment/check/:seekerId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Employer only' });
    const existing = await ChatPayment.findOne({
      employerId: req.user.userId,
      seekerId: req.params.seekerId,
      status: 'paid',
    });
    res.json({ paid: !!existing });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Initialize a payment (creates Monnify transaction, returns checkout URL)
app.post('/api/payment/init', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Employer only' });
    const { seekerId } = req.body;
    if (!seekerId) return res.status(400).json({ message: 'seekerId required' });

    // Check if already paid
    const existing = await ChatPayment.findOne({
      employerId: req.user.userId, seekerId, status: 'paid',
    });
    if (existing) return res.json({ paid: true });

    const cfg = await getConfig('monnify');
    if (!cfg?.apiKey || !cfg?.secretKey || !cfg?.contractCode) {
      return res.status(503).json({ message: 'Payment not configured. Contact admin.' });
    }
    const pricing = await getConfig('chatPricing');
    const base = pricing?.amount || 5000;
    const vatRate = pricing?.vatRate || 0.075;
    const serviceCharge = pricing?.serviceCharge || 100;
    const total = Math.round(base + base * vatRate + serviceCharge);

    const employer = await User.findById(req.user.userId);
    const seeker = await User.findById(seekerId);
    if (!seeker) return res.status(404).json({ message: 'Seeker not found' });

    const paymentRef = `TB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create pending record
    await ChatPayment.findOneAndUpdate(
      { employerId: req.user.userId, seekerId },
      { employerId: req.user.userId, seekerId, amount: total, paymentRef, status: 'pending' },
      { upsert: true },
    );

    const monnifyAuth = await monnifyToken();
    if (!monnifyAuth?.token) return res.status(503).json({ message: 'Could not connect to payment provider.' });
    const { token: monoToken, baseUrl } = monnifyAuth;

    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/employer?payment=callback`;

    const monoRes = await fetch(`${baseUrl}/api/v1/merchant/transactions/init-transaction`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${monoToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: total,
        currencyCode: pricing?.currency || 'NGN',
        paymentReference: paymentRef,
        paymentDescription: `Chat access - ${employer.name} to ${seeker.name}`,
        contractCode: cfg.contractCode,
        redirectUrl,
        customerEmail: employer.email,
        customerName: employer.name,
        paymentMethods: ['CARD', 'ACCOUNT_TRANSFER'],
      }),
    });

    const monoData = await monoRes.json();
    if (!monoData.responseBody?.checkoutUrl) {
      console.error('Monnify init error:', JSON.stringify(monoData));
      return res.status(502).json({
        message: 'Could not initialize payment.',
        detail: monoData.responseMessage || monoData.message || 'Unknown Monnify error',
      });
    }

    res.json({
      checkoutUrl: monoData.responseBody.checkoutUrl,
      amount: total,
      paymentRef,
    });
  } catch (error) {
    console.error('Payment init error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify payment after redirect
app.get('/api/payment/verify/:paymentRef', authenticateToken, async (req, res) => {
  try {
    const record = await ChatPayment.findOne({ paymentRef: req.params.paymentRef });
    if (!record) return res.status(404).json({ message: 'Payment not found' });
    if (record.status === 'paid') return res.json({ paid: true });

    const cfg = await getConfig('monnify');
    if (!cfg?.apiKey || !cfg?.secretKey) return res.status(503).json({ message: 'Payment not configured.' });

    const monnifyAuth = await monnifyToken();
    if (!monnifyAuth?.token) return res.status(503).json({ message: 'Could not connect to payment provider.' });
    const { token: monoToken, baseUrl } = monnifyAuth;

    const monoRes = await fetch(
      `${baseUrl}/api/v1/merchant/transactions/query?paymentReference=${record.paymentRef}`,
      { headers: { Authorization: `Bearer ${monoToken}` } },
    );
    const monoData = await monoRes.json();
    const tx = monoData.responseBody;
    if (tx && tx.paymentStatus === 'PAID') {
      record.status = 'paid';
      record.monnifyRef = tx.transactionReference || '';
      record.paidAt = new Date();
      await record.save();
      return res.json({ paid: true });
    }
    res.json({ paid: false });
  } catch (error) {
    console.error('Payment verify error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Monnify webhook
app.post('/api/payment/webhook', async (req, res) => {
  try {
    const body = req.body;
    const ref = body.paymentReference || body.eventData?.paymentReference;
    if (!ref) return res.status(200).json({ ok: true });

    const record = await ChatPayment.findOne({ paymentRef: ref });
    if (!record) return res.status(200).json({ ok: true });

    const status = body.eventData?.paymentStatus || body.paymentStatus;
    if (status === 'PAID') {
      record.status = 'paid';
      record.monnifyRef = body.eventData?.transactionReference || '';
      record.paidAt = new Date();
      await record.save();
    } else if (status === 'FAILED') {
      record.status = 'failed';
      await record.save();
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({ ok: true });
  }
});

// List all payments for the current employer
app.get('/api/payment/my-payments', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Employer only' });
    const payments = await ChatPayment.find({ employerId: req.user.userId, status: 'paid' })
      .select('seekerId amount paidAt')
      .lean();
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'TalentriX API' });
});

// Serve the built frontend (production) with an SPA fallback so direct URL
// entry (e.g. /dashboard/seeker) works even when served from this server.
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});