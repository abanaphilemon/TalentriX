import { motion } from 'framer-motion';
import { Suspense, lazy } from 'react';
import { ArrowRight, Play, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useContent } from '../context/ContentContext.jsx';

// Lazy-load the 3D scene so the page becomes interactive before WebGL boots
const HeroScene = lazy(() => import('./HeroScene.jsx'));

// Reveal animation variants — staggered fade + slide
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

export default function Hero() {
  const { openAuth } = useAuth();
  const { content } = useContent();
  const hero = content.hero || {};
  const heroStats = content.heroStats || [];

  return (
    <section
      id="home"
      className="relative min-h-screen pt-32 pb-20 overflow-hidden"
    >
      {/* Soft accent glow behind content */}
      <div className="pointer-events-none absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-primary/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full bg-primary/20 blur-3xl" />

      <div className="container-x px-6 md:px-10 lg:px-16 relative">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* ───── Left column — copy ───── */}
          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full mb-6"
            >
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold tracking-wide text-secondary">
                {hero.badge || 'AI-POWERED RECRUITMENT'}
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={1}
              className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] text-secondary"
            >
              {hero.titlePrefix || 'Hire '}
              <span className="text-gradient-gold">{hero.titleHighlight || 'extraordinary'}</span>
              <br />
              {hero.titleSuffix || 'talent, faster.'}
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={2}
              className="mt-6 text-lg text-secondary/70 max-w-xl leading-relaxed"
            >
              {hero.subtitle || ''}
            </motion.p>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={3}
              className="mt-8 flex flex-wrap gap-4"
            >
              <button type="button" onClick={openAuth} className="btn-primary">
                {hero.ctaPrimary || 'Get Started'}
                <ArrowRight className="w-4 h-4" />
              </button>
              <a href="#about" className="btn-secondary">
                <Play className="w-4 h-4" />
                {hero.ctaSecondary || 'See How It Works'}
              </a>
            </motion.div>

            {/* Stat strip */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={4}
              className="mt-12 grid grid-cols-3 gap-4 max-w-lg"
            >
              {heroStats.map((stat, i) => (
                <div
                  key={stat.label}
                  className="glass rounded-2xl p-4 text-center"
                >
                  <div className="text-2xl md:text-3xl font-display font-bold text-gradient-gold">
                    {stat.value}
                  </div>
                  <div className="text-xs text-secondary/60 mt-1 font-medium">
                    {stat.label}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* ───── Right column — image + 3D ───── */}
          <div className="relative h-[420px] sm:h-[520px] lg:h-[600px]">
            {/* Hero photo in a glass card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="absolute inset-0 glass rounded-3xl overflow-hidden"
            >
              <img
                src={hero.image}
                alt="Team collaborating"
                loading="lazy"
                className="w-full h-full object-cover"
              />
              {/* Subtle yellow tint over photo */}
              <div className="absolute inset-0 bg-gradient-to-t from-primary/30 via-transparent to-transparent" />
            </motion.div>

            {/* 3D canvas floating over the photo */}
            <div className="absolute inset-0 pointer-events-none">
              <Suspense fallback={null}>
                <HeroScene />
              </Suspense>
            </div>

            {/* Floating "AI Match" badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="absolute -bottom-6 -left-6 glass rounded-2xl p-4 shadow-xl hidden sm:flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <div className="text-sm font-bold text-secondary">AI Match</div>
                <div className="text-xs text-secondary/60">Live now</div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}