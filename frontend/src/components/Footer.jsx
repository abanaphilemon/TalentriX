import { useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { footerLinks } from '../data/content.js';

// Reusable link column heading
const ColumnTitle = ({ children }) => (
  <h4 className="font-display font-bold text-secondary mb-4">{children}</h4>
);

// Footer — 4 columns: brand, quick links, resources, newsletter + copyright bar
export default function Footer() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  // Subscribe handler — just visual confirmation here
  const onSubscribe = (e) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    setSubscribed(true);
    setEmail('');
    setTimeout(() => setSubscribed(false), 3000);
  };

  return (
    <footer className="relative bg-secondary text-tertiary pt-20 pb-6 mt-10">
      <div className="container-x px-6 md:px-10 lg:px-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* ───── Brand column ───── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                <span className="text-secondary font-display font-bold text-lg leading-none">
                  TB
                </span>
              </div>
              <span className="font-display font-bold text-lg text-tertiary">
                Talent Bridge
              </span>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">
              AI-powered recruitment that connects exceptional people with
              the teams who need them.
            </p>
          </div>

          {/* ───── Quick links ───── */}
          <div>
            <ColumnTitle>Quick Links</ColumnTitle>
            <ul className="space-y-3">
              {footerLinks.quick.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-sm text-white/60 hover:text-primary transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ───── Resources ───── */}
          <div>
            <ColumnTitle>Resources</ColumnTitle>
            <ul className="space-y-3">
              {footerLinks.resources.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-sm text-white/60 hover:text-primary transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ───── Newsletter ───── */}
          <div>
            <ColumnTitle>Newsletter</ColumnTitle>
            <p className="text-sm text-white/60 mb-4">
              Monthly insights on AI, hiring, and the future of work.
            </p>
            <form onSubmit={onSubscribe} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-tertiary placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
              />
              <button
                type="submit"
                aria-label="Subscribe"
                className="w-10 h-10 rounded-lg bg-primary text-secondary flex items-center justify-center hover:scale-110 hover:shadow-lg hover:shadow-primary/40 transition-all shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            {subscribed && (
              <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                <Sparkles className="w-3 h-3" />
                <span>Thanks — you&apos;re subscribed.</span>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} Talent Bridge AI. All rights reserved.
          </p>
          <div className="flex gap-6 text-xs text-white/50">
            <a href="#" className="hover:text-primary transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Terms of Service
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Cookies
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}