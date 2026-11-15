import React from 'react';
import { motion } from 'framer-motion';

export default function ConvictionBar({ value = 0 }) {
  // value ranges from about -50 to +50
  // Normalize to percentage: 0 = center, -100 = full left (risk), +100 = full right (value)
  const pct = Math.max(-100, Math.min(100, value * 2));
  const markerPct = 50 + pct / 2;

  return (
    <div className="py-3">
      <div className="flex justify-between items-center mb-1.5 px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-value">Bullish</span>
        <span className="text-xs text-muted font-mono">Conviction</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-risk">Cautious</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-white/5 border border-white/10">
        {/* Value side gradient */}
        <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-value/20 to-transparent" />
        {/* Risk side gradient */}
        <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-risk/20 to-transparent" />

        {/* Marker */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gold shadow-[0_0_10px_rgba(245,196,81,0.5)]"
          animate={{ left: `${markerPct}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          style={{ marginLeft: '-8px' }}
        />

        {/* Center line */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
      </div>
    </div>
  );
}
