import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

function useTypewriter(text, isActive, speed = 20) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setDisplayed(text);
      setDone(true);
      return;
    }
    setDisplayed('');
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, isActive, speed]);

  return { displayed, done };
}

export default function SpeechBubble({ turn, isLatest = false }) {
  const isValue = turn.agent === 'value';
  const { displayed, done } = useTypewriter(turn.text, isLatest, 15);

  const bgClass = isValue
    ? 'bg-value/5 border-value/15'
    : turn.agent === 'jev'
      ? 'bg-jev/5 border-jev/15'
      : 'bg-risk/5 border-risk/15';

  const textColor = isValue ? 'text-value' : turn.agent === 'jev' ? 'text-jev' : 'text-risk';
  const align = isValue ? 'self-start' : 'self-end';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: isLatest ? 1 : 0.65, y: 0, scale: 1 }}
      transition={{ duration: 0.25 }}
      className={`${align} max-w-[85%] p-4 rounded-2xl border ${bgClass} transition-opacity duration-200`}
    >
      {/* Agent label */}
      <div className={`text-[10px] font-semibold uppercase tracking-wider ${textColor} mb-1.5`}>
        {turn.agent === 'value' ? '⬆ Value' : turn.agent === 'jev' ? '🔒 Jev' : '⬇ Risk'}
        <span className="ml-2 text-muted font-normal normal-case">
          {turn.stance === 'buy' ? 'Bullish' : turn.stance === 'object' ? 'Cautious' : 'Neutral'}
        </span>
      </div>

      {/* Text with typewriter */}
      <p className="text-sm leading-relaxed text-text/90">
        {displayed}
        {isLatest && !done && <span className="animate-pulse text-gold">▊</span>}
      </p>

      {/* Evidence chips */}
      {done && turn.evidence && turn.evidence.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {turn.evidence.map((ev, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, duration: 0.2 }}
              className="px-2 py-0.5 text-[11px] font-mono rounded-md bg-white/5 border border-white/10 text-muted"
            >
              {ev}
            </motion.span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
