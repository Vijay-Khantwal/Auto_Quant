import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const steps = [
  {
    title: 'Meet Your Analysts',
    description: 'Two AI agents debate every stock — one argues for buying, the other highlights risks.',
    emoji: '🤖',
  },
  {
    title: 'Jev Guards Your Limits',
    description: 'A deterministic compliance officer checks every trade against your risk rules. No AI — pure code.',
    emoji: '🔒',
  },
  {
    title: 'You Make the Final Call',
    description: 'Listen to the debate, review the compliance check, then Execute or Pass. It\'s your money (paper!).',
    emoji: '⚡',
  },
];

export default function Onboarding({ onDismiss }) {
  const [step, setStep] = useState(0);
  const current = steps[step];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md p-8 rounded-3xl bg-bg border border-border shadow-2xl text-center"
      >
        <div className="text-5xl mb-4">{current.emoji}</div>
        <h3 className="text-xl font-bold mb-2">{current.title}</h3>
        <p className="text-muted text-sm mb-6 leading-relaxed">{current.description}</p>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-200
                ${i === step ? 'bg-gold w-6' : 'bg-white/10'}`}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-sm rounded-xl border border-border text-muted hover:text-text transition"
          >
            Skip
          </button>
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="px-6 py-2 text-sm rounded-xl bg-gold text-bg font-semibold hover:bg-gold/90 transition"
            >
              Next
            </button>
          ) : (
            <button
              onClick={onDismiss}
              className="px-6 py-2 text-sm rounded-xl bg-gold text-bg font-semibold hover:bg-gold/90 transition"
            >
              Let's Go
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
