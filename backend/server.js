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

// The platform's outgoing mail. The admin can override delivery from the
// panel (SiteConfig('email')); anything unset falls back to the env SMTP.
// Env credentials beat nothing, so development without a server still works.
async function platformMailConfig() {
  try {
    const cfg = (await getConfig('email')) || {};
    if (cfg.host && (cfg.user || cfg.email) && cfg.password) {
      const user = String(cfg.user || cfg.email).trim();
      return {
        name: String(cfg.fromName || 'TalentriX').trim() || 'TalentriX',
        addr: user || SMTP_USER || 'noreply@talentri-x.vercel.app',
        transport: nodemailer.createTransport({
          host: cfg.host,
          port: Number(cfg.port || 587),
          secure: !!cfg.secure,
          auth: { user, pass: decryptSecret(cfg.password) },
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 30000,
        }),
      };
    }
  } catch {
    // DB unavailable yet — fall through to env credentials.
  }
  if (transporter) {
    return {
      name: 'TalentriX',
      addr: SMTP_USER || 'noreply@talentri-x.vercel.app',
      transport: transporter,
    };
  }
  return null;
}

async function sendMail({ to, subject, html }) {
  if (!to) return false;
  try {
    const conf = await platformMailConfig();
    if (!conf) {
      console.log(`[email:skipped] 🕮 to=${to} subject="${subject}"`);
      return false;
    }
    await conf.transport.sendMail({ from: `"${conf.name}" <${conf.addr}>`, to, subject, html });
    console.log(`[email:sent] to=${to} subject="${subject}"`);
    return true;
  } catch (error) {
    console.error('[email:error]', error.message);
    return false;
  }
}

// ── Account verification & 2FA (email codes) ────────────────────────────────
// 6-digit codes are bcrypt-hashed before storage so the DB alone can't reveal
// them. Codes expire after 10 minutes and an account can make 5 attempts.

function maskEmail(email) {
  if (!email) return '';
  const [a, b] = String(email).split('@');
  if (!b) return '•••';
  const head = a.slice(0, Math.min(2, a.length));
  return `${head}${'•'.repeat(Math.max(1, a.length - 2))}@${b}`;
}

async function generateOtp(user, purpose) {
  const code = String(nodeCrypto.randomInt(100000, 1000000));
  user.otp = {
    hash: await bcrypt.hash(code, 6),
    expires: new Date(Date.now() + 10 * 60 * 1000),
    purpose,
    attempts: 0,
  };
  await user.save();
  return code;
}

async function sendOtpEmail(user, purpose) {
  const code = await generateOtp(user, purpose);
  const isLogin = purpose === 'login';
  const subject = isLogin ? 'Your TalentriX login code' : 'Verify your TalentriX account';
  const html = otpEmailHtml(code, purpose);
  const sent = await sendMail({ to: user.email, subject, html });
  // When delivery isn't configured the code is returned so development still
  // works; when mail is working the code is only ever delivered by email.
  return { sent, code: sent ? '' : code };
}

const OTP_LOGIN_MSGS = {
  login: {
    title: 'Login code',
    lead: 'We received a request to sign in to your TalentriX account. Enter the code below to complete the sign-in. The code expires in 10 minutes.',
  },
  verify: {
    title: 'Verify your account',
    lead: 'Almost there — use the code below to verify your email address and finish activating your account. The code expires in 10 minutes.',
  },
  reset: {
    title: 'Password reset code',
    lead: 'Use the code below to reset your TalentriX password. The code expires in 10 minutes.',
  },
};

function otpEmailHtml(code, purpose) {
  const m = OTP_LOGIN_MSGS[purpose] || OTP_LOGIN_MSGS.login;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#f4f1ea;">
  <div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1c2333;">
    <div style="background:#f9b739;height:4px;border-radius:0 0 4px 4px;"></div>
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px;">
      <div style="font-size:20px;font-weight:bold;color:#1c2333;">TalentriX</div>
      <h1 style="font-size:22px;margin:24px 0 8px;color:#1c2333;">${esc(m.title)}</h1>
      <p style="font-size:14px;line-height:1.6;color:#4b5262;margin:0 0 24px;">${esc(m.lead)}</p>
      <div style="background:#f4f1ea;border-radius:12px;padding:24px;text-align:center;">
        <div style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#1c2333;">${esc(code)}</div>
      </div>
      <p style="font-size:12px;line-height:1.6;color:#8a90a0;margin:24px 0 0;">
        If you didn't request this, you can safely ignore this email — no one else can use the code.
      </p>
    </div>
  </div>
</body></html>`;
}

async function checkOtp(user, code, purpose) {
  const otp = user.otp || {};
  if (otp.purpose !== purpose) {
    return { ok: false, error: 'No active code for this step. Request a new one.' };
  }
  const exp = otp.expires ? new Date(otp.expires) : null;
  if (!exp || exp.getTime() < Date.now()) {
    return { ok: false, error: 'This code has expired. Request a new one.' };
  }
  if ((otp.attempts || 0) >= 5) {
    return { ok: false, error: 'Too many failed attempts. Request a new code.' };
  }
  const matches = await bcrypt.compare(String(code || '').trim(), otp.hash || '');
  if (!matches) {
    user.otp = { ...user.otp, attempts: (otp.attempts || 0) + 1 };
    await user.save();
    return { ok: false, error: `Incorrect code. ${5 - user.otp.attempts} attempts left.` };
  }
  user.otp = { hash: '', expires: null, purpose: '', attempts: 0 };
  await user.save();
  return { ok: true };
}

// Find the user a code belongs to: prefer the Bearer token (registration flow
// / dashboard), otherwise fall back to email + role from the request body.
async function resolveOtpUser(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    try {
      const payload = jwt.verify(String(authHeader).replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET);
      const u = await User.findById(payload.userId);
      if (u) return { user: u, viaToken: true };
    } catch {
      // invalid token — fall through to email+role
    }
  }
  const { email, role } = req.body || {};
  if (email && role) {
    const u = await User.findOne({ email: String(email).trim().toLowerCase(), role });
    if (u) return { user: u, viaToken: false };
  }
  return null;
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

  // Email verification & two-factor authentication. Every new account starts
  // unverified and with 2FA switched on, so both sign-up and every login
  // require a fresh 6-digit code sent to the account email.
  emailVerified: { type: Boolean, default: false },
  twoFactorEnabled: { type: Boolean, default: false },
  // When the user accepted the Terms & Conditions during sign-up.
  termsAcceptedAt: { type: Date, default: null },
  // The single active OTP (bcrypt-hashed) for verification / 2FA / resets.
  otp: {
    hash: { type: String, default: '' },
    expires: { type: Date, default: null },
    purpose: { type: String, enum: ['', 'verify', 'login', 'reset'], default: '' },
    attempts: { type: Number, default: 0 },
  },

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
    emailVerified: u.emailVerified === true,
    twoFactorEnabled: u.twoFactorEnabled === true,
    termsAcceptedAt: u.termsAcceptedAt || null,
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

// Build a map of hubId → display name for a set of user documents, so
// talent listings can show the name of the hub a seeker registered through
// instead of a generic "via hub link" label.
async function hubNameMapFor(userDocs) {
  const ids = [...new Set(userDocs.map((u) => (u.hubId ? String(u.hubId) : '')).filter(Boolean))];
  if (!ids.length) return new Map();
  const hubs = await User.find({ _id: { $in: ids } }).select('name company');
  return new Map(hubs.map((h) => [String(h._id), h.company || h.name]));
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

  // Employers no longer need admin approval — approve any that are still
  // pending so they aren't locked out of their dashboard.
  await User.updateMany(
    { role: 'employer', status: 'pending' },
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

  // ── Migration: overwrite stale defaults from older builds ──
  // If the hero badge is still the old AI-powered copy, all text content
  // predates the verified-talent rewrite and should be force-replaced so
  // the landing page no longer flickers between old and new on reload.
  const STALE_HERO_BADGE = 'AI-POWERED RECRUITMENT';
  if (doc.hero && doc.hero.badge === STALE_HERO_BADGE) {
    const fresh = cloneDefaults();
    for (const k of Object.keys(fresh)) {
      doc[k] = fresh[k];
    }
    await doc.save();
    console.log('Migrated stale site content to verified-talent defaults');
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

    // Sign-up requires explicit consent to the Terms & Conditions.
    if (req.body.termsAccepted !== true && String(req.body.termsAccepted || '') !== 'true') {
      return res.status(400).json({ message: 'You must accept the Terms & Conditions to create an account.' });
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

    const user = new User({
      name,
      email: String(email).trim().toLowerCase(),
      password,
      role,
      hubRef: hubCode,
      hubId,
      termsAcceptedAt: new Date(),
      twoFactorEnabled: true,
    });
    // Employers don't need admin approval — approve them at registration so
    // they can use the dashboard immediately.
    if (role === 'employer') {
      user.status = 'approved';
      user.active = true;
    }
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

    // New accounts must verify their email with a code before onboarding.
    const { sent, code } = await sendOtpEmail(user, 'verify');

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: publicUser(user),
      verification: { needed: true, sent, devCode: code || undefined },
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

    // Email verification + two-factor auth: require a fresh code for accounts
    // that haven't verified yet, and for anyone with 2FA switched on. The
    // admin operator account is exempt (it signs in through the admin panel).
    if (user.role !== 'admin' && (user.emailVerified !== true || user.twoFactorEnabled === true)) {
      const { sent, code } = await sendOtpEmail(user, 'login');
      return res.status(200).json({
        message: 'Enter the code sent to your email to continue.',
        requiresOtp: true,
        purpose: 'login',
        email: maskEmail(user.email),
        sent,
        devCode: code || undefined,
      });
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

// Verify an emailed code (account activation or login 2FA). Returns a fresh
// token for the login flow; for activation it returns the updated user — the
// session token from registration is already in the client's hands.
app.post('/api/verify-otp', async (req, res) => {
  try {
    const { code, purpose } = req.body || {};
    if (!code || !['verify', 'login', 'reset'].includes(purpose)) {
      return res.status(400).json({ message: 'A code and a valid purpose are required' });
    }
    const found = await resolveOtpUser(req);
    if (!found) {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    const { user, viaToken } = found;
    const result = await checkOtp(user, String(code), purpose);
    if (!result.ok) return res.status(400).json({ message: result.error });

    if (user.emailVerified !== true) {
      user.emailVerified = true;
      await user.save();
    }

    // Login flow (or any flow without an existing session) issues a token now.
    if (purpose === 'login' || !viaToken) {
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({ ok: true, token, user: publicUser(user) });
    }
    return res.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    console.error('OTP verify error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Re-issue an emailed code (wrong code, expired, or user needs another try).
app.post('/api/resend-otp', async (req, res) => {
  try {
    const { purpose } = req.body || {};
    if (!['verify', 'login', 'reset'].includes(purpose)) {
      return res.status(400).json({ message: 'A valid purpose is required' });
    }
    const found = await resolveOtpUser(req);
    if (!found) {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    const { sent, code } = await sendOtpEmail(found.user, purpose);
    res.json({ ok: true, sent, devCode: code || undefined, message: 'A new code has been sent.' });
  } catch (error) {
    console.error('OTP resend error:', error);
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
      // A chat that sat idle for 48 hours locks itself at send time — the
      // employer must pay again to continue, and the sharing flow opens.
      try {
        if ((await chatIdleMs(hasPaid)) > CHAT_IDLE_MS) {
          await closePaidChat(me._id, other._id, 'inactive');
          return res.status(402).json({ message: 'This chat has been locked. Please unlock it again to continue.', code: 'PAYMENT_REQUIRED' });
        }
      } catch { /* treat as still open */ }
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
    const filter = { role: 'seeker', status: 'approved', active: true, interviewDone: true };
    if (req.query.source === 'hub') {
      filter.hubId = { $ne: null };
    }
    const seekers = await User.find(filter).select('-password').sort({ createdAt: -1 });

    // Contact details always stay locked in the talent pool so real emails
    // are never exposed on this page.  The contactLocked flag still reflects
    // whether the seeker has replied (for UI hints), but the actual email is
    // always replaced with a mask here.
    const me = req.user.userId;
    const hubNameBy = await hubNameMapFor(seekers);
    const paidIds = new Set(
      (await ChatPayment.find({ employerId: me, status: 'paid' }).select('seekerId').lean())
        .map((p) => String(p.seekerId)),
    );
    const out = await Promise.all(
      seekers.map(async (s) => {
        const pu = publicUser(s);
        pu.hubName = hubNameBy.get(String(s.hubId)) || '';
        if (paidIds.has(String(s._id))) {
          pu.contactLocked = false;
          return pu;
        }
        return lockContacts(pu);
      })
    );

    res.json({ seekers: out });
  } catch (error) {
    console.error('Seekers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Employer: list every registered hub. Used by the talent pool to let the
// employer filter talent by the hub they're registered with.
app.get('/api/hubs', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') {
      return res.status(403).json({ message: 'Only employer accounts can browse hubs' });
    }
    const hubs = await User.find({ role: 'hub', status: 'approved', active: true })
      .select('name company')
      .sort({ company: 1 });
    res.json({ hubs: hubs.map((h) => ({ id: h._id, name: h.company || h.name })) });
  } catch (error) {
    console.error('Hubs error:', error);
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
    const raw = {
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
    };
    // If the viewer is an employer who has paid for this seeker, reveal
    // contact details instead of masking them behind lockContacts().
    let paid = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role === 'employer') {
          paid = !!(await ChatPayment.findOne({
            employerId: decoded.userId,
            seekerId: String(user._id),
            status: 'paid',
          }));
        }
      } catch { /* invalid/expired token — treat as anonymous */ }
    }
    const portfolio = paid ? raw : lockContacts(raw);
    res.json({ portfolio });
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

// A job seeker's connected email inbox (Gmail / Outlook / any SMTP account).
// The app password is encrypted at rest with AES-256-GCM (see ai-auto-apply
// helpers) so the raw credential never touches the database or API responses.
const EmailConnection = mongoose.model('EmailConnection', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  provider: { type: String, enum: ['gmail', 'outlook', 'smtp'], default: 'smtp' },
  email: { type: String, required: true },
  displayName: { type: String, default: '' },
  host: { type: String, default: '' },
  port: { type: Number, default: 465 },
  secure: { type: Boolean, default: true },
  user: { type: String, default: '' },
  secret: { type: String, default: '' },
  // OAuth2 connection (Google / Microsoft) — handed to nodemailer as an
  // XOAUTH2 token. Only refreshToken + accessToken are used at send time;
  // clientId/clientSecret come from the admin's SiteConfig('oauth') entry and
  // are copied here so a rotated admin key never breaks stored connections.
  oauth: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  verifiedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}));

// AI-assisted job applications created when a seeker clicks "Apply with AI".
// method 'email' = the cover letter + CV were emailed from the seeker's own
// inbox; 'draft' = no destination address was known, the prepared application
// is recorded and handed to the seeker to finish on the original posting.
const Application = mongoose.model('Application', new mongoose.Schema({
  seekerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  jobId: { type: String, default: '' },
  jobTitle: { type: String, default: '' },
  company: { type: String, default: '' },
  source: { type: String, default: 'Platform' },
  url: { type: String, default: '' },
  toEmail: { type: String, default: '' },
  subject: { type: String, default: '' },
  coverLetter: { type: String, default: '' },
  method: { type: String, enum: ['email', 'draft'], default: 'email' },
  status: { type: String, enum: ['draft', 'sent', 'failed'], default: 'draft' },
  error: { type: String, default: '' },
  sentAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
}));

// AI-generated learning roadmaps for job roles. Built from a hub requesting a
// module by typing a role, and automatically from live employer demand (when a
// new talent request names skills relevant to a role). Hubs use these to keep
// their training curriculums aligned with what employers are actually hiring for.
const LearningModule = mongoose.model('LearningModule', new mongoose.Schema({
  roleKey: { type: String, index: true },   // normalized slug used for lookups
  role: { type: String, required: true },    // readable role title
  skills: { type: [String], default: [] },
  tools: { type: [String], default: [] },
  courses: [{
    title: { type: String, default: '' },
    provider: { type: String, default: '' },
    url: { type: String, default: '' },
    duration: { type: String, default: '' },
    description: { type: String, default: '' },
  }],
  resources: { type: [String], default: [] },
  marketNote: { type: String, default: '' }, // what employers currently want for this role
  demandNote: { type: String, default: '' }, // why an auto-generated module exists (the live demand)
  source: { type: String, enum: ['manual', 'demand'], default: 'manual' },
  approved: { type: Boolean, default: true }, // admin can un-approve/hide a module
  hidden: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
}));

// Audit trail of every module request a hub made (role + whether it was
// generated or just looked up), shown to the admin.
const ModuleRequest = mongoose.model('ModuleRequest', new mongoose.Schema({
  hubId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, required: true },
  generatedModuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningModule', default: null },
  status: { type: String, enum: ['generated', 'searched'], default: 'generated' },
  createdAt: { type: Date, default: Date.now },
}));

// Tracks which employer has paid to chat with which seeker.
const ChatPayment = mongoose.model('ChatPayment', new mongoose.Schema({
  employerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seekerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  paymentRef: { type: String, default: '' },
  monnifyRef: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'closed'], default: 'pending' },
  lockedBy: { type: String, enum: ['', 'leave', 'inactive'], default: '' },
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date },
  closedAt: { type: Date },
}));

// One "chat ended" record per locked chat. It drives the employer's
// employment-sharing flow: did you hire them, will you share the news, and
// (when they decline to post) the reason why.
const ChatClosure = mongoose.model('ChatClosure', new mongoose.Schema({
  employerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seekerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  triggeredBy: { type: String, enum: ['leave', 'inactive'], required: true },
  employed: { type: Boolean, default: false },
  postAgreed: { type: Boolean, default: false },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'done'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  answeredAt: { type: Date },
}));

// Lightweight in-app notifications. Used today to deliver the shareable
// post templates (captions + collaboration designs) an employer may
// download after confirming they hired a talent.
const Notification = mongoose.model('Notification', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  title: { type: String, default: '' },
  body: { type: String, default: '' },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}));

// Instant attacker-free chat calls between an employer and a job seeker.
// Created on demand from the secure chat (no scheduling), reusing the same
// polled-signaling WebRTC model as admin interviews.
const Call = mongoose.model('Call', new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['open', 'active', 'ended'], default: 'open' },
  createdAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
}));

// WebRTC signaling payloads for chat calls (offer/answer + ICE candidates).
const CallSignal = mongoose.model('CallSignal', new mongoose.Schema({
  callId: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', required: true },
  kind: { type: String, enum: ['offer', 'answer'], required: true },
  sdp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}));
const CallIceCandidate = mongoose.model('CallIceCandidate', new mongoose.Schema({
  callId: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', required: true },
  kind: { type: String, enum: ['offer', 'answer'], required: true },
  candidate: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}));

// Customer support — a message thread between a platform user
// (hub / seeker / employer) and the admin team.
const SupportTicket = mongoose.model('SupportTicket', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userRole: { type: String, enum: ['hub', 'seeker', 'employer'], required: true },
  subject: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, enum: ['bug', 'account', 'payment', 'chat', 'interview', 'other'], default: 'other' },
  status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  messages: [{
    from: { type: String, enum: ['user', 'admin'], required: true },
    body: { type: String, required: true, maxlength: 4000 },
    createdAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}));

// Employer reviews of talent they have previously unlocked (paid chat).
// Displayed at the bottom of the talent's public portfolio.
const talentReviewSchema = new mongoose.Schema({
  employerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seekerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  review: { type: String, default: '', trim: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
});
talentReviewSchema.index({ employerId: 1, seekerId: 1 }, { unique: true });
const TalentReview = mongoose.model('TalentReview', talentReviewSchema);

function ticketInfo(t) {
  return {
    id: t._id,
    subject: t.subject,
    category: t.category,
    status: t.status,
    priority: t.priority,
    userRole: t.userRole,
    messages: t.messages || [],
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

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

// Query Monnify for a single transaction and update the local record's status.
// Returns 'paid'/'failed' when confirmed, otherwise null (unknown/unreachable).
async function syncPayment(record) {
  if (!record?.paymentRef) return null;
  const cfg = await getConfig('monnify');
  if (!cfg?.apiKey || !cfg?.secretKey) return null;
  const auth = await monnifyToken();
  if (!auth?.token) return null;
  const res = await fetch(
    `${auth.baseUrl}/api/v1/merchant/transactions/query?paymentReference=${encodeURIComponent(record.paymentRef)}`,
    { headers: { Authorization: `Bearer ${auth.token}` } },
  );
  if (!res.ok) return null;
  const d = await res.json();
  const tx = d.responseBody;
  if (tx?.paymentStatus === 'PAID') {
    record.status = 'paid';
    record.monnifyRef = tx.transactionReference || '';
    record.paidAt = new Date();
    await record.save();
    return 'paid';
  }
  if (tx?.paymentStatus === 'FAILED') {
    record.status = 'failed';
    await record.save();
    return 'failed';
  }
  return null;
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

// Both call participants and any admin may operate on a chat call.
function callAccessOk(req, call) {
  return (
    String(call.creatorId) === String(req.user.userId) ||
    String(call.participantId) === String(req.user.userId) ||
    req.user.role === 'admin'
  );
}

// ── Chat lifecycle & employment-sharing flow ────────────────────────────────
// A paid chat stays open while the pair is active. It locks again when the
// employer leaves it, or after 48 hours without a message — at which point the
// contact details are hidden again and the employer must pay to reopen.

const CHAT_IDLE_MS = 48 * 60 * 60 * 1000; // 48 hours

function escXml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initialsOf(name = '') {
  return name
    .split(' ')
    .map((p) => p && p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Create a pending "chat ended" record for this payment — or reuse one that is
// already waiting to be answered so duplicates never pile up.
async function ensureClosure(payment, trigger) {
  const existing = await ChatClosure.findOne({
    employerId: payment.employerId,
    seekerId: payment.seekerId,
    status: 'pending',
  });
  if (existing) return existing;
  return ChatClosure.create({
    employerId: payment.employerId,
    seekerId: payment.seekerId,
    triggeredBy: trigger,
  });
}

// Close a paid chat (locks it again) and open its employment-sharing flow.
async function closePaidChat(employerId, seekerId, trigger) {
  const payment = await ChatPayment.findOne({ employerId, seekerId, status: 'paid' });
  if (!payment) return null;
  payment.status = 'closed';
  payment.lockedBy = trigger;
  payment.closedAt = new Date();
  await payment.save();
  return ensureClosure(payment, trigger);
}

// How long this pair's chat has been idle, measured from the last message
// (or from the moment they paid, if they never exchanged messages).
async function chatIdleMs(payment) {
  const last = await Message.findOne({
    $or: [
      { from: payment.employerId, to: payment.seekerId },
      { from: payment.seekerId, to: payment.employerId },
    ],
  }).sort({ createdAt: -1 });
  const base = last ? new Date(last.createdAt) : new Date(payment.paidAt || payment.createdAt);
  return Date.now() - base.getTime();
}

// Close every paid chat for this employer that has sat idle for 48 hours.
async function closeInactiveChats(employerId) {
  const payments = await ChatPayment.find({ employerId, status: 'paid' });
  const locked = [];
  for (const p of payments) {
    try {
      if ((await chatIdleMs(p)) > CHAT_IDLE_MS) {
        locked.push(await closePaidChat(p.employerId, p.seekerId, 'inactive'));
      }
    } catch { /* ignore per-record */ }
  }
  return locked.filter(Boolean);
}

async function closureInfo(c, seeker, hubName) {
  return {
    id: c._id,
    triggeredBy: c.triggeredBy,
    status: c.status,
    employed: c.employed,
    postAgreed: c.postAgreed,
    reason: c.reason,
    seeker: {
      id: c.seekerId,
      name: seeker?.name || 'This job seeker',
      avatar: seeker?.avatar || '',
    },
    hub: hubName || null,
  };
}

// Cap a brand/name for template captions so lines stay readable.
function displayName(user, fallback) {
  const name = (user?.company || user?.name || '').toString().trim();
  return name || fallback;
}

// Shareable post templates — caption + collaboration design. Two flavor sets:
// employer + talent (2 parties) or employer + talent + hub (3 parties when the
// talent came through a hub link).
function buildPostCaptions(members, withHub, perspective) {
  const first = members.talent;
  const employer = members.employer;
  const hub = members.hub;
  const firstName = (first || '').split(' ')[0] || 'they';

  // The talent tells the story from their own journey.
  if (perspective === 'talent') {
    if (withHub) {
      return {
        linkedin:
`🎉 A new chapter is here — I'm joining ${employer}!

It all started with a conversation on TalentriX, and today I'm thrilled to be saying yes to an incredible opportunity. A special thank-you to ${hub} for spotting my potential and making the introduction.

To everyone who believed in me — this is only the beginning. I can't wait to learn, grow, and build great things together. 🚀

#NewBeginnings #NewJob #JoiningTheTeam #TalentShares`,
        instagram:
`New chapter unlocked! 🌟
I'm so excited to announce that I'm joining ${employer} — and a huge thank-you to ${hub} for making this happen.

To everyone who supported me along the way: thank you. Let's build something amazing together! 🔥

#NewChapter #NewJob #FutureHere #TalentShares`,
        x:
`Thrilled to share — I'm joining ${employer} 🎉
A new chapter begins today. Thank you to ${hub} for the introduction and to everyone who made this possible!
#NewJob #TalentShares`,
      };
    }
    return {
      linkedin:
`🎉 A new chapter is here — I'm joining ${employer}!

It all started with a conversation on TalentriX, and today I'm thrilled to be saying yes to an incredible opportunity. Thank you to everyone who believed in me — this is only the beginning.

I can't wait to learn, grow, and build great things together. 🚀

#NewBeginnings #NewJob #JoiningTheTeam #TalentShares`,
      instagram:
`New chapter unlocked! 🌟
I'm so excited to announce that I'm joining ${employer}. To everyone who supported me along the way — thank you. Now let's build something amazing together! 🔥

#NewChapter #NewJob #FutureHere #TalentShares`,
      x:
`Thrilled to share — I'm joining ${employer} 🎉
A new chapter begins today. Thank you to everyone who made this happen.
#NewJob #TalentShares`,
    };
  }

  // The hub celebrates a member of their community landing a new role.
  if (perspective === 'hub') {
    return {
      linkedin:
`🎉 We're incredibly proud to announce that ${first}, one of the brilliant talents in our network, is joining ${employer}!

We introduced promising talent to a company that believes in them — and the result speaks for itself. Congratulations, ${firstName}! Keep making us proud. 🚀

#TalentSpotlight #NewHire #Collaboration #TalentShares`,
      instagram:
`Another win for our talent community! 🎉
${first} from our network just joined ${employer} — and we couldn't be prouder. This is what happens when talent meets the right opportunity. 🤝

#OurTalent #ProudMoment #NewHire #TalentShares`,
      x:
`Proud to see ${first} from our talent network join ${employer} 🎉
A great match and a great fit. This is why we do what we do.
#TalentWins #NewHire`,
    };
  }

  // The employer welcomes their newest teammate.
  if (withHub) {
    return {
      linkedin:
`🎉 Thrilled to announce that ${first} is joining ${employer}!

This hire began as a conversation on TalentriX and became a partnership thanks to ${hub}. They spotted a remarkable talent, we chased them — and now ${first} is part of our team.

A heartfelt thank-you to ${hub} for the introduction, and to ${firstName} for trusting us with your next chapter. Great things are built when talent and opportunity finally meet. 🚀

#NewHire #TalentDiscovery #WelcomeToTheTeam #Collaboration`,
      instagram:
`New teammate alert! 🌟

We're beyond excited to welcome ${first} to the ${employer} family. A special shout-out to ${hub} for spotting their potential and connecting us — this is collaboration at its best.

Welcome aboard, ${firstName}! Here's to everything we'll build together. 🤝

#NewHire #WelcomeAboard #TeamWork #TalentShares`,
      x:
`Big news: ${first} is joining ${employer} as our newest teammate 🎉
Credit to ${hub} for the introduction — talent discovered, potential unlocked.
Welcome aboard, ${firstName}! #NewHire #TalentShares`,
    };
  }

  return {
    linkedin:
`🎉 A new teammate to celebrate — ${first} is joining ${employer}!

From our very first conversation on TalentriX, it was clear ${firstName} was someone special: genuinely talented, relentlessly driven, and the kind of person a team is better for.

Welcome aboard, ${firstName}! We can't wait to see how high we'll go together. 🚀

#NewHire #WelcomeToTheTeam #Hiring #TalentShares`,
    instagram:
`Say hello to our newest teammate! 🌟

Great things happen when talent meets opportunity — and ${first} is living proof. We're so excited to grow, learn, and create together.

Welcome to the family, ${firstName}! 🔥

#NewHire #WelcomeAboard #CreatingTogether #TalentShares`,
    x:
`New teammate unlocked 🎉
${first} is joining ${employer}, and we couldn't be happier.
Welcome aboard, ${firstName}! #NewHire #TalentShares`,
  };
}

// A 1080×1080 collaboration design as inline SVG (no external assets), so the
// employer can download it as an image and post it on any channel.
function collabSvg({ platform, members, brand, headline, sub }) {
  const accentSet =
    platform === 'LinkedIn' ? ['#0a66c2', '#062a4a']
    : platform === 'Instagram' ? ['#e1306c', '#5b1d8c']
    : ['#0f172a', '#334155'];
  const [c1, c2] = accentSet;
  const eyebrow = 'COLLABORATION';
  const h = headline || 'A talent bridge, now a team';
  const s = sub || 'Proudly connecting talent and opportunity';
  const cx = 540;
  const avatarY = 470;
  const startX = cx - ((members.length - 1) * 250) / 2;

  const avatars = members
    .map((m, i) => {
      const x = startX + i * 250;
      return `
        <circle cx="${x}" cy="${avatarY}" r="78" fill="#ffffff" opacity="0.14"/>
        <circle cx="${x}" cy="${avatarY}" r="62" fill="${c2}"/>
        <text x="${x}" y="${avatarY + 6}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="700" fill="#ffffff">${escXml(m.initials)}</text>`;
    })
    .join('');

  const roles = members
    .map((m, i) => `
      <text x="${cx}" y="${i === 0 ? 640 : 640 + i * 46}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#ffffff">${escXml(m.name)}</text>
      <text x="${cx}" y="${(i === 0 ? 640 : 640 + i * 46) + 30}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#ffffff" opacity="0.75">${escXml(m.role)}</text>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <circle cx="960" cy="120" r="220" fill="#ffffff" opacity="0.06"/>
  <circle cx="90" cy="900" r="260" fill="#ffffff" opacity="0.05"/>
  <text x="60" y="70" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#ffffff" opacity="0.9">${escXml(brand)}</text>
  <text x="${cx}" y="260" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" letter-spacing="8" font-weight="700" fill="#ffffff" opacity="0.85">${escXml(eyebrow)}</text>
  <text x="${cx}" y="330" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="800" fill="#ffffff">${escXml(h)}</text>
  <text x="${cx}" y="382" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#ffffff" opacity="0.85">${escXml(s)}</text>
  ${avatars}
  ${roles}
  <text x="${cx}" y="978" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="#ffffff" opacity="0.95">Powered by ${escXml(brand)} · connecting talent &amp; opportunity</text>
</svg>`;
}

// Build the three shareable templates (LinkedIn, Instagram, X) for a closure,
// told from one party's perspective so everyone — employer, talent, and hub —
// gets captions and a design that fit the way *they* share news.
async function buildPostTemplates(closure, perspective = 'employer') {
  const employer = await User.findById(closure.employerId);
  const seeker = await User.findById(closure.seekerId);
  const hub = seeker?.hubId ? await User.findById(seeker.hubId) : null;
  const withHub = !!hub;
  const brand = 'TalentriX';

  const members = {
    employer: displayName(employer, 'Our team'),
    talent: seeker?.name || 'Our new teammate',
    hub: hub ? displayName(hub, null) : null,
  };

  const layouts = {
    employer: [
      { name: members.employer, role: 'Employer' },
      { name: members.talent, role: seeker?.title || 'New Hire' },
    ],
    talent: [
      { name: members.talent, role: seeker?.title || 'New Hire' },
      { name: members.employer, role: 'Employer' },
    ],
    hub: [
      { name: members.hub, role: 'Talent Partner' },
      { name: members.talent, role: seeker?.title || 'New Hire' },
      { name: members.employer, role: 'Employer' },
    ],
  };
  const body = [...(layouts[perspective] || layouts.employer)];
  if (withHub && perspective !== 'hub') body.push({ name: members.hub, role: 'Talent Partner' });

  const memberCards = body.map((m) => ({
    name: m.name,
    role: m.role,
    initials: initialsOf(m.name),
  }));

  const copy = {
    employer: { headline: 'A talent bridge, now a team', sub: 'Proudly connecting talent and opportunity' },
    talent: { headline: 'My next chapter begins here', sub: 'A new opportunity, a brighter future' },
    hub: { headline: 'Talent spotted. Opportunity unlocked.', sub: 'Celebrating a match made for greatness' },
  };
  const label = copy[perspective] || copy.employer;

  const captions = buildPostCaptions(members, withHub, perspective);
  return [
    { platform: 'LinkedIn', caption: captions.linkedin, svg: collabSvg({ platform: 'LinkedIn', members: memberCards, brand, headline: label.headline, sub: label.sub }) },
    { platform: 'Instagram', caption: captions.instagram, svg: collabSvg({ platform: 'Instagram', members: memberCards, brand, headline: label.headline, sub: label.sub }) },
    { platform: 'X (Twitter)', caption: captions.x, svg: collabSvg({ platform: 'X', members: memberCards, brand, headline: label.headline, sub: label.sub }) },
  ];
}

function buildClosureNotification({ recipientId, perspective, seeker, employerName, templates }) {
  const firstName = (seeker?.name || 'the new hire').split(' ')[0];
  const base = {
    userId: recipientId,
    type: 'post_templates',
    title: 'Your social post templates are ready',
    payload: { templates, seekerName: seeker?.name || '' },
  };
  if (perspective === 'talent') {
    return {
      ...base,
      body: `You're joining ${employerName || 'your new team'} — download the captions and designs and share the news on your channels.`,
    };
  }
  if (perspective === 'hub') {
    return {
      ...base,
      body: `${firstName} from your network is joining ${employerName || 'a new team'} — download the captions and designs and celebrate the win together.`,
    };
  }
  return {
    ...base,
    body: `${firstName} is now on your team. Download the captions and designs, then share the news on your channels.`,
  };
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
    // Keep one offer + one answer per interview. Publishing a fresh offer also
    // drops the previous session's answer so it can't be applied to a newly
    // re-joined call. ICE candidates are intentionally left alone — the
    // offerer posts its own candidates right after publishing the offer, so
    // clearing them here would break (re)connection entirely.
    await Signal.deleteMany({ interviewId: interview._id, kind });
    if (kind === 'offer') {
      await Signal.deleteMany({ interviewId: interview._id, kind: 'answer' });
    }
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

// ── Instant chat calls (employer ↔ job seeker) ──────────────────────────────────
// Created on demand from the secure chat — no scheduling. Same polled WebRTC
// signaling model as admin interviews; the caller is the offerer.

// Create (or reuse) an open call for the current user and the recipient.
app.post('/api/calls', authenticateToken, async (req, res) => {
  try {
    const { to } = req.body || {};
    if (!to) return res.status(400).json({ message: 'to required' });
    const me = await User.findById(req.user.userId);
    const other = await User.findById(to);
    if (!me || !other) return res.status(404).json({ message: 'User not found' });
    if (!chatPairOk(me, other)) {
      return res.status(403).json({ message: 'Calls are available between employers and job seekers only' });
    }
    // Same payment gate as chat messages: an employer must have paid to call a seeker.
    if (me.role === 'employer' && other.role === 'seeker') {
      const hasPaid = await ChatPayment.findOne({ employerId: me._id, seekerId: other._id, status: 'paid' });
      if (!hasPaid) return res.status(402).json({ message: 'Payment required', code: 'PAYMENT_REQUIRED' });
    }
    // Reuse an existing open/active call for this pair so both sides join the same room.
    let call = await Call.findOne({
      status: { $in: ['open', 'active'] },
      $or: [
        { creatorId: me._id, participantId: other._id },
        { creatorId: other._id, participantId: me._id },
      ],
    });
    if (!call) {
      call = await Call.create({ creatorId: me._id, participantId: other._id });
    }
    res.status(201).json({
      call: {
        id: call._id,
        status: call.status,
        createdAt: call.createdAt,
        partner: { id: other._id, name: other.name, role: other.role },
        youAreCreator: String(call.creatorId) === String(me._id),
      },
    });
  } catch (error) {
    console.error('Call create error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a call's context (participants + whether the requester created it).
app.get('/api/calls/:id', authenticateToken, async (req, res) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found' });
    if (!callAccessOk(req, call)) return res.status(403).json({ message: 'Not allowed' });
    const meId = String(req.user.userId);
    const partnerId = String(call.creatorId) === meId ? call.participantId : call.creatorId;
    const partner = await User.findById(partnerId);
    res.json({
      call: {
        id: call._id,
        status: call.status,
        createdAt: call.createdAt,
        partner: partner
          ? { id: partner._id, name: partner.name, role: partner.role }
          : { id: partnerId, name: 'User' },
        youAreCreator: String(call.creatorId) === meId,
      },
    });
  } catch (error) {
    console.error('Call get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/calls/:id/signal', authenticateToken, async (req, res) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found' });
    if (!callAccessOk(req, call)) return res.status(403).json({ message: 'Not allowed' });
    if (call.status === 'ended') return res.status(400).json({ message: 'This call is not active' });
    const signals = await CallSignal.find({ callId: call._id }).sort({ createdAt: 1 });
    const ices = await CallIceCandidate.find({ callId: call._id }).sort({ createdAt: 1 });
    res.json({
      offer: signals.find((s) => s.kind === 'offer')?.sdp || '',
      answer: signals.find((s) => s.kind === 'answer')?.sdp || '',
      offerCandidates: ices.filter((c) => c.kind === 'offer').map((c) => c.candidate),
      answerCandidates: ices.filter((c) => c.kind === 'answer').map((c) => c.candidate),
    });
  } catch (error) {
    console.error('Call signal get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/calls/:id/signal', authenticateToken, async (req, res) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found' });
    if (!callAccessOk(req, call)) return res.status(403).json({ message: 'Not allowed' });
    const { kind, sdp } = req.body || {};
    if (!['offer', 'answer'].includes(kind) || !sdp) {
      return res.status(400).json({ message: 'Missing signal payload' });
    }
    // Keep one offer + one answer per call; a fresh offer clears the old answer.
    await CallSignal.deleteMany({ callId: call._id, kind });
    if (kind === 'offer') {
      await CallSignal.deleteMany({ callId: call._id, kind: 'answer' });
    }
    const sig = await CallSignal.create({ callId: call._id, kind, sdp });
    res.status(201).json({ signal: { id: sig._id, kind: sig.kind } });
  } catch (error) {
    console.error('Call signal post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/calls/:id/ice', authenticateToken, async (req, res) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found' });
    if (!callAccessOk(req, call)) return res.status(403).json({ message: 'Not allowed' });
    const ices = await CallIceCandidate.find({ callId: call._id }).sort({ createdAt: 1 });
    res.json({
      offerCandidates: ices.filter((c) => c.kind === 'offer').map((c) => c.candidate),
      answerCandidates: ices.filter((c) => c.kind === 'answer').map((c) => c.candidate),
    });
  } catch (error) {
    console.error('Call ice get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/calls/:id/ice', authenticateToken, async (req, res) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ message: 'Call not found' });
    if (!callAccessOk(req, call)) return res.status(403).json({ message: 'Not allowed' });
    const { kind, candidate } = req.body || {};
    if (!['offer', 'answer'].includes(kind) || !candidate) {
      return res.status(400).json({ message: 'Missing ICE candidate' });
    }
    if (candidate.length > 20000) return res.status(413).json({ message: 'Candidate too large' });
    await CallIceCandidate.create({ callId: call._id, kind, candidate });
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Call ice post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Employer "Request Talent" + matching ────────────────────────────────────

function normalizeTag(t) {
  return String(t || '').toLowerCase().trim().replace(/[^a-z0-9+#.-]/g, ' ');
}

// Score every approved, interviewed, active seeker against a talent request
// and rank them. Match % = skills (50%) + tools (30%) + role fit (20%).
async function matchTalentRequest(tr) {
  const reqSkills = (tr.skills || []).map(normalizeTag).filter(Boolean);
  const reqTools = (tr.tools || []).map(normalizeTag).filter(Boolean);
  const skillSet = new Set(reqSkills);
  const toolSet = new Set(reqTools);
  const roleTag = normalizeTag(tr.role || '');
  const roleWords = roleTag.split(' ').filter((w) => w.length > 2);

  const seekers = await User.find({ role: 'seeker', status: 'approved', active: true, interviewDone: true }).select('-password -e2ePriv');
  const hubNameBy = await hubNameMapFor(seekers);
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

    const pu = publicUser(s);
    pu.hubName = hubNameBy.get(String(s.hubId)) || '';

    return {
      seeker: lockContacts(pu),
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
    // On a brand-new request only: validate the demanded skills against the
    // market, notify affected talents + their hubs, and (re)publish a learning
    // module for the role. Fire-and-forget so the response stays fast.
    runSkillDemandAnalysis(tr).catch(() => {});
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
    // Mask stored secrets — the raw SMTP password and OAuth client secrets
    // are never returned to the browser.
    if (req.params.key === 'email') {
      const v = val || {};
      return res.json({
        value: {
          host: v.host || '',
          port: Number(v.port || 587),
          secure: !!v.secure,
          user: v.user || '',
          email: v.email || v.user || '',
          fromName: v.fromName || '',
          hasPassword: !!v.password,
          password: '',
        },
      });
    }
    if (req.params.key === 'oauth') {
      const maskKind = (k) => {
        const c = (val && val[k]) || {};
        return {
          clientId: c.clientId || '',
          hasSecret: !!c.clientSecret,
          clientSecret: '',
          redirectUri: c.redirectUri || '',
        };
      };
      return res.json({ value: { google: maskKind('google'), microsoft: maskKind('microsoft') } });
    }
    res.json({ value: val || {} });
  } catch (error) {
    console.error('Config get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send a test email through the saved platform SMTP settings.
app.post('/api/admin/email/test', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const to = String(req.body?.to || req.user.email || '').trim();
    if (!to) return res.status(400).json({ message: 'No destination email provided' });
    const sent = await sendMail({
      to,
      subject: 'TalentriX — test email',
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1c2333;background:#f4f1ea;padding:32px;">
        <h2>Email delivery is working</h2>
        <p>This is a test email sent from the TalentriX admin panel using your saved SMTP settings.</p>
        <p style="color:#8a90a0;">Sent ${new Date().toLocaleString()}</p>
      </body></html>`,
    });
    res.json({ ok: sent, message: sent ? `Test email sent to ${to}.` : 'Could not send — check your SMTP details and try again.' });
  } catch (error) {
    console.error('Email test error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/admin/config/:key', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    let value = req.body.value || {};
    // For the AI key the admin UI sends a blank apiKey when it is unchanged
    // (the stored key is only ever shown masked). Keep the existing key then.
    if (req.params.key === 'ai') {
      const existing = (await getConfig('ai')) || {};
      if (req.body.clearKey === true) value.apiKey = '';
      else if (!value.apiKey && existing.apiKey) value.apiKey = existing.apiKey;
    }
    // Platform email (SMTP): preserve untouched fields, keep the existing
    // password when a blank one arrives, encrypt new ones at rest.
    if (req.params.key === 'email') {
      const existing = (await getConfig('email')) || {};
      const v = { ...existing, ...value, email: undefined };
      v.host = String(v.host || '').trim();
      v.port = Number(v.port == null ? 587 : v.port);
      v.secure = !!v.secure;
      v.user = String(v.user || '').trim();
      v.fromName = String(v.fromName || '').trim();
      if (req.body.clearPassword === true) v.password = '';
      else if (String(value.password || '').trim()) v.password = encryptSecret(String(value.password).trim());
      else if (!v.password) v.password = existing.password || '';
      value = v;
    }
    // OAuth apps used by talents when connecting their mailbox. Secrets are
    // kept as-is (the token exchange needs the raw value) but are masked on
    // reads and preserved when a blank one arrives.
    if (req.params.key === 'oauth') {
      const existing = (await getConfig('oauth')) || {};
      const mergeKind = (k) => {
        const cur = existing[k] || {};
        const next = value[k] || {};
        const wasTouched = value[k] != null;
        // A blank secret keeps the stored one; an explicit clearSecret=true wipes it.
        const secret =
          wasTouched && next.clearSecret === true
            ? ''
            : wasTouched && next.clientSecret != null && String(next.clientSecret).trim() !== ''
            ? String(next.clientSecret).trim()
            : cur.clientSecret || '';
        return {
          clientId: String(wasTouched && next.clientId != null ? next.clientId : (cur.clientId || '')).trim(),
          clientSecret: secret,
          redirectUri: String(wasTouched && next.redirectUri != null ? next.redirectUri : (cur.redirectUri || '')).trim(),
        };
      };
      value = { google: mergeKind('google'), microsoft: mergeKind('microsoft') };
    }
    await setConfig(req.params.key, value);
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
    res.set('Cache-Control', 'no-store');
    res.json({
      amount: cfg?.amount ?? 5000,
      vatRate: cfg?.vatRate ?? 0.075,
      serviceCharge: cfg?.serviceCharge ?? 100,
      currency: cfg?.currency ?? 'NGN',
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Check if employer has paid for a specific seeker
app.get('/api/payment/check/:seekerId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Employer only' });
    let existing = await ChatPayment.findOne({
      employerId: req.user.userId,
      seekerId: req.params.seekerId,
      status: 'paid',
    });
    // Even if our record is still 'pending', the charge may already be settled
    // on Monnify (e.g. redirect callback or webhook was missed). Reconcile it
    // here so a paid chat unlocks without asking the employer to pay again.
    if (!existing) {
      const pending = await ChatPayment.findOne({
        employerId: req.user.userId,
        seekerId: req.params.seekerId,
        status: 'pending',
      });
      if (pending && (await syncPayment(pending)) === 'paid') existing = pending;
    }
    res.set('Cache-Control', 'no-store');
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
    const base = pricing?.amount ?? 5000;
    const vatRate = pricing?.vatRate ?? 0.075;
    const serviceCharge = pricing?.serviceCharge ?? 100;
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

    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/employer?payment=callback&seeker=${seekerId}`;

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
    res.set('Cache-Control', 'no-store');
    const status = await syncPayment(record);
    res.json({ paid: status === 'paid' });
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
    // Reconcile any pending payments against Monnify so a successful charge
    // unlocks chat even if the redirect callback or webhook was missed.
    const pending = await ChatPayment.find({ employerId: req.user.userId, status: 'pending' });
    for (const p of pending) {
      try {
        if (await syncPayment(p)) { /* status updated */ }
      } catch { /* ignore per-record */ }
    }
    const payments = await ChatPayment.find({ employerId: req.user.userId, status: 'paid' })
      .select('seekerId amount paidAt')
      .lean();
    res.set('Cache-Control', 'no-store');
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'TalentriX API' });
});

// ── Chat locking & employment sharing ───────────────────────────────────────

// Leave chat (employer). Closes the paid access so the chat locks again until
// the employer pays, and starts the employment-sharing flow.
app.post('/api/chat/leave', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Employer only' });
    const { to } = req.body || {};
    if (!to) return res.status(400).json({ message: 'to required' });
    const closure = await closePaidChat(req.user.userId, to, 'leave');
    if (!closure) return res.status(404).json({ message: 'No active chat to leave' });
    const seeker = await User.findById(to).select('name avatar title hubId');
    let hub = null;
    if (seeker?.hubId) {
      const h = await User.findById(seeker.hubId).select('name company');
      hub = h ? h.company || h.name : null;
    }
    res.json({ closure: await closureInfo(closure, seeker, hub) });
  } catch (error) {
    console.error('Chat leave error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Employer: close any chats idle for 48 hours, then list every "chat ended"
// flow still waiting for an answer. Called on login and periodically so the
// popup appears even if the employer wasn't signed in when a chat expired.
app.get('/api/employer/chat-closures/pending', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Employer only' });
    await closeInactiveChats(req.user.userId);
    const closures = await ChatClosure.find({ employerId: req.user.userId, status: 'pending' }).sort({ createdAt: -1 });
    const out = [];
    const hubCache = {};
    for (const c of closures) {
      const seeker = await User.findById(c.seekerId).select('name avatar title hubId');
      let hub = null;
      if (seeker?.hubId) {
        const key = String(seeker.hubId);
        if (hubCache[key] !== undefined) hub = hubCache[key];
        else {
          const h = await User.findById(seeker.hubId).select('name company');
          hub = h ? h.company || h.name : null;
          hubCache[key] = hub;
        }
      }
      out.push(await closureInfo(c, seeker, hub));
    }
    res.set('Cache-Control', 'no-store');
    res.json({ closures: out });
  } catch (error) {
    console.error('Pending closures error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Employer: answer a closure. When they agree to share the news, generate the
// post templates and deliver them as a notification (bell icon).
app.post('/api/employer/chat-closures/:id/answer', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Employer only' });
    const closure = await ChatClosure.findById(req.params.id);
    if (!closure || String(closure.employerId) !== String(req.user.userId)) {
      return res.status(404).json({ message: 'Not found' });
    }
    if (closure.status !== 'pending') {
      return res.status(400).json({ message: 'Already answered' });
    }
    const { employed, postAgreed, reason } = req.body || {};
    closure.employed = !!employed;
    closure.postAgreed = !!postAgreed;
    closure.reason = String(reason || '').trim().slice(0, 2000);
    closure.answeredAt = new Date();
    closure.status = 'done';
    await closure.save();

    if (closure.postAgreed) {
      const seeker = await User.findById(closure.seekerId).select('name title hubId');
      const employer = await User.findById(closure.employerId).select('name company');
      const hub = seeker?.hubId ? await User.findById(seeker.hubId).select('name company') : null;
      const employerName = displayName(employer, 'our team');

      const notifications = [];

      const employerTemplates = await buildPostTemplates(closure, 'employer');
      notifications.push(buildClosureNotification({ recipientId: closure.employerId, perspective: 'employer', seeker, employerName, templates: employerTemplates }));

      const talentTemplates = await buildPostTemplates(closure, 'talent');
      notifications.push(buildClosureNotification({ recipientId: closure.seekerId, perspective: 'talent', seeker, employerName, templates: talentTemplates }));

      if (hub) {
        const hubTemplates = await buildPostTemplates(closure, 'hub');
        notifications.push(buildClosureNotification({ recipientId: hub._id, perspective: 'hub', seeker, employerName, templates: hubTemplates }));
      }

      await Notification.insertMany(notifications);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Closure answer error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Notifications ───────────────────────────────────────────────────────────

// List this user's notifications (newest first).
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.set('Cache-Control', 'no-store');
    res.json({ notifications });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await Notification.updateOne({ _id: req.params.id, userId: req.user.userId }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Notification read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.userId, read: false }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Notification read-all error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Customer support tickets ─────────────────────────────────────────────────

const SUPPORT_CATEGORIES = ['bug', 'account', 'payment', 'chat', 'interview', 'other'];
const SUPPORT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const SUPPORT_PRIORITIES = ['low', 'medium', 'high'];

// Create a support ticket.
app.post('/api/support/tickets', authenticateToken, async (req, res) => {
  try {
    if (!['hub', 'seeker', 'employer'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only platform users can open a ticket' });
    }
    const { subject, category, message } = req.body || {};
    if (!subject || !String(subject).trim()) return res.status(400).json({ message: 'Subject is required' });
    if (!message || !String(message).trim()) return res.status(400).json({ message: 'Describe your issue' });

    const ticket = await SupportTicket.create({
      userId: req.user.userId,
      userRole: req.user.role,
      subject: String(subject).trim().slice(0, 120),
      category: SUPPORT_CATEGORIES.includes(category) ? category : 'other',
      messages: [{ from: 'user', body: String(message).trim().slice(0, 4000) }],
    });

    await Notification.create({
      userId: req.user.userId,
      type: 'support',
      title: 'Support ticket received',
      body: ticket.subject,
      payload: { ticketId: ticket._id },
    });

    res.status(201).json({ ticket: ticketInfo(ticket) });
  } catch (error) {
    console.error('Support create error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// A user's own tickets (newest first).
app.get('/api/support/tickets', authenticateToken, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user.userId }).sort({ updatedAt: -1 }).limit(100);
    res.set('Cache-Control', 'no-store');
    res.json({ tickets: tickets.map(ticketInfo) });
  } catch (error) {
    console.error('Support list error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// A single ticket (owner only).
app.get('/api/support/tickets/:id', authenticateToken, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json({ ticket: ticketInfo(ticket) });
  } catch (error) {
    console.error('Support get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a message to one of the caller's own tickets.
app.post('/api/support/tickets/:id/messages', authenticateToken, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    if (ticket.status === 'closed') {
      return res.status(400).json({ message: 'This ticket is closed. Open a new ticket to follow up.' });
    }
    const body = String((req.body || {}).message || '').trim().slice(0, 4000);
    if (!body) return res.status(400).json({ message: 'Message cannot be empty' });

    ticket.messages.push({ from: 'user', body });
    ticket.status = 'open';
    ticket.updatedAt = new Date();
    await ticket.save();

    res.json({ ticket: ticketInfo(ticket) });
  } catch (error) {
    console.error('Support reply error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: list all tickets (optional status / search filters).
app.get('/api/admin/support/tickets', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
    const { status, q } = req.query;
    const query = {};
    if (SUPPORT_STATUSES.includes(status)) query.status = status;
    if (q && String(q).trim()) {
      query.$or = [
        { subject: { $regex: String(q).trim(), $options: 'i' } },
        { 'messages.body': { $regex: String(q).trim(), $options: 'i' } },
        { userRole: { $regex: String(q).trim(), $options: 'i' } },
      ];
    }
    const tickets = await SupportTicket.find(query).sort({ updatedAt: -1 }).limit(200);
    const userIds = [...new Set(tickets.map((t) => String(t.userId)))];
    const users = await User.find({ _id: { $in: userIds } }).select('name company title role email');
    const byId = {};
    for (const u of users) byId[String(u._id)] = u;

    const summary = (t) => {
      const info = ticketInfo(t);
      const count = (t.messages || []).length;
      delete info.messages;
      info.messageCount = count;
      return info;
    };

    res.set('Cache-Control', 'no-store');
    res.json({
      openCount: await SupportTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
      tickets: tickets.map((t) => ({
        ...summary(t),
        user: {
          id: t.userId,
          name: byId[String(t.userId)]?.company || byId[String(t.userId)]?.name || 'Unknown user',
          email: byId[String(t.userId)]?.email || t.userRole,
          title: byId[String(t.userId)]?.title || '',
        },
      })),
    });
  } catch (error) {
    console.error('Admin support list error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: reply to a ticket (notifies the owner).
app.post('/api/admin/support/tickets/:id/messages', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const body = String((req.body || {}).message || '').trim().slice(0, 4000);
    if (!body) return res.status(400).json({ message: 'Message cannot be empty' });

    ticket.messages.push({ from: 'admin', body });
    if (ticket.status === 'closed') ticket.status = 'in_progress';
    ticket.updatedAt = new Date();
    await ticket.save();

    await Notification.create({
      userId: ticket.userId,
      type: 'support',
      title: 'Support reply',
      body: ticket.subject,
      payload: { ticketId: ticket._id },
    });

    res.json({ ticket: ticketInfo(ticket) });
  } catch (error) {
    console.error('Admin support reply error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: update ticket status / priority (notifies the owner on status change).
app.patch('/api/admin/support/tickets/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const { status, priority } = req.body || {};
    const changed = [];
    if (SUPPORT_STATUSES.includes(status) && status !== ticket.status) {
      ticket.status = status;
      changed.push(`marked as ${status.replace('_', ' ')}`);
    }
    if (SUPPORT_PRIORITIES.includes(priority) && priority !== ticket.priority) {
      ticket.priority = priority;
      changed.push(`priority set to ${priority}`);
    }
    if (changed.length === 0) return res.json({ ticket: ticketInfo(ticket) });

    ticket.updatedAt = new Date();
    await ticket.save();
    await Notification.create({
      userId: ticket.userId,
      type: 'support',
      title: 'Support ticket updated',
      body: ticket.subject,
      payload: { ticketId: ticket._id },
    });

    res.json({ ticket: ticketInfo(ticket) });
  } catch (error) {
    console.error('Admin support update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Talent reviews ───────────────────────────────────────────────────────────

// Public: the reviews shown at the end of a talent's portfolio.
app.get('/api/seekers/:id/reviews', async (req, res) => {
  try {
    const seeker = await User.findOne({ _id: req.params.id, role: 'seeker', status: 'approved', active: { $ne: false } });
    if (!seeker) return res.status(404).json({ message: 'Talent not found' });
    const reviews = await TalentReview.find({ seekerId: seeker._id }).sort({ createdAt: -1 }).limit(50);
    const employers = await User.find({ _id: { $in: reviews.map((r) => r.employerId) } }).select('name company');
    const byId = {};
    for (const e of employers) byId[String(e._id)] = e.company || e.name;
    res.set('Cache-Control', 'no-store');
    res.json({
      reviews: reviews.map((r) => ({
        id: r._id,
        rating: r.rating,
        review: r.review,
        createdAt: r.createdAt,
        employerName: byId[String(r.employerId)] || 'Verified employer',
      })),
    });
  } catch (error) {
    console.error('Reviews get error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Employer: who can be reviewed (previously unlocked) + any existing review.
app.get('/api/employer/reviewables', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Employers only' });
    const payments = await ChatPayment.find({
      employerId: req.user.userId,
      status: { $in: ['paid', 'closed'] },
    }).distinct('seekerId');
    const seekers = await User.find({ _id: { $in: payments } }).select('name title avatar status active');
    const reviews = await TalentReview.find({ employerId: req.user.userId, seekerId: { $in: payments } });
    const bySeeker = {};
    for (const r of reviews) bySeeker[String(r.seekerId)] = r;
    res.set('Cache-Control', 'no-store');
    res.json({
      items: seekers
        .filter((s) => s.status === 'approved' && s.active !== false)
        .map((s) => ({
          seekerId: s._id,
          name: s.name,
          title: s.title,
          avatar: s.avatar,
          review: bySeeker[String(s._id)]
            ? { rating: bySeeker[String(s._id)].rating, review: bySeeker[String(s._id)].review }
            : null,
        })),
    });
  } catch (error) {
    console.error('Reviewables error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Employer: create or update a review for a seeker they've unlocked.
app.post('/api/seekers/:id/review', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Employers only' });
    const seeker = await User.findOne({ _id: req.params.id, role: 'seeker', status: 'approved', active: { $ne: false } });
    if (!seeker) return res.status(404).json({ message: 'Talent not found' });

    const unlocked = await ChatPayment.findOne({
      employerId: req.user.userId,
      seekerId: String(seeker._id),
      status: { $in: ['paid', 'closed'] },
    });
    if (!unlocked) {
      return res.status(403).json({ message: 'You can only review talent you have unlocked' });
    }

    const rating = Math.round(Number((req.body || {}).rating));
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }
    const reviewText = String((req.body || {}).review || '').trim().slice(0, 1000);

    const existing = await TalentReview.findOne({ employerId: req.user.userId, seekerId: seeker._id });
    if (existing) {
      existing.rating = rating;
      existing.review = reviewText;
      await existing.save();
      res.json({ review: existing });
    } else {
      const created = await TalentReview.create({ employerId: req.user.userId, seekerId: seeker._id, rating, review: reviewText });
      res.status(201).json({ review: created });
    }
  } catch (error) {
    console.error('Review save error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Employer: their own reviews of talent (for management UI).
app.get('/api/employer/reviews', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'employer') return res.status(403).json({ message: 'Employers only' });
    const reviews = await TalentReview.find({ employerId: req.user.userId }).sort({ createdAt: -1 });
    const seekers = await User.find({ _id: { $in: reviews.map((r) => r.seekerId) } }).select('name title');
    const byId = {};
    for (const s of seekers) byId[String(s._id)] = s;
    res.set('Cache-Control', 'no-store');
    res.json({
      reviews: reviews.map((r) => ({
        id: r._id,
        seekerId: r.seekerId,
        seekerName: byId[String(r.seekerId)]?.name || 'Talent',
        seekerTitle: byId[String(r.seekerId)]?.title || '',
        rating: r.rating,
        review: r.review,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Employer reviews error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: delete an inappropriate talent review.
app.delete('/api/admin/talent-reviews/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
    const removed = await TalentReview.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ message: 'Review not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error('Admin review delete error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── AI Auto-Apply ───────────────────────────────────────────────────────────
// The admin stores an AI provider + API key + chosen model in SiteConfig
// ('ai'). Seekers connect their Gmail/Outlook account once; when they hit
// "Apply with AI" the platform drafts a personalised cover letter from their
// profile + CV and emails it (with the CV attached) from their own inbox.

const nodeCrypto = require('crypto');

// Encrypt/decrypt app passwords stored on EmailConnection documents.
function aiSecretKey() {
  return nodeCrypto.createHash('sha256').update(process.env.JWT_SECRET || 'talentrix-dev-secret').digest();
}
function encryptSecret(plain) {
  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', aiSecretKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: enc.toString('base64'),
  });
}
function decryptSecret(payload) {
  if (!payload) return '';
  try {
    const { iv, tag, ct } = JSON.parse(payload);
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', aiSecretKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// Known LLM providers. OpenAI/Anthropic/Gemini use their native APIs; Groq,
// OpenRouter, Together and any "custom" base URL speak the OpenAI-compatible
// chat completions protocol, so they share one code path.
const AI_PROVIDERS = {
  openai:     { label: 'OpenAI',              kind: 'openai',    base: 'https://api.openai.com/v1' },
  gemini:     { label: 'Google Gemini',       kind: 'gemini',    base: 'https://generativelanguage.googleapis.com/v1beta' },
  anthropic:  { label: 'Anthropic',           kind: 'anthropic', base: 'https://api.anthropic.com' },
  groq:       { label: 'Groq',                kind: 'openai',    base: 'https://api.groq.com/openai/v1' },
  openrouter: { label: 'OpenRouter',          kind: 'openai',    base: 'https://openrouter.ai/api/v1' },
  together:   { label: 'Together AI',         kind: 'openai',    base: 'https://api.together.xyz/v1' },
  custom:     { label: 'Custom (OpenAI-compatible)', kind: 'openai', base: '' },
};

async function aiApiError(res) {
  let msg = `AI request failed (${res.status})`;
  try {
    const d = await res.json();
    if (d.error?.message) msg = d.error.message;
    else if (d.error) msg = String(d.error);
  } catch { /* keep default */ }
  return new Error(msg);
}

// Live model listing — used by the admin (after entering a key) so they can
// pick which model the auto-apply AI uses.
async function listAiModels({ provider, apiKey, baseUrl }) {
  const p = AI_PROVIDERS[provider] || AI_PROVIDERS.openai;
  const base = (provider === 'custom' ? baseUrl : p.base || '').replace(/\/$/, '');
  if (!base || !apiKey) return [];

  if (p.kind === 'anthropic') {
    const res = await fetch(`${base}/v1/models`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw await aiApiError(res);
    const d = await res.json();
    return (d.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id })).filter((m) => m.id);
  }

  if (p.kind === 'gemini') {
    const res = await fetch(`${base}/models?key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw await aiApiError(res);
    const d = await res.json();
    return (d.models || [])
      .map((m) => ({ id: String(m.name || '').replace(/^models\//, ''), label: m.displayName || String(m.name || '').replace(/^models\//, '') }))
      .filter((m) => m.id && !/generateContent$/.test(m.id));
  }

  const res = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw await aiApiError(res);
  const d = await res.json();
  return (d.data || []).map((m) => ({ id: m.id, label: m.id })).filter((m) => m.id);
}

// One chat completion round-trip against the configured provider/model.
async function aiChat(cfg, { system, user, max = 900 }) {
  const p = AI_PROVIDERS[cfg.provider] || AI_PROVIDERS.openai;
  const base = (cfg.provider === 'custom' ? cfg.baseUrl : p.base || '').replace(/\/$/, '');
  const model = cfg.model;
  if (!model) throw new Error('No AI model selected yet.');
  if (!cfg.apiKey) throw new Error('AI is not configured yet.');

  if (p.kind === 'anthropic') {
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: max, system, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw await aiApiError(res);
    const d = await res.json();
    return (d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  }

  if (p.kind === 'gemini') {
    const res = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: max, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw await aiApiError(res);
    const d = await res.json();
    return (d.candidates?.[0]?.content?.parts || []).map((pt) => pt.text || '').join('\n').trim();
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: max,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw await aiApiError(res);
  const d = await res.json();
  return (d.choices?.[0]?.message?.content || '').trim();
}

function maskKey(key) {
  const s = String(key || '');
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 4) + '••••••' + s.slice(-4);
}

// Parse a `data:<mime>;base64,<payload>` string (CVs are stored like this).
function decodeDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) return null;
  return { mime: (m[1] || 'application/octet-stream').toLowerCase(), base64: m[3] };
}

// If the uploaded CV is plain text we can also feed its contents to the AI so
// the cover letter reflects the full CV, not just the structured profile.
function cvToPlainText(cv) {
  const d = decodeDataUrl(cv);
  if (!d) return '';
  if (d.mime.startsWith('text/') || d.mime.includes('json')) {
    try {
      return Buffer.from(d.base64, 'base64').toString('utf8').slice(0, 6000);
    } catch {
      return '';
    }
  }
  return '';
}

function profileContext(user) {
  const lines = [];
  lines.push(`Name: ${user.name || ''}`);
  if (user.title) lines.push(`Headline: ${user.title}`);
  if (user.summary) lines.push(`Summary: ${user.summary}`);
  if ((user.skills || []).filter(Boolean).length) lines.push(`Skills: ${user.skills.filter(Boolean).join(', ')}`);
  if ((user.languages || []).filter(Boolean).length) lines.push(`Languages: ${user.languages.filter(Boolean).join(', ')}`);
  const exp = (user.experience || []).slice(0, 4)
    .map((e) => `${e.title || ''} — ${e.company || ''} (${e.start || ''}${e.end ? ' – ' + e.end : ''})${e.description ? ': ' + e.description : ''}`)
    .filter(Boolean).join('\n');
  if (exp) lines.push(`Experience:\n${exp}`);
  const edu = (user.education || []).slice(0, 3)
    .map((e) => `${e.school || ''}, ${e.degree || ''}${e.field ? ' — ' + e.field : ''}`)
    .filter(Boolean).join('\n');
  if (edu) lines.push(`Education:\n${edu}`);
  const prj = (user.projects || []).slice(0, 3)
    .map((p) => `${p.name || ''}${p.description ? ': ' + p.description : ''}`)
    .filter(Boolean).join('\n');
  if (prj) lines.push(`Projects:\n${prj}`);
  if (user.github) lines.push(`GitHub: ${user.github}`);
  if (user.website) lines.push(`Website: ${user.website}`);
  if (user.linkedin) lines.push(`LinkedIn: ${user.linkedin}`);
  return lines.join('\n');
}

function discoverApplyEmail(job) {
  const direct = job.email || job.applyEmail || job.contactEmail;
  if (direct && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(direct))) return String(direct).trim();
  const hay = `${job.description || ''} ${job.company || ''}`;
  const found = (hay.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [])
    .map((s) => s.replace(/[.,;:!?)]$/, ''))
    .find((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  return found || '';
}

// ── Employer-demand skill analysis + learning modules ────────────────────────
// When an employer creates a talent request, the AI validates the required
// skills/tools for that role against what the market actually needs, then we
// notify affected talents (update their profile / learn) and their hubs
// (add these skills to your training modules). Hubs can also generate a full
// learning module by typing a role.

function parseAiJson(text, fallback) {
  try {
    return JSON.parse(String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim());
  } catch {
    return fallback || {};
  }
}

function normSkills(items) {
  return [...new Set((items || []).map(normalizeTag).filter((x) => x.length >= 2))];
}

// Confirm whether each demanded skill/tool is genuinely required for a role by
// asking the AI. Returns { valid, irrelevant, marketNote }.
async function analyzeSkillDemand(tr) {
  const cfg = await getConfig('ai');
  if (!cfg?.apiKey || !cfg?.model) return null;
  const skills = (tr.skills || []).filter(Boolean);
  const tools = (tr.tools || []).filter(Boolean);
  if (!skills.length && !tools.length) return null;
  const system = 'You analyse employer hiring demand against the current job market. For a given role, you confirm which skills and tools are genuinely required today and flag anything that is not a real requirement for that role. Be practical and specific.';
  const prompt = [
    `ROLE: ${tr.role || ''}`,
    `REQUIRED SKILLS: ${skills.join(', ') || '(none)'}`,
    `REQUIRED TOOLS: ${tools.join(', ') || '(none)'}`,
    `EMPLOYER DESCRIPTION: ${(tr.description || '').slice(0, 800)}`,
    '',
    'Return JSON only with these fields:',
    '  "valid": [skills/tools that are genuinely required for this role today]',
    '  "irrelevant": [skills/tools that are NOT genuinely needed for this role]',
    '  "marketNote": "one short sentence on what employers currently expect for this role (call out in-demand skills/tools the employer did not list)"',
  ].join('\n');
  const reply = await aiChat(cfg, { system, user: prompt, max: 600 });
  const parsed = parseAiJson(reply, {});
  const valid = [...new Set((parsed.valid || []).filter(Boolean).map((x) => String(x).trim()))];
  const irrelevant = [...new Set((parsed.irrelevant || []).filter(Boolean).map((x) => String(x).trim()))];
  return {
    valid: valid.length ? valid : skills.concat(tools), // never drop the employer's list entirely
    irrelevant,
    marketNote: String(parsed.marketNote || '').slice(0, 400),
  };
}

// Approved+interviewed seekers whose headline/summary fit the requested role
// but who are missing at least one of the demanded skills/tools.
async function findAffectedTalents(tr, demanded) {
  const roleWords = normalizeTag(tr.role || '').split(' ').filter((w) => w.length > 2);
  if (!roleWords.length) return [];
  const wanted = normSkills(demanded);
  const seekers = await User.find({ role: 'seeker', status: 'approved', active: true, interviewDone: true })
    .select('-password -e2ePriv');
  const affected = [];
  for (const s of seekers) {
    const titleTag = normalizeTag(s.title || '');
    const summaryTag = normalizeTag(s.summary || '');
    if (!roleWords.some((w) => titleTag.includes(w) || summaryTag.includes(w))) continue;
    const profileSkills = (s.skills || []).map(normalizeTag);
    const missingItems = wanted.filter(
      (item) => !profileSkills.some((p) => p.includes(item) || item.includes(p)) && !titleTag.includes(item) && !summaryTag.includes(item),
    );
    if (!missingItems.length) continue;
    affected.push({ user: s, missingItems });
    if (affected.length >= 200) break;
  }
  return affected;
}

function shortList(items, max = 4) {
  return items.slice(0, max).join(', ') + (items.length > max ? '…' : '');
}

// One-shot: validate the request's demanded skills, notify every affected
// talent + their hub, upsert a demand-driven learning module, and (if the AI
// flagged anything) warn the admin. Fire-and-forget from request creation.
async function runSkillDemandAnalysis(tr) {
  try {
    const analysis = await analyzeSkillDemand(tr);
    if (!analysis) return null;
    const demanded = analysis.valid;
    const affected = await findAffectedTalents(tr, demanded);
    const role = tr.role || '';

    // 1) Notify affected talents (dedup by user, once per request).
    const talentNotifs = affected.map((a) => ({
      userId: a.user._id,
      type: 'skill_gap',
      title: `Employers need ${shortList(a.missingItems)} for ${role} roles`,
      body: `A new employer request for ${role} requires skills not on your profile yet: ${a.missingItems.join(', ')}. Update your profile or learn these skills so you appear in new matches.${analysis.marketNote ? ' ' + analysis.marketNote : ''}`,
      payload: { requestId: tr._id, role, missingItems: a.missingItems, marketNote: analysis.marketNote },
    }));
    if (talentNotifs.length) await Notification.insertMany(talentNotifs);

    // 2) Notify each unique hub attached to those talents.
    const hubIds = [...new Set(affected.map((a) => String(a.user.hubId)).filter(Boolean))];
    const hubNotifs = [];
    for (const hubId of hubIds) {
      hubNotifs.push({
        userId: hubId,
        type: 'skill_gap_hub',
        title: `Update your training: employers need ${shortList(demanded)}`,
        body: `New employer demand for ${role} roles includes: ${demanded.join(', ')}. Add these to your learning modules so your talent pool stays competitive.${analysis.marketNote ? ' ' + analysis.marketNote : ''}`,
        payload: { requestId: tr._id, role, skills: demanded, marketNote: analysis.marketNote },
      });
    }
    if (hubNotifs.length) await Notification.insertMany(hubNotifs);

    // 3) Auto-publish/refresh a learning module for this role from the demand.
    let moduleId = null;
    const module = await upsertLearningModuleForDemand(tr.role || '', demanded, analysis.marketNote);
    if (module) {
      moduleId = module._id;
      for (const hubId of hubIds) {
        await Notification.create({
          userId: hubId,
          type: 'learning_module',
          title: `New learning module published: ${role}`,
          body: `A learning module for ${role} is ready — based on a live employer request. Open the Learning Modules tab to view courses and resources.`,
          payload: { requestId: tr._id, moduleId: module._id, role },
        });
      }
    }

    // 4) Admin: flag anything the AI couldn't validate as a real requirement.
    if (analysis.irrelevant.length) {
      const admin = await User.findOne({ role: 'admin' });
      if (admin) {
        await Notification.create({
          userId: admin._id,
          type: 'demand_anomaly',
          title: `Suspicious skills flagged in a ${role} request`,
          body: `An employer request for ${role} listed: ${analysis.irrelevant.join(', ')} — the AI does not recognise these as real requirements for that role.`,
          payload: { requestId: tr._id, irrelevant: analysis.irrelevant, role },
        });
      }
    }

    const summary = {
      valid: demanded,
      irrelevant: analysis.irrelevant,
      marketNote: analysis.marketNote,
      talentsNotified: talentNotifs.length,
      hubsNotified: hubNotifs.length,
      moduleGenerated: !!moduleId,
      sentAt: new Date(),
    };

    // Persist on the request (schema is Mixed-heavy; assign directly).
    tr.analysis = summary;
    try { await tr.save(); } catch { /* non-fatal */ }
    return summary;
  } catch (e) {
    console.error('Skill demand analysis error:', e.message);
    return null;
  }
}

// Generate a full learning module (skills/tools/courses/resources) for a role
// using the configured AI. Throws if AI is not configured.
async function generateLearningModule(role, opts = {}) {
  const cfg = await getConfig('ai');
  if (!cfg?.apiKey) throw new Error('AI is not configured yet — ask the admin to add an API key.');
  if (!cfg?.model) throw new Error('No AI model selected yet — ask the admin to pick a model.');
  const system = 'You create practical, up-to-date learning roadmaps for job roles. Recommend real, reputable learning resources (YouTube, Coursera, Udemy, freeCodeCamp, official docs, MDN, etc.) and the exact skills and tools the role requires today. Never invent URLs — only recommend well-known courses with stable, real links or official documentation.';
  const prompt = [
    `ROLE: ${role}`,
    opts.skills && opts.skills.length ? `SKILLS TO COVER: ${opts.skills.join(', ')}` : '',
    opts.tools && opts.tools.length ? `TOOLS TO COVER: ${opts.tools.join(', ')}` : '',
    opts.context ? `CONTEXT: ${opts.context}` : '',
    '',
    'Return JSON only with fields:',
    '  "skills": [ordered list of skills a learner should master]',
    '  "tools": [tools the role uses day-to-day]',
    '  "courses": [exactly 3-5 objects with "title", "provider", "url", "duration" ("6 hours" etc.), "description" (one line)]',
    '  "resources": [free practice sites / official docs, as plain strings]',
    '  "marketNote": "one sentence on current industry demand"',
    '',
    'If you cannot give a real, stable URL for a course, omit that course and pick one you know exists.',
  ].filter(Boolean).join('\n');
  const reply = await aiChat(cfg, { system, user: prompt, max: 1400 });
  const parsed = parseAiJson(reply, {});
  return {
    role: String(role).slice(0, 200),
    skills: [...new Set([...(parsed.skills || []).filter(Boolean), ...(opts.skills || [])].map((x) => String(x).trim()).filter(Boolean))],
    tools: [...new Set([...(parsed.tools || []).filter(Boolean), ...(opts.tools || [])].map((x) => String(x).trim()).filter(Boolean))],
    courses: (parsed.courses || []).slice(0, 5).map((c) => ({
      title: String(c.title || '').slice(0, 200),
      provider: String(c.provider || '').slice(0, 80),
      url: String(c.url || '').slice(0, 500),
      duration: String(c.duration || '').slice(0, 60),
      description: String(c.description || '').slice(0, 300),
    })),
    resources: (parsed.resources || []).slice(0, 6).map((r) => String(r || '').slice(0, 300)),
    marketNote: String(parsed.marketNote || '').slice(0, 400),
  };
}

// Upsert a demand-driven learning module for a role (called from the skill
// analysis). Existing modules are refreshed, not duplicated.
async function upsertLearningModuleForDemand(role, validItems, marketNote) {
  try {
    if (!role || !validItems.length) return null;
    const roleKey = normalizeTag(role);
    const skills = validItems.filter((x) => !/^(tool:)/i.test(x));
    const tools = validItems.filter((x) => /^(tool:)/i.test(x)).map((x) => x.replace(/^tool:\s*/i, ''));
    const context = `A live employer request for ${role} requires: ${validItems.join(', ')}.`;
    const generated = await generateLearningModule(role, { skills, tools, context });
    const existing = await LearningModule.findOne({ roleKey });
    if (existing) {
      Object.assign(existing, generated, {
        skills: [...new Set([...(existing.skills || []), ...generated.skills])],
        tools: [...new Set([...(existing.tools || []), ...generated.tools])],
        courses: generated.courses.length ? generated.courses : existing.courses,
        demandNote: context,
        marketNote: marketNote || generated.marketNote || existing.marketNote,
        source: 'demand',
        updatedAt: new Date(),
      });
      await existing.save();
      return existing;
    }
    const created = await LearningModule.create({
      ...generated,
      roleKey,
      demandNote: context,
      marketNote: marketNote || generated.marketNote || '',
      source: 'demand',
      updatedAt: new Date(),
    });
    return created;
  } catch (e) {
    console.error('Upsert learning module error:', e.message);
    return null;
  }
}

function publicLearningModule(m) {
  return {
    id: m._id,
    roleKey: m.roleKey,
    role: m.role,
    skills: m.skills || [],
    tools: m.tools || [],
    courses: m.courses || [],
    resources: m.resources || [],
    marketNote: m.marketNote || '',
    demandNote: m.demandNote || '',
    source: m.source || 'manual',
    hidden: !!m.hidden,
    approved: !!m.approved,
    updatedAt: m.updatedAt,
    createdAt: m.createdAt,
  };
}

// Mailbox presets so connecting Gmail/Outlook requires only an app password.
// When the caller explicitly picked "Custom SMTP" we never force a provider
// host, even if the address looks like gmail/outlook.
function emailPresetFor(address, provider) {
  const domain = String(address || '').split('@')[1]?.toLowerCase() || '';
  const p = String(provider || '');
  if (p === 'gmail' || (p !== 'smtp' && (domain.includes('gmail') || domain.includes('googlemail')))) {
    return { provider: 'gmail', host: 'smtp.gmail.com', port: 465, secure: true };
  }
  if (p === 'outlook' || (p !== 'smtp' && /(outlook|hotmail|live|msn|office365|microsoft)/.test(domain))) {
    return { provider: 'outlook', host: 'smtp.office365.com', port: 587, secure: false };
  }
  return { provider: 'smtp', host: '', port: 587, secure: false };
}

// Short, human-friendly explanations for the common SMTP failures so the
// talent knows exactly what to fix instead of seeing a raw server error.
function smtpErrorText(e) {
  const m = String((e && e.message) || e || '');
  if (/5\.7\.(30|139)|smtpclientauthentication|basic auth|basic authentication/i.test(m)) {
    return 'This mail provider has retired basic SMTP login for this account. Use a Gmail account, or connect with OAuth (Google/Microsoft) for a setup that always works.';
  }
  if (/EAUTH|535|username and password|incorrect/i.test(m)) {
    return 'The app password was rejected. Turn on 2-Step Verification, create an app password under Account → Security, and enter it without spaces.';
  }
  if (/ETIMEDOUT|ECONNREFUSED|ESOCKET|ENOTFOUND|greeting/i.test(m)) {
    return 'Could not reach the mail server (connection timed out). Your network may block SMTP ports 465/587, or the server is temporarily down. You can still save the mailbox and try sending.';
  }
  return String(m).slice(0, 300);
}

function buildUserTransporter(conn) {
  const common = {
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  };
  const oauth = conn.oauth;
  if (oauth && (oauth.refreshToken || oauth.accessToken)) {
    return nodemailer.createTransport({
      ...common,
      host: conn.host,
      port: Number(conn.port || 465),
      secure: !!conn.secure,
      auth: {
        type: 'OAuth2',
        user: conn.user || conn.email,
        clientId: oauth.clientId || '',
        clientSecret: oauth.clientSecret ? decryptSecret(String(oauth.clientSecret)) : '',
        refreshToken: oauth.refreshToken || '',
        accessToken: oauth.accessToken || '',
        expires: oauth.accessTokenExpires ? +oauth.accessTokenExpires : undefined,
      },
    });
  }
  return nodemailer.createTransport({
    ...common,
    host: conn.host,
    port: Number(conn.port || 465),
    secure: !!conn.secure,
    auth: { user: conn.user || conn.email, pass: decryptSecret(conn.secret) },
  });
}

function cvAttachment(user) {
  const d = decodeDataUrl(user.cv);
  if (!d) return undefined;
  const ext = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/rtf': 'rtf',
    'text/plain': 'txt',
    'text/markdown': 'md',
  }[d.mime] || 'bin';
  return {
    filename: `${(user.name || 'candidate').replace(/[^\w-]+/g, '_')}-CV.${ext}`,
    content: Buffer.from(d.base64, 'base64'),
    contentType: d.mime,
  };
}

function coverLetterToHtml(text, user) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paras = String(text).split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
  const body = paras.map((p) => `<p style="margin:0 0 14px;line-height:1.6">${esc(p)}</p>`).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.6">${body}<p style="margin:0">${esc(user.name || 'Candidate')}</p></div>`;
}

async function generateApplication(user, job, cvText) {
  const cfg = await getConfig('ai');
  if (!cfg?.apiKey) throw new Error('AI is not configured yet — ask the admin to add an API key.');
  if (!cfg?.model) throw new Error('No AI model selected yet — ask the admin to pick a model.');
  const ctx = profileContext(user) + (cvText ? `\n\nCV (extracted text):\n${cvText}` : '');
  const jobText = [
    `Title: ${job.title || ''}`,
    `Company: ${job.company || ''}`,
    `Location: ${job.location || ''}`,
    `Type: ${job.type || ''}`,
    `Salary: ${job.salary || ''}`,
    `Skills: ${(job.skills || []).filter(Boolean).join(', ')}`,
    `Description:\n${(job.description || '').slice(0, 4000)}`,
  ].join('\n');
  const system = 'You are an expert job-application writer. Write concise, persuasive, professional cover letters tailored to each posting. Never invent facts about the candidate — only use what is provided. No awkward placeholders.';
  const userPrompt = [
    'Write a short professional cover letter email for the job below using ONLY the candidate\'s real details.',
    'Return JSON with exactly two fields: "subject" (a short email subject line) and "body" (plain-text paragraphs ready to paste into an email).',
    'JOB:',
    jobText,
    'CANDIDATE:',
    ctx || 'No structured profile provided — keep it brief and factual.',
  ].join('\n');
  const reply = await aiChat(cfg, { system, user: userPrompt });
  let subject = `Application: ${job.title || 'Job'}${job.company ? ' at ' + job.company : ''}`;
  let body = reply;
  try {
    const clean = String(reply).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(clean);
    if (parsed.subject) subject = String(parsed.subject).slice(0, 200);
    if (parsed.body) body = String(parsed.body);
  } catch { /* model returned plain text — use it as the body */ }
  return { subject, body };
}

function publicApplication(a) {
  return {
    id: a._id,
    seekerId: a.seekerId,
    jobId: a.jobId,
    jobTitle: a.jobTitle,
    company: a.company,
    source: a.source,
    url: a.url,
    toEmail: a.toEmail,
    subject: a.subject,
    coverLetter: a.coverLetter,
    method: a.method,
    status: a.status,
    error: a.error,
    sentAt: a.sentAt,
    createdAt: a.createdAt,
  };
}

// ── AI Auto-Apply: seeker email connection ─────────────────────────────────

app.get('/api/email/status', authenticateToken, async (req, res) => {
  try {
    const doc = await EmailConnection.findOne({ userId: req.user.userId });
    const usable = !!doc && (!!doc.verifiedAt || !!(doc.oauth && (doc.oauth.refreshToken || doc.oauth.accessToken)));
    res.json({
      connected: !!doc,
      verified: usable,
      needsReAuth: !!doc && !usable,
      connection: doc
        ? {
            provider: doc.provider,
            email: doc.email,
            displayName: doc.displayName,
            host: doc.host,
            port: doc.port,
            secure: !!doc.secure,
            verified: usable,
            oauth: !!doc.oauth,
            verifiedAt: doc.verifiedAt || null,
          }
        : null,
    });
  } catch (error) {
    console.error('Email status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/email/connect', authenticateToken, async (req, res) => {
  try {
    const { provider, email, displayName, host, port, secure, user, password, skipVerify, oauth } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }
    const isOAuth = !!(oauth && (oauth.refreshToken || oauth.accessToken));
    if (!isOAuth && !password) {
      return res.status(400).json({ message: 'Please provide the app password for this mailbox.' });
    }

    const preset = emailPresetFor(email, provider);
    const parsedPort = Number(port || preset.port || 587);
    const con = {
      userId: req.user.userId,
      provider: preset.provider,
      email: String(email).trim().toLowerCase(),
      displayName: String(displayName || '').trim(),
      host: String(host || preset.host || '').trim(),
      port: Number.isFinite(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : 587,
      secure: secure !== undefined ? !!secure : !!preset.secure,
      user: String(user || email || '').trim(),
    };

    if (isOAuth) {
      con.provider = oauth.kind === 'microsoft' ? 'outlook' : 'gmail';
      if (!con.host) {
        if (con.provider === 'gmail') { con.host = 'smtp.gmail.com'; con.port = 465; con.secure = true; }
        else { con.host = 'smtp.office365.com'; con.port = 587; con.secure = false; }
      }
    }

    if (!con.host) return res.status(400).json({ message: 'We could not detect this mailbox\'s server. Use the Custom provider and fill in your SMTP settings.' });

    // Verify before saving, unless the talent chose "Save without testing"
    // (their network may block SMTP) or this is an OAuth connection.
    if (!isOAuth && !skipVerify) {
      const test = nodemailer.createTransport({
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 30000,
        host: con.host,
        port: con.port,
        secure: con.secure,
        auth: { user: con.user, pass: String(password) },
      });
      try {
        await test.verify();
      } catch (e) {
        return res.status(400).json({
          message: smtpErrorText(e),
          detail: String(e.message || '').slice(0, 300),
          canSkip: true,
        });
      }
    }

    const existing = await EmailConnection.findOne({ userId: req.user.userId });
    const doc = existing || new EmailConnection({ userId: req.user.userId });
    const saved = { ...con };
    if (isOAuth) {
      saved.oauth = {
        kind: oauth.kind || (con.provider === 'outlook' ? 'microsoft' : 'google'),
        refreshToken: String(oauth.refreshToken || ''),
        accessToken: String(oauth.accessToken || ''),
        accessTokenExpires: oauth.accessTokenExpires ? new Date(oauth.accessTokenExpires) : undefined,
        clientId: String(oauth.clientId || ''),
        clientSecret: oauth.clientSecret ? encryptSecret(String(oauth.clientSecret)) : '',
      };
      saved.secret = '';
      saved.verifiedAt = null;
    } else {
      saved.secret = encryptSecret(String(password));
      saved.verifiedAt = skipVerify ? null : new Date();
      saved.oauth = null;
    }
    Object.assign(doc, saved);
    await doc.save();
    res.json({
      ok: true,
      email: doc.email,
      provider: doc.provider,
      host: doc.host,
      port: doc.port,
      secure: !!doc.secure,
      displayName: doc.displayName,
      verified: !!doc.verifiedAt || isOAuth,
      oauth: isOAuth,
    });
  } catch (error) {
    console.error('Email connect error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/email/connect', authenticateToken, async (req, res) => {
  try {
    await EmailConnection.deleteOne({ userId: req.user.userId });
    res.json({ ok: true });
  } catch (error) {
    console.error('Email disconnect error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── AI Auto-Apply: OAuth 2.0 (Google / Microsoft) ────────────────────────────
// Google Workspace and Microsoft 365 retired SMTP app passwords, so talents
// can instead connect via a real OAuth flow. The admin stores the OAuth app
// credentials in SiteConfig('oauth') → { google: {..}, microsoft: {..} }.

async function oauthClientFor(kind) {
  const cfg = (await getConfig('oauth')) || {};
  return cfg[kind] || null;
}

function oauthState(jwt) {
  return Buffer.from(JSON.stringify({ t: jwt })).toString('base64url');
}
function oauthStateDecode(raw) {
  try {
    return JSON.parse(Buffer.from(String(raw || ''), 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

app.get('/api/oauth/:provider/auth', authenticateToken, async (req, res) => {
  try {
    const kind = req.params.provider === 'microsoft' ? 'microsoft' : 'google';
    const client = await oauthClientFor(kind);
    if (!client?.clientId || !client?.clientSecret) {
      return res.status(400).json({
        message: `OAuth is not configured yet — ask the admin to add ${kind === 'microsoft' ? 'Microsoft' : 'Google'} OAuth credentials in the admin panel.`,
      });
    }
    const redirectUri = client.redirectUri || `${req.protocol}://${req.get('host')}/api/oauth/${kind}/callback`;
    const state = oauthState(req.headers.authorization?.replace(/^Bearer\s+/i, '') || '');
    let url;
    if (kind === 'microsoft') {
      url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(client.clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent('offline_access openid email profile User.Read https://outlook.office.com/SMTP.Send')}&state=${encodeURIComponent(state)}`;
    } else {
      url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(client.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('openid email profile https://www.googleapis.com/auth/gmail.send')}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    }
    res.json({ url, kind });
  } catch (error) {
    console.error('OAuth auth error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/oauth/:provider/callback', async (req, res) => {
  try {
    const kind = req.params.provider === 'microsoft' ? 'microsoft' : 'google';
    const code = String(req.query.code || '');
    const { t: jwt } = oauthStateDecode(req.query.state);
    if (!code || !jwt) return res.status(400).send('Missing OAuth parameters.');
    let payload = null;
    try { payload = jwt.verify(jwt, process.env.JWT_SECRET); } catch { /* invalid token */ }
    if (!payload?.userId) return res.status(400).send('Invalid session. Please log in again.');
    const user = await User.findById(payload.userId);
    if (!user) return res.status(400).send('User not found.');

    const client = await oauthClientFor(kind);
    if (!client?.clientId || !client?.clientSecret) return res.status(400).send('OAuth is not configured.');
    const redirectUri = client.redirectUri || `${req.protocol}://${req.get('host')}/api/oauth/${kind}/callback`;

    const tokenUrl = kind === 'microsoft'
      ? 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
      : 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const res2 = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res2.json();
    if (!res2.ok) {
      console.error('OAuth token exchange error:', data);
      return res.status(400).send('Could not finish OAuth. Try again.');
    }

    const email = String(data.email || user.email || '').trim();
    const existing = await EmailConnection.findOne({ userId: user._id });
    const doc = existing || new EmailConnection({ userId: user._id });
    Object.assign(doc, {
      provider: kind === 'microsoft' ? 'outlook' : 'gmail',
      email,
      displayName: String(data.name || user.name || '').trim(),
      host: kind === 'microsoft' ? 'smtp.office365.com' : 'smtp.gmail.com',
      port: kind === 'microsoft' ? 587 : 465,
      secure: kind !== 'microsoft',
      user: email || (kind === 'microsoft' ? 'smtp.office365.com' : ''), // nodemailer OAuth2 uses the account email for SMTPS.PA
      secret: '',
      oauth: {
        kind,
        refreshToken: String(data.refresh_token || '').slice(0, 500),
        accessToken: String(data.access_token || '').slice(0, 4000),
        accessTokenExpires: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
        clientId: String(client.clientId || ''),
        clientSecret: client.clientSecret ? encryptSecret(String(client.clientSecret)) : '',
      },
      verifiedAt: new Date(),
    });
    await doc.save();

    const origin = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    res.redirect(`${origin}/dashboard/seeker?mailbox=connected`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('OAuth failed. Please try again.');
  }
});

// ── AI Auto-Apply: draft & send ─────────────────────────────────────────────

// Whether the platform's AI is configured (so the UI can steer the talent).
app.get('/api/ai/status', authenticateToken, async (req, res) => {
  try {
    const cfg = await getConfig('ai');
    res.json({
      configured: !!(cfg?.apiKey && cfg?.model),
      provider: cfg?.provider || '',
      model: cfg?.model || '',
    });
  } catch (error) {
    console.error('AI status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate (don't send) a tailored cover letter for a job.
app.post('/api/ai/apply/draft', authenticateToken, async (req, res) => {
  try {
    const job = req.body?.job;
    if (!job) return res.status(400).json({ message: 'Missing job details.' });
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const { subject, body } = await generateApplication(user, job, cvToPlainText(user.cv));
    res.json({ subject, body, toEmail: discoverApplyEmail(job), cvAttached: !!user.cv });
  } catch (error) {
    console.error('AI draft error:', error);
    res.status(400).json({ message: error.message || 'Could not generate the application.' });
  }
});

// Finalise and send the application from the talent's own inbox.
app.post('/api/ai/apply/send', authenticateToken, async (req, res) => {
  try {
    const { job, subject, coverLetter, toEmail } = req.body || {};
    if (!job) return res.status(400).json({ message: 'Missing job details.' });
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const record = {
      seekerId: user._id,
      jobId: job._id || job.id || '',
      jobTitle: job.title || '',
      company: job.company || '',
      source: job.source || 'Platform',
      url: job.url || '',
      subject: String(subject || '').slice(0, 300),
      coverLetter: String(coverLetter || ''),
    };
    const target = String(toEmail || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      const drafted = await Application.create({ ...record, toEmail: '', method: 'draft', status: 'draft' });
      return res.json({ application: publicApplication(drafted), method: 'draft' });
    }

    const conn = await EmailConnection.findOne({ userId: user._id });
    if (!conn) return res.status(400).json({ message: 'Connect your email first.' });

    try {
      const transporter = buildUserTransporter(conn);
      await transporter.sendMail({
        from: `"${conn.displayName || user.name || 'Candidate'}" <${conn.email}>`,
        to: target,
        subject: record.subject,
        text: record.coverLetter,
        html: coverLetterToHtml(record.coverLetter, user),
        attachments: cvAttachment(user),
      });
    } catch (e) {
      const failed = await Application.create({ ...record, toEmail: target, method: 'email', status: 'failed', error: e.message });
      console.error('AI apply send error:', e.message);
      return res.status(400).json({ message: 'The email could not be sent. ' + e.message, application: publicApplication(failed) });
    }

    const sent = await Application.create({ ...record, toEmail: target, method: 'email', status: 'sent', sentAt: new Date() });
    await Notification.create({
      userId: user._id,
      type: 'application',
      title: 'Application sent',
      body: `Your application for ${job.title || 'the role'}${job.company ? ' at ' + job.company : ''} was emailed from ${conn.email}.`,
    });
    res.json({ application: publicApplication(sent), method: 'email' });
  } catch (error) {
    console.error('AI apply error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Applications the current seeker has submitted (sent or manual drafts).
app.get('/api/applications', authenticateToken, async (req, res) => {
  try {
    const list = await Application.find({ seekerId: req.user.userId }).sort({ createdAt: -1 }).limit(100);
    res.json({ applications: list.map(publicApplication) });
  } catch (error) {
    console.error('Applications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── AI Auto-Apply: admin ────────────────────────────────────────────────────

// Live model list test — the admin enters a key + provider and we ask the
// provider which models exist, before anything is saved.
app.post('/api/admin/ai/models', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    let { provider, apiKey, baseUrl } = req.body || {};
    provider = provider || 'openai';
    // A blank key in the form means "use the already-saved key".
    if (!apiKey) {
      const saved = (await getConfig('ai')) || {};
      apiKey = saved.apiKey || '';
    }
    if (!apiKey) return res.status(400).json({ message: 'Enter an API key first.' });
    const models = await listAiModels({ provider, apiKey, baseUrl });
    if (!models.length) return res.status(400).json({ message: 'No models returned. Check the provider and key.' });
    res.json({ models, count: models.length });
  } catch (error) {
    console.error('Admin AI models error:', error);
    res.status(400).json({ message: error.message || 'Could not load models. Check the key and provider.' });
  }
});

// Admin read of the saved AI config (key masked) + live model list.
app.get('/api/admin/ai/config', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const cfg = (await getConfig('ai')) || {};
    const hasKey = !!(cfg.apiKey || '').length;
    let models = [];
    let modelError = '';
    if (hasKey) {
      try {
        models = await listAiModels({ provider: cfg.provider, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });
      } catch (e) {
        modelError = e.message;
      }
    }
    res.json({
      config: { provider: cfg.provider || 'openai', model: cfg.model || '', baseUrl: cfg.baseUrl || '', apiKeyMasked: hasKey ? maskKey(cfg.apiKey) : '', hasKey },
      models,
      modelError,
    });
  } catch (error) {
    console.error('Admin AI config error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Every AI-assisted application across the platform (for the admin panel).
app.get('/api/admin/applications', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const { status, q } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    let list = await Application.find(filter).sort({ createdAt: -1 }).limit(200);
    if (q && q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      list = list.filter((a) => rx.test(a.jobTitle) || rx.test(a.company) || rx.test(a.toEmail) || rx.test(a.subject));
    }
    const userIds = [...new Set(list.map((a) => String(a.seekerId)))];
    const users = await User.find({ _id: { $in: userIds } }).select('name email');
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const applications = list.map((a) => {
      const u = byId.get(String(a.seekerId));
      return { ...publicApplication(a), seeker: u ? { id: u._id, name: u.name, email: u.email } : null };
    });
    res.json({ applications, count: applications.length });
  } catch (error) {
    console.error('Admin applications error:', error);
res.status(500).json({ message: 'Server error' });
  }
});

// ── Learning Modules (hub + admin) ──────────────────────────────────────────

// Hub: generate (or refresh) a learning module by typing a role.
app.post('/api/learning/generate', authenticateToken, async (req, res) => {
  try {
    const role = String(req.body?.role || '').trim();
    if (!role) return res.status(400).json({ message: 'Type a role to generate its module.' });
    const generated = await generateLearningModule(role, {});
    const roleKey = normalizeTag(role);
    let saved = await LearningModule.findOne({ roleKey });
    if (saved) {
      Object.assign(saved, generated, { roleKey, source: 'manual', updatedAt: new Date() });
      await saved.save();
    } else {
      saved = await LearningModule.create({ ...generated, roleKey, source: 'manual', updatedAt: new Date() });
    }
    await ModuleRequest.create({ hubId: req.user.userId, role, generatedModuleId: saved._id, status: 'generated' });
    res.json({ module: publicLearningModule(saved) });
  } catch (error) {
    console.error('Learning generate error:', error);
    res.status(400).json({ message: error.message || 'Could not generate the module. Is the platform AI configured?' });
  }
});

// Hub + admin: list learning modules (optional ?role= lookup slug).
app.get('/api/learning/modules', authenticateToken, async (req, res) => {
  try {
    const roleKey = req.query.role ? normalizeTag(String(req.query.role)) : '';
    const filter = roleKey ? { roleKey, hidden: false } : { hidden: false };
    const list = await LearningModule.find(filter).sort({ updatedAt: -1 }).limit(100);
    res.json({ modules: list.map(publicLearningModule) });
  } catch (error) {
    console.error('Learning list error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Hub: just the demand-driven modules (auto-built from live employer requests).
app.get('/api/learning/demand', authenticateToken, async (req, res) => {
  try {
    const list = await LearningModule.find({ source: 'demand', hidden: false }).sort({ updatedAt: -1 }).limit(50);
    res.json({ modules: list.map(publicLearningModule) });
  } catch (error) {
    console.error('Learning demand error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: every module plus the audit trail of hub module requests and the
// demand analyses (irrelevant-skills flags) from talent requests.
app.get('/api/admin/learning', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const [modules, requests, analyses] = await Promise.all([
      LearningModule.find({}).sort({ updatedAt: -1 }).limit(200),
      ModuleRequest.find({}).sort({ createdAt: -1 }).limit(100),
      TalentRequest.find({ analysis: { $exists: true, $ne: null } }).sort({ createdAt: -1 }).limit(100),
    ]);
    const hubIds = [...new Set(requests.map((r) => String(r.hubId)))];
    const hubs = await User.find({ _id: { $in: hubIds } }).select('name email company');
    const hubBy = new Map(hubs.map((h) => [String(h._id), h]));
    res.json({
      modules: modules.map(publicLearningModule),
      requests: requests.map((r) => {
        const h = hubBy.get(String(r.hubId));
        return { id: r._id, role: r.role, status: r.status, createdAt: r.createdAt, hub: h ? { id: h._id, name: h.name, email: h.email } : null };
      }),
      analyses: analyses.map((tr) => ({
        id: tr._id,
        role: tr.role,
        analysis: tr.analysis || null,
        createdAt: tr.createdAt,
      })),
    });
  } catch (error) {
    console.error('Admin learning error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: edit / approve / hide / unhide a module.
app.patch('/api/admin/learning/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    const mod = await LearningModule.findById(req.params.id);
    if (!mod) return res.status(404).json({ message: 'Module not found' });
    const patch = req.body || {};
    if (typeof patch.hidden === 'boolean') mod.hidden = patch.hidden;
    if (typeof patch.approved === 'boolean') mod.approved = patch.approved;
    ['role', 'skills', 'tools', 'marketNote', 'demandNote'].forEach((k) => {
      if (patch[k] !== undefined) mod[k] = patch[k];
    });
    mod.updatedAt = new Date();
    await mod.save();
    res.json({ module: publicLearningModule(mod) });
  } catch (error) {
    console.error('Admin learning patch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: delete a module.
app.delete('/api/admin/learning/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    await LearningModule.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (error) {
    console.error('Admin learning delete error:', error);
    res.status(500).json({ message: 'Server error' });
  }
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