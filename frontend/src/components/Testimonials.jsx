import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Star, Quote } from 'lucide-react';
import { useContent } from '../context/ContentContext.jsx';

// Single testimonial glass card
const TestimonialCard = ({ t, index, inView }) => (
  <motion.figure
    initial={{ opacity: 0, y: 30 }}
    animate={inView ? { opacity: 1, y: 0 } : {}}
    transition={{ duration: 0.5, delay: index * 0.15 }}
    className="glass rounded-3xl p-8 flex flex-col gap-6 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
  >
    <Quote className="w-8 h-8 text-primary" />

    {/* 5 stars */}
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className="w-4 h-4 fill-primary text-primary"
          aria-hidden
        />
      ))}
    </div>

    <blockquote className="text-secondary/85 leading-relaxed flex-1">
      &ldquo;{t.quote}&rdquo;
    </blockquote>

    <figcaption className="flex items-center gap-4 pt-4 border-t border-secondary/10">
      <img
        src={t.avatar}
        alt={`${t.name} avatar`}
        loading="lazy"
        className="w-12 h-12 rounded-full ring-2 ring-primary/60"
      />
      <div>
        <div className="font-display font-bold text-secondary">{t.name}</div>
        <div className="text-sm text-secondary/60">{t.role}</div>
      </div>
    </figcaption>
  </motion.figure>
);

export default function Testimonials() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.15 });
  const { content } = useContent();
  const heading = content.testimonialsHeading || {};
  const testimonials = content.testimonials || [];

  return (
    <section id="testimonials" className="section-padding">
      <div className="container-x">
        {/* Heading */}
        <div ref={ref} className="max-w-3xl mx-auto text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="inline-block text-xs font-bold tracking-widest text-secondary/60 uppercase mb-3"
          >
            {heading.eyebrow || 'What Our Customers Say'}
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-secondary"
          >
            {heading.title || 'Loved by '}
            <span className="text-gradient-gold">{heading.titleHighlight || 'hiring teams'}</span>{' '}
            {heading.titleSuffix || 'worldwide.'}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-4 text-lg text-secondary/70"
          >
            {heading.body || ''}
          </motion.p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {testimonials.map((t, i) => (
            <TestimonialCard key={t.name} t={t} index={i} inView={inView} />
          ))}
        </div>
      </div>
    </section>
  );
}