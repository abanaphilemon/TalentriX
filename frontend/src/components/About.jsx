import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Brain, Target, Zap, ShieldCheck } from 'lucide-react';
import { images } from '../data/content.js';

const features = [
  {
    icon: Brain,
    title: 'Smart Matching',
    desc: 'LLM-powered models read résumés, projects, and culture cues to surface the right person.',
  },
  {
    icon: Target,
    title: 'Precision Sourcing',
    desc: 'Reach passive candidates you\'d never find on traditional platforms.',
  },
  {
    icon: Zap,
    title: '10x Faster',
    desc: 'Cut your time-to-hire by 80% with automated screening and ranking.',
  },
  {
    icon: ShieldCheck,
    title: 'Bias Audited',
    desc: 'Every model decision is logged and audited to keep hiring fair and explainable.',
  },
];

// About section — two-column with copy + image in a glass card
export default function About() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.2 });

  return (
    <section id="about" className="section-padding">
      <div className="container-x">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* ───── Text column ───── */}
          <div ref={ref}>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
              className="inline-block text-xs font-bold tracking-widest text-secondary/60 uppercase mb-3"
            >
              About Talent Bridge AI
            </motion.span>

            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-secondary"
            >
              Recruitment,{' '}
              <span className="text-gradient-gold">reimagined</span> by humans
              and machines.
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 text-lg text-secondary/70 leading-relaxed"
            >
              We built Talent Bridge AI because hiring the best people should
              not be a privilege of the biggest companies. Our platform pairs
              advanced language models with human recruiters to bring speed,
              fairness, and clarity to every search.
            </motion.p>

            {/* Feature grid */}
            <div className="mt-10 grid sm:grid-cols-2 gap-4">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                  className="glass rounded-2xl p-5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center mb-3 shadow-lg shadow-primary/30">
                    <f.icon className="w-5 h-5 text-secondary" />
                  </div>
                  <h3 className="font-display font-bold text-secondary text-lg">
                    {f.title}
                  </h3>
                  <p className="text-sm text-secondary/70 mt-1 leading-relaxed">
                    {f.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* ───── Image column ───── */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="relative"
          >
            <div className="glass rounded-3xl overflow-hidden p-3 shadow-2xl">
              <img
                src={images.about}
                alt="AI and technology"
                loading="lazy"
                className="w-full h-[500px] object-cover rounded-2xl"
              />
            </div>

            {/* Decorative gold ring */}
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full border-4 border-primary opacity-70" />
            <div className="absolute -bottom-6 -left-6 w-16 h-16 rounded-full bg-primary shadow-2xl shadow-primary/50" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}