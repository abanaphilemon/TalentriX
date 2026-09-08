import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { useContent } from '../context/ContentContext.jsx';

// One partner card — brand logo + name in a glass tile
const PartnerTile = ({ partner, index, inView }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.85 }}
    animate={inView ? { opacity: 1, scale: 1 } : {}}
    transition={{ duration: 0.5, delay: index * 0.08 }}
    whileHover={{ y: -6, scale: 1.03 }}
    className="glass rounded-2xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:shadow-2xl transition-shadow duration-300 aspect-square"
  >
    {/* Logo — white circle so any brand color reads correctly */}
    <div className="w-20 h-20 rounded-full bg-white shadow-lg shadow-secondary/10 ring-1 ring-secondary/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
      <img
        src={partner.logo}
        alt={`${partner.name} logo`}
        loading="lazy"
        // Brand-correct SVGs — fall back to initials if the CDN is blocked
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          e.currentTarget.parentElement.dataset.fallback = 'true';
        }}
        className="w-10 h-10 object-contain"
      />
    </div>

    {/* Partner name */}
    <div className="text-sm font-semibold text-secondary/80 text-center">
      {partner.name}
    </div>
  </motion.div>
);

export default function Collaborators() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.15 });
  const { content } = useContent();
  const heading = content.partnersHeading || {};
  const collaborators = content.collaborators || [];

  return (
    <section id="partners" className="section-padding">
      <div className="container-x">
        {/* Heading */}
        <div ref={ref} className="max-w-3xl mx-auto text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="inline-block text-xs font-bold tracking-widest text-secondary/60 uppercase mb-3"
          >
            {heading.eyebrow || 'Trusted By Industry Leaders'}
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-secondary"
          >
            {heading.title || 'Powering hiring at '}
            <span className="text-gradient-gold">{heading.titleHighlight || 'amazing companies.'}</span>
          </motion.h2>
        </div>

        {/* 2x3 grid on md+, 2 cols on sm, 1 col on mobile */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto">
          {collaborators.map((c, i) => (
            <PartnerTile key={c.name} partner={c} index={i} inView={inView} />
          ))}
        </div>
      </div>
    </section>
  );
}