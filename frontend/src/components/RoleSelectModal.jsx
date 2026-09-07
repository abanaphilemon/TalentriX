import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { roles } from '../data/content.js';

// First step of the Get Started flow — pick one of 3 roles
export default function RoleSelectModal() {
  const { mode, closeAuth, selectRole, role } = useAuth();
  const open = mode === 'role';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeAuth}
            className="fixed inset-0 z-[60] bg-secondary/60 backdrop-blur-sm"
          />

          {/* Dialog */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-title"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="glass rounded-3xl p-8 md:p-10 shadow-2xl w-full max-w-3xl pointer-events-auto relative">
              {/* Close */}
              <button
                onClick={closeAuth}
                aria-label="Close"
                className="absolute top-4 right-4 p-2 rounded-lg text-secondary/70 hover:bg-secondary/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Heading */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                  <Sparkles className="w-5 h-5 text-secondary" />
                </div>
                <h2
                  id="role-title"
                  className="font-display text-2xl md:text-3xl font-bold text-secondary"
                >
                  Welcome to Talent Bridge AI
                </h2>
              </div>
              <p className="text-secondary/70 text-sm md:text-base mb-8">
                Tell us who you are so we can personalize your experience.
              </p>

              {/* 3 role cards */}
              <div className="grid sm:grid-cols-3 gap-4">
                {roles.map((r, i) => {
                  const active = role === r.id;
                  return (
                    <motion.button
                      key={r.id}
                      type="button"
                      onClick={() => selectRole(r.id)}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: i * 0.08 }}
                      whileHover={{ y: -4 }}
                      className={`group relative text-left rounded-2xl border-2 p-5 transition-all duration-200 overflow-hidden ${
                        active
                          ? 'border-primary shadow-lg shadow-primary/30'
                          : 'border-secondary/10 bg-white/60 hover:border-secondary/30'
                      }`}
                    >
                      {/* Subtle gradient overlay */}
                      <div
                        className={`absolute inset-0 bg-gradient-to-br ${r.accent} opacity-60 pointer-events-none`}
                      />

                      <div className="relative">
                        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-4 shadow-md shadow-primary/30 group-hover:scale-110 transition-transform">
                          <r.Icon className="w-6 h-6 text-secondary" />
                        </div>

                        <div className="text-[10px] font-bold tracking-widest uppercase text-secondary/60">
                          {r.badge}
                        </div>
                        <div className="font-display font-bold text-secondary text-lg mt-1">
                          {r.title}
                        </div>
                        <p className="text-xs text-secondary/70 mt-2 leading-relaxed">
                          {r.desc}
                        </p>

                        <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-secondary group-hover:gap-2 transition-all">
                          Continue
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              <p className="mt-6 text-xs text-secondary/50 text-center">
                You can change this later in Settings.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}