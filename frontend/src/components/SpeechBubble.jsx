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

export default function SpeechBubble({ turn, isLatest = false, onAskAgent }) {
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
      animate={{ opacity: isLatest ? 1 : 0.92, y: 0, scale: 1 }}
      transition={{ duration: 0.25 }}
      className={`${align} max-w-[85%] md:max-w-[80%] p-4 rounded-2xl border ${bgClass} transition-opacity duration-200 shadow-sm`}
    >
      {/* Agent label */}
      <div className={`text-[10px] font-semibold uppercase tracking-wider ${textColor} mb-1.5 flex items-center justify-between`}>
        <div>
          {turn.agent === 'value' ? '⬆ Value Agent' : turn.agent === 'jev' ? '🔒 Jev' : '⬇ Risk Agent'}
          <span className="ml-2 text-muted font-normal normal-case">
            {turn.stance === 'buy' ? 'Bullish Thesis' : turn.stance === 'object' ? 'Cautious Scrutiny' : 'Compliance Verdict'}
          </span>
        </div>
        {turn.conviction_delta !== undefined && turn.conviction_delta !== 0 && (
          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${turn.conviction_delta > 0 ? 'bg-value/10 text-value border border-value/20' : 'bg-risk/10 text-risk border border-risk/20'}`}>
            {turn.conviction_delta > 0 ? `+${turn.conviction_delta}` : turn.conviction_delta}
          </span>
        )}
      </div>

      {/* Text with typewriter */}
      <p className="text-sm leading-relaxed text-text/90">
        {displayed}
        {isLatest && !done && <span className="animate-pulse text-gold">▊</span>}
      </p>

      {/* Evidence chips and interrogation action */}
      {done && (
        <div className="flex items-center justify-between gap-2 mt-2.5 flex-wrap">
          {turn.evidence && turn.evidence.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {turn.evidence.map((ev, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-[11px] font-mono rounded-md bg-white/5 border border-white/10 text-muted"
                >
                  {ev}
                </span>
              ))}
            </div>
          )}
          {onAskAgent && turn.agent !== 'jev' && (
            <button
              type="button"
              onClick={() => onAskAgent(turn.agent, turn.text)}
              className="ml-auto text-[10px] font-mono text-muted hover:text-gold px-2 py-0.5 rounded-md bg-white/5 border border-white/10 hover:border-gold/30 hover:bg-gold/10 transition flex items-center gap-1 cursor-pointer"
              title={`Ask @${turn.agent} to elaborate in Research Chat`}
            >
              <span>💬</span>
              <span>Interrogate @{turn.agent}</span>
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
