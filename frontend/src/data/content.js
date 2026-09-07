// Site-wide static data — kept in one place for easy edits

// Icon imports for roles
import { Network, UserSearch, Briefcase } from 'lucide-react';

export const navLinks = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Testimonials', href: '#testimonials' },
  { label: 'Partners', href: '#partners' },
  { label: 'Contact', href: '#contact' },
];

export const heroStats = [
  { value: '50K+', label: 'Talent Matches' },
  { value: '92%', label: 'Placement Success' },
  { value: '1,200+', label: 'Partner Companies' },
];

export const testimonials = [
  {
    quote:
      'Talent Bridge AI cut our hiring time in half. The matches are uncannily accurate — every candidate has been a top performer.',
    name: 'Sarah Chen',
    role: 'Head of People, Nimbus',
    avatar: 'https://ui-avatars.com/api/?name=Sarah+Chen&background=FFD700&color=000&size=128',
  },
  {
    quote:
      'We discovered engineers we never would have found through traditional sourcing. The AI understands culture fit, not just keywords.',
    name: 'Marcus Johnson',
    role: 'CTO, Vertex Labs',
    avatar: 'https://ui-avatars.com/api/?name=Marcus+Johnson&background=000&color=FFD700&size=128',
  },
  {
    quote:
      'Our pipeline went from chaos to clarity. The platform surfaces hidden gems and predicts candidate success with scary accuracy.',
    name: 'Priya Patel',
    role: 'Recruiting Lead, Helix',
    avatar: 'https://ui-avatars.com/api/?name=Priya+Patel&background=FFD700&color=000&size=128',
  },
];

// 6 collaborators — 2 rows x 3 cols
// Logos use the Simple Icons CDN (free, brand-correct SVGs) recolored to brand palette.
export const collaborators = [
  {
    name: 'Google',
    logo: 'https://cdn.simpleicons.org/google/000000',
    // Show logo against gold for a 2-tone look
  },
  {
    name: 'Microsoft',
    logo: 'https://cdn.simpleicons.org/microsoft/000000',
  },
  {
    name: 'Stripe',
    logo: 'https://cdn.simpleicons.org/stripe/635BFF',
  },
  {
    name: 'Shopify',
    logo: 'https://cdn.simpleicons.org/shopify/95BF47',
  },
  {
    name: 'Notion',
    logo: 'https://cdn.simpleicons.org/notion/000000',
  },
  {
    name: 'Figma',
    logo: 'https://cdn.simpleicons.org/figma/F24E1E',
  },
];

export const footerLinks = {
  quick: [
    { label: 'Home',         href: '#home' },
    { label: 'About',        href: '#about' },
    { label: 'Testimonials', href: '#testimonials' },
    { label: 'Contact',      href: '#contact' },
  ],
  resources: [
    { label: 'Documentation', href: '#' },
    { label: 'API Reference', href: '#' },
    { label: 'Pricing',       href: '#' },
    { label: 'Blog',          href: '#' },
  ],
};

export const contactInfo = {
  email: 'hello@talentbridge.ai',
  phone: '+1 (415) 555-0142',
  address: '500 Howard Street, San Francisco, CA',
};

// Outsourced Unsplash imagery
export const images = {
  hero: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=70',
  about: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&auto=format&fit=crop&q=70',
};

// 3 roles users pick after clicking "Get Started"
export const roles = [
  {
    id: 'hub',
    title: 'Talent Hub',
    badge: 'For organizations',
    desc: "I want my talent pool to register through a unique link I can share.",
    Icon: Network,            // imported below
    accent: 'from-primary/30 to-primary/0',
  },
  {
    id: 'seeker',
    title: 'Job Seeker',
    badge: 'Find your next role',
    desc: "I'm looking for opportunities that match my skills and ambitions.",
    Icon: UserSearch,
    accent: 'from-primary/20 to-primary/0',
  },
  {
    id: 'employer',
    title: 'Employer',
    badge: 'Hire top talent',
    desc: 'I want to discover, screen, and hire exceptional people for my team.',
    Icon: Briefcase,
    accent: 'from-primary/40 to-primary/0',
  },
];