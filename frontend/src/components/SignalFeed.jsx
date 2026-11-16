import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SignalCard from './SignalCard';
import { searchStockRecommendations } from '../api';

function SkeletonCard() {
  return (
    <div className="p-3 border border-white/[0.06] rounded-xl bg-white/[0.02] animate-pulse">
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
  onCollapse,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Close recommendations dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter already-added signals as user types
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

  // Debounced search recommendations lookup
  useEffect(() => {
    const q = searchQuery.trim();
    if (searchError) setSearchError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!q) {
      setRecommendations([]);
      setShowDropdown(false);
      setLoadingRecs(false);
      return;
    }

    setLoadingRecs(true);
    setShowDropdown(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchStockRecommendations(q);
        setRecommendations(res.results || []);
      } catch (err) {
        console.warn('Failed to fetch recommendations:', err);
        setRecommendations([]);
      } finally {
        setLoadingRecs(false);
      }
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Execute addition of custom ticker
  const handleAddStock = async (tickerOrQuery) => {
    const q = (tickerOrQuery || searchQuery).trim();
    if (!q || !onAddCustomStock) return;

    setIsAnalyzing(true);
    setSearchError(null);
    setShowDropdown(false);

    try {
      await onAddCustomStock(q);
      setSearchQuery('');
    } catch (err) {
      const cleanMsg = err.message || `Stock '${q}' not found.`;
      setSearchError(cleanMsg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    handleAddStock(searchQuery);
  };

  const handleSelectFromRecommendation = (item) => {
    setShowDropdown(false);
    if (item.already_added && item.signal_id) {
      const match = signals.find(s => s.id === item.signal_id);
      if (match) {
        onSelectSignal(match);
        setSearchQuery('');
        return;
      }
    }
    handleAddStock(item.symbol || item.name);
  };

  return (
    <div className="p-3 flex flex-col h-full bg-[#0D1225]/80" ref={containerRef}>
      {/* Header with golden accent */}
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-gold/[0.1]">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-gold/60" />
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-gold/90">
            ML Signal Feed
          </h3>
          <span className="text-[10px] font-mono text-gold px-1.5 py-0.5 rounded-full bg-gold/[0.08] border border-gold/[0.15]">
            {signals.length}
          </span>
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1.5 rounded-lg text-muted hover:text-gold hover:bg-white/10 transition text-xs cursor-pointer"
            title="Collapse Signals Feed ([)"
          >
            ◀
          </button>
        )}
      </div>

      {/* Search & Add Stock Form with Recommendations Dropdown */}
      <div className="relative mb-3">
        <form onSubmit={handleSearchSubmit}>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onFocus={() => {
                if (searchQuery.trim().length > 0) setShowDropdown(true);
              }}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search or add any stock (e.g. INFY, Adani, ITC)"
              disabled={isAnalyzing}
              className="w-full pl-7 pr-14 py-2 text-xs rounded-lg bg-white/[0.03] border border-white/[0.08]
                text-text placeholder:text-muted/50 focus:outline-none focus:border-gold/40
                disabled:opacity-50 transition"
            />
            <span className="absolute left-2.5 top-2.5 text-[11px] text-muted/60">
              🔍
            </span>
            {searchQuery.trim() && (
              <button
                type="submit"
                disabled={isAnalyzing}
                className="absolute right-1.5 top-1 px-2 py-1 text-[10px] font-semibold rounded-md
                  bg-gold text-bg hover:bg-gold/90 transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isAnalyzing ? '...' : '+ Add'}
              </button>
            )}
          </div>
        </form>

        {/* Floating Autocomplete & Market Recommendations Dropdown */}
        <AnimatePresence>
          {showDropdown && searchQuery.trim().length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#0e1424] border border-gold/30 rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl max-h-80 overflow-y-auto divide-y divide-white/5"
            >
              {loadingRecs ? (
                <div className="p-3 text-center text-xs text-gold flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gold animate-ping" />
                  <span>Searching NSE/BSE & market registry...</span>
                </div>
              ) : recommendations.length === 0 ? (
                <div className="p-3.5 text-center">
                  <p className="text-xs text-rose-400 font-medium mb-1">
                    No market stocks found matching "{searchQuery}"
                  </p>
                  <p className="text-[11px] text-muted/70 leading-relaxed">
                    Check spelling or search company names like Reliance, Adani, TCS, Infosys, ITC.
                  </p>
                </div>
              ) : (
                <>
                  <div className="px-3 py-1.5 bg-white/[0.02] text-[10px] font-mono text-muted/80 uppercase tracking-wider flex items-center justify-between">
                    <span>Market Recommendations</span>
                    <span className="text-[9px] text-gold/70">Click to Select or Add</span>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {recommendations.map((item, idx) => (
                      <div
                        key={item.symbol + idx}
                        onClick={() => handleSelectFromRecommendation(item)}
                        className="p-2.5 hover:bg-white/[0.06] transition cursor-pointer flex items-center justify-between gap-2 group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-mono text-xs font-bold text-gold group-hover:text-gold/90">
                              {item.symbol}
                            </span>
                            <span className="text-[10px] text-muted/70 truncate">
                              {item.sector}
                            </span>
                          </div>
                          <p className="text-[11px] text-text/80 truncate font-normal">
                            {item.name}
                          </p>
                        </div>

                        <div className="shrink-0 flex items-center">
                          {item.already_added ? (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-medium">
                              In Boardroom ✓
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectFromRecommendation(item);
                              }}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gold/15 border border-gold/30 text-gold hover:bg-gold/25 transition"
                            >
                              + Add
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Analyzing Banner */}
      {isAnalyzing && (
        <div className="p-2 mb-2.5 rounded-lg bg-gold/[0.08] border border-gold/20 text-gold text-[11px] flex items-center gap-2 animate-pulse">
          <span>⚡</span>
          <span>Fetching live market quote & institutional setup...</span>
        </div>
      )}

      {/* Inline Search Validation Error Banner */}
      {searchError && (
        <div className="p-2.5 mb-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">⚠️</span>
            <span className="leading-tight">{searchError}</span>
          </div>
          <button
            onClick={() => setSearchError(null)}
            className="text-rose-400 hover:text-white p-0.5 transition cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Stock Cards List */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : filteredSignals.length === 0 && !searchError ? (
          <div className="text-center py-8 px-2">
            <p className="text-muted text-xs mb-3">
              No stock in boardroom feed matches "{searchQuery}".
            </p>
            <button
              onClick={handleSearchSubmit}
              disabled={isAnalyzing}
              className="px-3 py-1.5 rounded-lg bg-gold/20 text-gold border border-gold/30 text-xs font-semibold hover:bg-gold/30 transition cursor-pointer"
            >
              Search & Add "{searchQuery}" to Boardroom →
            </button>
          </div>
        ) : (
          filteredSignals.map((signal, i) => (
            <motion.div
              key={signal.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
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
