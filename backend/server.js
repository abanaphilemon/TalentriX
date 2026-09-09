require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:5174'];
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
    name: { type: String, default: 'Talent Bridge' },
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

// Full default landing-page content. This is the source of truth for initial
// seeding, per-section resets, and backfilling older/empty docs.
const DEFAULT_SITE = {
  branding: {
    name: 'Talent Bridge',
    tagline: 'A · I',
    logo: '',
  },
  hero: {
    badge: 'AI-POWERED RECRUITMENT',
    titlePrefix: 'Hire ',
    titleHighlight: 'extraordinary',
    titleSuffix: 'talent, faster.',
    subtitle:
      'Talent Bridge AI matches you with pre-vetted candidates in days, not months. Our models read beyond the resume — surfacing people who truly fit your team.',
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
    eyebrow: 'About Talent Bridge AI',
    title: 'Recruitment, ',
    titleHighlight: 'reimagined',
    titleSuffix: ' by humans and machines.',
    body: 'We built Talent Bridge AI because hiring the best people should not be a privilege of the biggest companies. Our platform pairs advanced language models with human recruiters to bring speed, fairness, and clarity to every search.',
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
    body: 'Join 1,200+ companies using Talent Bridge AI to build world-class teams in record time.',
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
    admin = new User({ ...DEFAULT_ADMIN, role: 'admin' });
    await admin.save();
    console.log('Seeded default admin account');
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
      'projects', 'avatar', 'resumeLink', 'logo', 'cv',
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
    const count = await User.countDocuments({ role: 'seeker', hubId: hub._id });
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
    const seekers = await User.find({ role: 'seeker', hubId: req.user.userId })
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
    const filter = { role: 'seeker' };
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
        headers: { 'User-Agent': 'TalentBridgeAI-JobBoard/1.0' },
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
  res.json({ message: 'Talent Bridge AI API' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});