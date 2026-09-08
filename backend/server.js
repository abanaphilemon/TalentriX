require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}));
app.use(express.json());

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

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['hub', 'seeker', 'employer', 'admin'], required: true },

  // Hub-specific: unique invite code used in the shared registration link
  hubRef: { type: String, default: null },

  // Employer profile fields
  company: { type: String, default: '' },
  title: { type: String, default: '' },
  location: { type: String, default: '' },
  bio: { type: String, default: '' },
  linkedin: { type: String, default: '' },

  // Seeker profile fields
  skills: { type: [String], default: [] },
  summary: { type: String, default: '' },
  experience: { type: String, default: '' },
  resumeLink: { type: String, default: '' },

  // Which hub this seeker registered through (hub's userId)
  hubId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const User = mongoose.model('User', userSchema);

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
    skills: u.skills,
    summary: u.summary,
    experience: u.experience,
    resumeLink: u.resumeLink,
    hubId: u.hubId,
    createdAt: u.createdAt,
  };
}

const SiteContent = mongoose.model('SiteContent', new mongoose.Schema({
  key: { type: String, default: 'landing' },
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
  // Testimonials
  testimonialsHeading: {
    eyebrow: { type: String, default: '' },
    title: { type: String, default: '' },
    titleHighlight: { type: String, default: '' },
    body: { type: String, default: '' },
  },
  testimonials: [{
    quote: { type: String, default: '' },
    name: { type: String, default: '' },
    role: { type: String, default: '' },
    avatar: { type: String, default: '' },
  }],
  // Collaborators / partners
  partnersHeading: {
    eyebrow: { type: String, default: '' },
    title: { type: String, default: '' },
    titleHighlight: { type: String, default: '' },
  },
  collaborators: [{
    name: { type: String, default: '' },
    logo: { type: String, default: '' },
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

// Seed the default admin account + initial landing content (idempotent)
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

  const existing = await SiteContent.findOne({ key: 'landing' });
  if (!existing) {
    await new SiteContent({ key: 'landing' }).save();
    console.log('Seeded default site content');
  }
}

const DEFAULT_NAV = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Testimonials', href: '#testimonials' },
  { label: 'Partners', href: '#partners' },
  { label: 'Contact', href: '#contact' },
];

const DEFAULT_HERO_TITLES = { prefix: 'Hire ', highlight: 'extraordinary', suffix: 'talent, faster.' };

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
      'skills', 'summary', 'experience', 'resumeLink',
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const user = await User.findByIdAndUpdate(req.user.userId, updates, {
      new: true,
      runValidators: true,
    }).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found' });
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
    res.json({ seekers: seekers.map(publicUser) });
  } catch (error) {
    console.error('Seekers error:', error);
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
    ['hero', 'about', 'cta', 'testimonialsHeading', 'reviewsHeading', 'partnersHeading', 'footer', 'contactInfo', 'contactHeading']
      .forEach((k) => {
        if (patch[k] && typeof patch[k] === 'object') doc[k] = { ...doc[k].toObject?.() , ...patch[k] };
      });
    ['heroStats', 'navLinks', 'features', 'testimonials', 'collaborators']
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

// Admin: reset landing content to defaults
app.post('/api/content/reset', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    await SiteContent.deleteOne({ key: 'landing' });
    await new SiteContent({ key: 'landing' }).save();
    const doc = await SiteContent.findOne({ key: 'landing' });
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
      { new: true }
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

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Talent Bridge AI API' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});