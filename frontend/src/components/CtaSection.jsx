import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { ArrowRight } from 'lucide-react';
import { useContent } from '../context/ContentContext.jsx';

// Reusable fade-in wrapper — drives scroll-triggered reveals
export function FadeIn({ children, delay = 0, className = '' }) {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.15,
  });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Bold mid-page call-to-action banner
export default function CtaSection() {
  const { content } = useContent();
  const cta = content.cta || {};

  return (
    <section className="relative px-6 md:px-10 lg:px-16 py-16">
      <div className="container-x">
        <FadeIn>
          <div className="relative overflow-hidden rounded-3xl bg-secondary text-tertiary p-6 sm:p-10 md:p-16 shadow-2xl">
            {/* Decorative gold glow */}
            <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />

            <div className="relative grid md:grid-cols-[1fr_auto] gap-8 items-center">
              <div>
                <h2 className="font-display text-3xl md:text-5xl font-bold leading-tight">
                  {cta.title || 'The future of hiring is '}
                  <span className="text-primary">{cta.titleHighlight || 'already here.'}</span>
                </h2>
                <p className="mt-4 text-white/70 max-w-2xl text-lg">
                  {cta.body || ''}
                </p>
              </div>

              <a
                href="#contact"
                className="btn-on-dark text-base px-8 py-4 self-start md:self-center w-full sm:w-auto justify-center"
              >
                {cta.buttonText || 'Book a Demo'}
                <ArrowRight className="w-5 h-5 shrink-0" />
              </a>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}