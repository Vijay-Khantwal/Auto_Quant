import React, { useState, useMemo } from 'react';
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

export default function SignalFeed({
  signals = [],
  loading,
  selectedSignal,
  onSelectSignal,
  onAddCustomStock,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Filter local signals as user types
  const filteredSignals = useMemo(() => {
    if (!searchQuery.trim()) return signals;
    const q = searchQuery.toLowerCase().trim();
    return signals.filter(
      s =>
        s.symbol.toLowerCase().includes(q) ||
        s.company_name.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q)
    );
  }, [signals, searchQuery]);

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q || !onAddCustomStock) return;

    setIsAnalyzing(true);
    try {
      await onAddCustomStock(q);
      setSearchQuery('');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="p-4 flex flex-col h-full">
      {/* Header & Title */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Institutional Signals
        </h3>
        <span className="text-[11px] font-mono text-gold px-2 py-0.5 rounded-full bg-gold/10 border border-gold/20">
          {signals.length} stocks
        </span>
      </div>

      {/* On-the-Fly Search & Add Any Stock Bar */}
      <form onSubmit={handleSearchSubmit} className="mb-4">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search or add any stock (e.g. ITC, PAYTM)..."
            disabled={isAnalyzing}
            className="w-full pl-8 pr-16 py-2 text-xs rounded-xl bg-white/[0.04] border border-border
              text-text placeholder:text-muted/60 focus:outline-none focus:border-gold/50
              disabled:opacity-50 transition"
          />
          <span className="absolute left-2.5 top-2.5 text-xs text-muted">
            🔍
          </span>
          {searchQuery.trim() && (
            <button
              type="submit"
              disabled={isAnalyzing}
              className="absolute right-1.5 top-1 px-2.5 py-1 text-[10px] font-semibold rounded-lg
                bg-gold text-bg hover:bg-gold/90 transition shadow-sm disabled:opacity-50"
            >
              {isAnalyzing ? '...' : '+ Add'}
            </button>
          )}
        </div>
      </form>

      {/* Analyzing Banner */}
      {isAnalyzing && (
        <div className="p-2.5 mb-3 rounded-xl bg-gold/10 border border-gold/30 text-gold text-xs flex items-center gap-2 animate-pulse">
          <span>⚡</span>
          <span>Fetching live market quote & profile...</span>
        </div>
      )}

      {/* Stock Cards List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="text-center py-8 px-2">
            <p className="text-muted text-xs mb-3">
              No stock matches "{searchQuery}".
            </p>
            <button
              onClick={handleSearchSubmit}
              disabled={isAnalyzing}
              className="px-3 py-1.5 rounded-lg bg-gold/20 text-gold border border-gold/30 text-xs font-semibold hover:bg-gold/30 transition"
            >
              Add "{searchQuery}" to Boardroom →
            </button>
          </div>
        ) : (
          filteredSignals.map((signal, i) => (
            <motion.div
              key={signal.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.2 }}
            >
              <SignalCard
                signal={signal}
                isSelected={selectedSignal?.id === signal.id}
                onClick={() => onSelectSignal(signal)}
              />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
