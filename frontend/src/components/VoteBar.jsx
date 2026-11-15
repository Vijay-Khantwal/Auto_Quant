import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function Confetti() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 200 - 100,
    y: -(Math.random() * 150 + 50),
    rotation: Math.random() * 360,
    color: ['#F5C451', '#34D399', '#60A5FA', '#F87171'][Math.floor(Math.random() * 4)],
    size: Math.random() * 6 + 4,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rotation }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute left-1/2 top-1/2 rounded-sm"
          style={{ width: p.size, height: p.size, background: p.color }}
        />
      ))}
    </div>
  );
}

export default function VoteBar({
  signal, jevResult, debateFinished, quantity, onQuantityChange,
  onExecute, onPass, defaultQuantity = 10,
}) {
  const [showConfetti, setShowConfetti] = useState(false);
  const debounceRef = useRef(null);

  const approved = jevResult?.jev_report?.approved ?? jevResult?.approved ?? false;
  const checks = jevResult?.jev_report?.checks || jevResult?.checks || [];
  const failedRules = checks.filter(c => !c.passed).map(c => c.detail);
  const tradeValue = signal ? quantity * signal.price : 0;
  const isLocked = !debateFinished;

  const handleSlider = useCallback((e) => {
    const val = parseInt(e.target.value, 10);
    onQuantityChange(val);
  }, [onQuantityChange]);

  const handleExecute = useCallback(() => {
    setShowConfetti(true);
    onExecute();
    setTimeout(() => setShowConfetti(false), 1500);
  }, [onExecute]);

  // Compute max qty: budget up to 50% of a typical portfolio
  const maxQty = signal ? Math.max(1, Math.floor(100000 / signal.price)) : 100;

  return (
    <div className="relative p-4 rounded-2xl bg-panel border border-border">
      <AnimatePresence>{showConfetti && <Confetti />}</AnimatePresence>

      {/* Quantity slider */}
      <div className="flex items-center gap-4 mb-3">
        <label className="text-xs text-muted whitespace-nowrap">Qty</label>
        <input
          type="range"
          min="1"
          max={maxQty}
          value={quantity}
          onChange={handleSlider}
          className="flex-1 accent-gold h-1.5 cursor-pointer"
        />
        <span className="font-mono text-sm w-12 text-right">{quantity}</span>
        <span className="text-xs text-muted">
          ≈ ₹{tradeValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        {/* Pass */}
        <button
          onClick={onPass}
          disabled={isLocked}
          className="flex-1 py-2.5 rounded-xl border border-border text-muted font-semibold
            hover:bg-white/5 hover:text-text transition-all duration-200
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Pass
        </button>

        {/* Execute */}
        <div className="relative flex-1 group">
          <button
            onClick={handleExecute}
            disabled={isLocked || !approved}
            className={`w-full py-2.5 rounded-xl font-bold transition-all duration-200
              ${approved && !isLocked
                ? 'bg-gradient-to-r from-gold to-yellow-400 text-bg shadow-[0_4px_16px_rgba(245,196,81,0.3)] hover:shadow-[0_6px_20px_rgba(245,196,81,0.4)] hover:-translate-y-0.5'
                : 'bg-white/5 text-muted border border-border cursor-not-allowed'
              }`}
          >
            {isLocked ? '⏳ Hear the committee first' : approved ? '⚡ Execute' : '🔒 Blocked'}
          </button>
          {/* Tooltip for blocked rules */}
          {!approved && !isLocked && failedRules.length > 0 && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 rounded-xl
              bg-bg border border-risk/30 text-xs text-risk opacity-0 group-hover:opacity-100
              transition-opacity duration-200 pointer-events-none z-10 shadow-xl">
              <div className="font-semibold mb-1">Blocked by Jev:</div>
              {failedRules.map((r, i) => <div key={i}>• {r}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
