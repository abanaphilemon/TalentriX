import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import {
  Mail,
  Phone,
  MapPin,
  Send,
  Linkedin,
  Twitter,
  Github,
  CheckCircle2,
} from 'lucide-react';
import { contactInfo } from '../data/content.js';

// Social icon helper
const SocialBtn = ({ Icon, href, label }) => (
  <a
    href={href}
    aria-label={label}
    className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-secondary hover:scale-110 hover:shadow-lg hover:shadow-primary/40 transition-all duration-300"
  >
    <Icon className="w-5 h-5" />
  </a>
);

// Contact section — two-column: form (left) + info (right)
export default function Contact() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.15 });
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm();

  // On successful submit — show toast, reset form
  const onSubmit = async () => {
    // In production, replace with a real API call
    await new Promise((r) => setTimeout(r, 800));
    setSubmitted(true);
    reset();
    setTimeout(() => setSubmitted(false), 4000);
  };

  return (
    <section id="contact" className="section-padding">
      <div className="container-x">
        {/* Heading */}
        <div ref={ref} className="max-w-3xl mx-auto text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="inline-block text-xs font-bold tracking-widest text-secondary/60 uppercase mb-3"
          >
            Get In Touch
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-secondary"
          >
            Let&apos;s build your{' '}
            <span className="text-gradient-gold">dream team.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-4 text-lg text-secondary/70"
          >
            Tell us what you&apos;re building — we&apos;ll be in touch within
            one business day.
          </motion.p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* ───── Form ───── */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="glass rounded-3xl p-8 md:p-10 shadow-xl"
          >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-secondary mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="Jane Doe"
                    {...register('name', { required: 'Name is required' })}
                    className="w-full px-4 py-3 rounded-xl bg-white/80 border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-secondary mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="jane@company.com"
                    {...register('email', {
                      required: 'Email is required',
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: 'Invalid email',
                      },
                    })}
                    className="w-full px-4 py-3 rounded-xl bg-white/80 border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-secondary mb-2">
                  Company
                </label>
                <input
                  type="text"
                  placeholder="Acme Inc."
                  {...register('company')}
                  className="w-full px-4 py-3 rounded-xl bg-white/80 border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-secondary mb-2">
                  Message
                </label>
                <textarea
                  rows={5}
                  placeholder="Tell us about your hiring goals…"
                  {...register('message', { required: 'Message is required' })}
                  className="w-full px-4 py-3 rounded-xl bg-white/80 border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all resize-none"
                />
                {errors.message && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.message.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full justify-center disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Sending…' : 'Send Message'}
                <Send className="w-4 h-4" />
              </button>

              {/* Success toast */}
              {submitted && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-primary/20 text-secondary"
                >
                  <CheckCircle2 className="w-5 h-5 text-secondary" />
                  <span className="text-sm font-medium">
                    Thanks — we&apos;ll be in touch shortly.
                  </span>
                </motion.div>
              )}
            </form>
          </motion.div>

          {/* ───── Contact info ───── */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="space-y-6"
          >
            {/* Info card */}
            <div className="glass-dark rounded-3xl p-8 md:p-10 text-tertiary shadow-xl">
              <h3 className="font-display text-2xl font-bold mb-6">
                Reach us directly
              </h3>

              <div className="space-y-5">
                <a
                  href={`mailto:${contactInfo.email}`}
                  className="flex items-center gap-4 group"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Mail className="w-5 h-5 text-secondary" />
                  </div>
                  <div>
                    <div className="text-xs text-white/60 font-medium">Email</div>
                    <div className="font-semibold">{contactInfo.email}</div>
                  </div>
                </a>

                <a
                  href={`tel:${contactInfo.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-4 group"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Phone className="w-5 h-5 text-secondary" />
                  </div>
                  <div>
                    <div className="text-xs text-white/60 font-medium">Phone</div>
                    <div className="font-semibold">{contactInfo.phone}</div>
                  </div>
                </a>

                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-secondary" />
                  </div>
                  <div>
                    <div className="text-xs text-white/60 font-medium">Office</div>
                    <div className="font-semibold">{contactInfo.address}</div>
                  </div>
                </div>
              </div>

              {/* Socials */}
              <div className="mt-8 pt-8 border-t border-white/10">
                <div className="text-xs text-white/60 font-medium mb-4">
                  Follow us
                </div>
                <div className="flex gap-3">
                  <SocialBtn Icon={Linkedin} href="#" label="LinkedIn" />
                  <SocialBtn Icon={Twitter}  href="#" label="Twitter"  />
                  <SocialBtn Icon={Github}   href="#" label="GitHub"   />
                </div>
              </div>
            </div>

            {/* Office-hours card */}
            <div className="glass rounded-3xl p-6 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <span className="text-secondary font-bold">↗</span>
                </div>
                <div>
                  <h4 className="font-display font-bold text-secondary">
                    Office hours
                  </h4>
                  <p className="text-sm text-secondary/70 mt-1">
                    Mon&Fri, 9am&6pm PST. We respond to every message within
                    one business day.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}