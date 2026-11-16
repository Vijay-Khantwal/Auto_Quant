import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

function useTypewriter(text, isActive, speed = 12) {
  const [displayed, setDisplayed] = useState(isActive ? '' : text);
  const [done, setDone] = useState(!isActive);

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
      i += 3;
      if (i >= text.length) {
        setDisplayed(text);
        setDone(true);
        clearInterval(interval);
      } else {
        setDisplayed(text.slice(0, i));
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, isActive, speed]);

  return { displayed, done };
}

export default function SpeechBubble({ turn, isLatest = false, onAskAgent, speed = 12 }) {
  const isValue = turn.agent === 'value';
  const isRisk = turn.agent === 'risk';
  const isJev = turn.agent === 'jev';
  const { displayed, done } = useTypewriter(turn.text, isLatest, speed);

  const containerAlign = isValue
    ? 'justify-start'
    : isRisk
      ? 'justify-end'
      : 'justify-center';

  const bubbleStyling = isValue
    ? 'mr-auto ml-0 bg-[#0d221c]/90 border border-emerald-500/30 rounded-2xl rounded-tl-xs shadow-[0_4px_24px_rgba(16,185,129,0.07)]'
    : isRisk
      ? 'ml-auto mr-0 bg-[#240e16]/90 border border-rose-500/30 rounded-2xl rounded-tr-xs shadow-[0_4px_24px_rgba(244,63,94,0.07)]'
      : 'mx-auto bg-blue-950/40 border border-blue-400/30 rounded-2xl shadow-sm';

  const badgeTheme = isValue
    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
    : isRisk
      ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
      : 'bg-blue-500/15 border-blue-500/30 text-blue-400';

  const deltaTheme = turn.conviction_delta > 0
    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    : turn.conviction_delta < 0
      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      : 'bg-blue-500/20 text-blue-300 border-blue-500/30';

  return (
    <div className={`w-full flex ${containerAlign} my-1.5`}>
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: isLatest ? 1 : 0.96, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className={`w-full max-w-[88%] sm:max-w-[82%] md:max-w-[76%] lg:max-w-[72%] p-4 border ${bubbleStyling} transition-all duration-200`}
      >
        {/* Opposing Agent Header */}
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeTheme}`}>
              <span>{isValue ? '📈' : isRisk ? '🛡️' : '🔒'}</span>
              <span>{isValue ? 'Value Agent' : isRisk ? 'Risk Agent' : 'Jev'}</span>
            </span>
            <span className="text-[11px] text-muted font-normal">
              {turn.stance === 'buy'
                ? 'Bullish Catalyst'
                : turn.stance === 'object'
                  ? 'Downside Scrutiny'
                  : 'Compliance Review'}
            </span>
          </div>

          {turn.conviction_delta !== undefined && turn.conviction_delta !== 0 && (
            <span className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full border ${deltaTheme}`}>
              {turn.conviction_delta > 0 ? `+${turn.conviction_delta} Bullish` : `${turn.conviction_delta} Headwind`}
            </span>
          )}
        </div>

        {/* Turn dialogue text with typewriter */}
        <p className="text-sm leading-relaxed text-text/90 font-normal">
          {displayed}
          {isLatest && !done && <span className="animate-pulse text-gold ml-0.5">▊</span>}
        </p>

        {/* Evidence pills & interrogate action */}
        {done && (
          <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-white/5 flex-wrap">
            {turn.evidence && turn.evidence.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {turn.evidence.map((ev, i) => (
                  <span
                    key={i}
                    className={`px-2 py-0.5 text-[11px] font-mono rounded-md border ${
                      isValue
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200/90'
                        : isRisk
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-200/90'
                          : 'bg-white/5 border-white/10 text-muted'
                    }`}
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
                className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded-md border transition flex items-center gap-1 cursor-pointer ${
                  isValue
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/20'
                    : 'bg-rose-500/10 border-rose-500/25 text-rose-300 hover:bg-rose-500/20'
                }`}
                title={`Ask @${turn.agent} to elaborate in Research Chat`}
              >
                <span>💬</span>
                <span>Interrogate @{turn.agent}</span>
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
