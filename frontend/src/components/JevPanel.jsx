import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock } from 'lucide-react';

function CheckRow({ check, index, isVisible }) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.3, duration: 0.3 }}
          className="flex items-start gap-3 py-2"
        >
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: index * 0.3 + 0.15, type: 'spring', stiffness: 300 }}
            className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold
              ${check.passed
                ? 'bg-value/20 text-value'
                : 'bg-risk/20 text-risk'
              }`}
          >
            {check.passed ? '✓' : '✗'}
          </motion.span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-0.5">
              {check.rule?.replace(/_/g, ' ')}
            </div>
            <div className="text-sm text-text/80">{check.detail}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function JevPanel({ jevResult, signal, quantity, onQuantityChange }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const checks = jevResult?.jev_report?.checks || jevResult?.checks || [];
  const approved = jevResult?.jev_report?.approved ?? jevResult?.approved ?? false;

  useEffect(() => {
    setVisibleCount(0);
    if (checks.length === 0) return;
    const timers = checks.map((_, i) =>
      setTimeout(() => setVisibleCount(i + 1), (i + 1) * 300)
    );
    return () => timers.forEach(clearTimeout);
  }, [checks.length, approved]);

  const allRevealed = visibleCount >= checks.length;

  return (
    <div className="p-4 rounded-2xl bg-jev/5 border border-jev/20">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-jev/15 flex items-center justify-center">
          <Lock className="w-4 h-4 text-jev" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-jev">Jev — Compliance Officer</h4>
          <p className="text-[10px] text-muted italic">
            Jev is rule-based code, not an AI. It can't be talked into anything.
          </p>
        </div>
      </div>

      {/* Checks */}
      <div className="space-y-1 mb-3">
        {checks.map((check, i) => (
          <CheckRow key={check.rule || i} check={check} index={i} isVisible={i < visibleCount} />
        ))}
      </div>

      {/* Stamp */}
      {allRevealed && checks.length > 0 && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{
            scale: 1, opacity: 1,
            ...(approved ? {} : { x: [0, -4, 4, -4, 0] })
          }}
          transition={{ duration: 0.4, type: 'spring' }}
          className={`text-center py-2 rounded-xl font-bold text-lg uppercase tracking-widest
            ${approved
              ? 'bg-value/10 text-value border border-value/30'
              : 'bg-risk/10 text-risk border border-risk/30'
            }`}
        >
          {approved ? '✓ APPROVED' : '✗ BLOCKED'}
        </motion.div>
      )}
    </div>
  );
}
