import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Smartphone, Share, X, Check } from 'lucide-react';
import { isStandalone, isIos } from '../lib/push.js';

// "Get the app" button shown on the landing page. On Android/Chrome/desktop it
// uses the browser's native install prompt; on iOS it shows step-by-step
// "Add to Home Screen" instructions (there is no beforeinstallprompt there).
export default function PwaInstall({ compact = false }) {
  const [prompt, setPrompt] = useState(null); // captured beforeinstallprompt
  const [showHelp, setShowHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return undefined;
    }
    const onBeforeInstall = (e) => {
      e.preventDefault(); // keep the prompt until the user asks for it
      setPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const canPrompt = !!prompt;

  const installNow = async () => {
    if (!prompt) return;
    prompt.prompt();
    try {
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') setInstalled(true);
    } catch {
      /* dismissed */
    }
    setPrompt(null);
  };

  if (installed) return null;

  return (
    <>
      {canPrompt ? (
        <button
          type="button"
          onClick={installNow}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-secondary bg-primary/90 hover:bg-primary transition-colors shadow-lg shadow-primary/25"
        >
          <Download className="w-4 h-4" />
          {compact ? 'Install' : 'Install the app'}
        </button>
      ) : isIos() ? (
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-secondary bg-primary/90 hover:bg-primary transition-colors shadow-lg shadow-primary/25"
        >
          <Smartphone className="w-4 h-4" />
          {compact ? 'Download' : 'Download the app'}
        </button>
      ) : null}

      {/* iOS "Add to Home Screen" instructions */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowHelp(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="glass rounded-3xl shadow-2xl w-full max-w-sm p-7 text-left"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-primary" />
                  <h3 className="font-display font-bold text-secondary text-lg">Get the TalentriX app</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHelp(false)}
                  className="p-1.5 rounded-lg text-secondary/60 hover:bg-secondary/10 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-secondary/70 leading-relaxed mb-5">
                Install TalentriX on your iPhone or iPad for one-tap access,
                popup notifications and offline support.
              </p>

              <ol className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-primary/30 text-secondary font-bold text-xs flex items-center justify-center mt-0.5">1</span>
                  <p className="text-sm text-secondary/80">
                    Tap the <span className="inline-flex items-center gap-1 font-semibold text-secondary"><Share className="w-3.5 h-3.5" /> Share</span> button in Safari&apos;s toolbar.
                  </p>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-primary/30 text-secondary font-bold text-xs flex items-center justify-center mt-0.5">2</span>
                  <p className="text-sm text-secondary/80">
                    Scroll and tap <span className="font-semibold text-secondary">Add to Home Screen</span>.
                  </p>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-primary/30 text-secondary font-bold text-xs flex items-center justify-center mt-0.5">3</span>
                  <div className="text-sm text-secondary/80">
                    Tap <span className="font-semibold text-secondary">Add</span>, then open TalentriX from your home screen.
                    <span className="mt-1 flex items-center gap-1 text-primary font-semibold"><Check className="w-3.5 h-3.5" /> Allow notifications</span> when asked.
                  </div>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="btn-primary w-full mt-6 justify-center"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}