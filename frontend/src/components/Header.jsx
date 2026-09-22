import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Sparkles, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useContent } from '../context/ContentContext.jsx';
import PwaInstall from './PwaInstall.jsx';

// Logo mark — brand logo (or "TB" fallback) with gold accent
const LogoMark = ({ branding }) => {
  const name = branding?.name || 'TalentriX';
  const tagline = branding?.tagline || 'A · I';
  const logo = branding?.logo;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="relative w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shadow-lg shadow-secondary/30 overflow-hidden shrink-0">
        {logo ? (
          <img src={logo} alt={`${name} logo`} className="w-full h-full object-contain p-1" />
        ) : (
          <span className="text-primary font-display font-bold text-lg leading-none">
            TB
          </span>
        )}
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full ring-2 ring-white" />
      </div>
      <div className="flex flex-col leading-tight min-w-0">
        <span className="font-display font-bold text-secondary text-lg truncate">
          {name}
        </span>
        <span className="text-[10px] font-semibold tracking-widest text-secondary/60 -mt-1">
          {tagline}
        </span>
      </div>
    </div>
  );
};

// User pill — replaces the "Get Started" button when signed in
const UserPill = ({ user, roleLabel, onSignOut }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  // Choose avatar source: Google photo OR initials fallback
  const avatar = user.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.email)}&background=FFD700&color=000&size=128`;

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full glass hover:shadow-lg transition-shadow"
      >
        <img
          src={avatar}
          alt={user.name}
          className="w-7 h-7 rounded-full ring-2 ring-primary"
        />
        <span className="text-sm font-semibold text-secondary hidden sm:inline max-w-[120px] truncate">
          {user.name?.split(' ')[0]}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-secondary/60" />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-60 glass rounded-2xl p-2 shadow-xl z-50"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <div className="px-3 py-2 border-b border-secondary/10">
              <p className="text-sm font-bold text-secondary truncate">
                {user.name}
              </p>
              <p className="text-xs text-secondary/60 truncate">{user.email}</p>
              {roleLabel && (
                <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-primary/30 text-secondary">
                  {roleLabel}
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-secondary hover:bg-primary/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Header — sticky, glassy, with mobile hamburger drawer
export default function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, role, openAuth, signOut } = useAuth();
  const { content } = useContent();
  const navLinks = content.navLinks || [];

  // Add a shadow once the user scrolls away from the top
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Map role id → display label for the user pill
  const roleLabel =
    role === 'hub'
      ? 'Talent Hub'
      : role === 'seeker'
      ? 'Job Seeker'
      : role === 'employer'
      ? 'Employer'
      : null;

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'py-3' : 'py-5'
      }`}
    >
      <div className="container-x px-4 md:px-8">
        <div
          className={`flex items-center justify-between rounded-2xl px-4 md:px-6 py-3 transition-all duration-300 ${
            scrolled
              ? 'glass shadow-lg'
              : 'bg-white/30 backdrop-blur-md border border-white/30'
          }`}
        >
          {/* Logo */}
          <a href="#home" className="shrink-0">
            <LogoMark branding={content.branding} />
          </a>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="relative px-4 py-2 text-sm font-medium text-secondary/80 hover:text-secondary transition-colors group"
              >
                {link.label}
                <span className="absolute left-4 right-4 -bottom-0.5 h-0.5 bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left rounded-full" />
              </a>
            ))}
          </nav>

          {/* Desktop CTA — user pill when signed in, "Get Started" when not */}
          <div className="hidden lg:flex items-center gap-3">
            <PwaInstall compact />
            {user ? (
              <UserPill
                user={user}
                roleLabel={roleLabel}
                onSignOut={signOut}
              />
            ) : (
              <button
                type="button"
                onClick={openAuth}
                className="btn-primary text-sm py-2 px-5"
              >
                <Sparkles className="w-4 h-4" />
                Get Started
              </button>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen((o) => !o)}
            className="lg:hidden p-2 rounded-lg text-secondary hover:bg-secondary/5 transition-colors"
            aria-label="Toggle menu"
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile drawer */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden mt-2 glass rounded-2xl p-4 shadow-xl"
            >
              <div className="flex flex-col gap-1">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="px-4 py-3 rounded-lg text-secondary font-medium hover:bg-primary/20 transition-colors"
                  >
                    {link.label}
                  </a>
                ))}

                {user ? (
                  <>
                    <div className="mt-2 flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/10">
                      <img
                        src={user.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.email)}&background=FFD700&color=000&size=128`}
                        alt={user.name}
                        className="w-9 h-9 rounded-full ring-2 ring-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-secondary truncate">
                          {user.name}
                        </p>
                        <p className="text-xs text-secondary/60 truncate">
                          {user.email}
                        </p>
                        {roleLabel && (
                          <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-primary/30 text-secondary">
                            {roleLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        signOut();
                        setOpen(false);
                      }}
                      className="px-4 py-3 rounded-lg text-secondary font-medium hover:bg-primary/20 transition-colors flex items-center gap-2 justify-center"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      openAuth();
                      setOpen(false);
                    }}
                    className="btn-primary mt-2 justify-center"
                  >
                    <Sparkles className="w-4 h-4" />
                    Get Started
                  </button>
                )}

                <div className="mt-3 flex justify-center">
                  <PwaInstall />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}