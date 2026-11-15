import React from 'react';
import { motion } from 'framer-motion';
import SignalCard from './SignalCard';

function SkeletonCard() {
  return (
    <div className="p-4 border border-border rounded-2xl bg-panel animate-pulse">
      <div className="h-4 bg-white/5 rounded w-2/3 mb-2" />
      <div className="h-3 bg-white/5 rounded w-1/2 mb-3" />
      <div className="h-8 bg-white/5 rounded w-1/3" />
    </div>
  );
}

export default function SignalFeed({ signals = [], loading, selectedSignal, onSelectSignal }) {
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">
        ML Signal Feed
      </h3>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : signals.length === 0 ? (
        <p className="text-muted text-sm">No signals available.</p>
      ) : (
        <div className="space-y-3">
          {signals.map((signal, i) => (
            <motion.div
              key={signal.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
            >
              <SignalCard
                signal={signal}
                isSelected={selectedSignal?.id === signal.id}
                onClick={() => onSelectSignal(signal)}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
