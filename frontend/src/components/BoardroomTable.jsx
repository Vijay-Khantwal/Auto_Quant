import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AgentSeat from './AgentSeat';
import SpeechBubble from './SpeechBubble';
import ConvictionBar from './ConvictionBar';
import JevPanel from './JevPanel';
import VoteBar from './VoteBar';
import { fetchQuantSignal } from '../api';

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4 text-gold/60">◈</div>
        <h3 className="text-lg font-semibold mb-2">Select an Institutional Signal</h3>
        <p className="text-muted text-sm leading-relaxed">
          Choose a stock from the left feed or search any custom ticker to convene the committee debate between the Value and Risk agents.
        </p>
      </div>
    </div>
  );
}

export default function BoardroomTable({
  signal,
  debate,
  jevResult,
  isStreaming = false,
  debateFinished = false,
  quantity,
  onQuantityChange,
  onExecute,
  onPass,
  lessonCard,
  onRegenerateDebate,
  leftCollapsed = false,
  rightCollapsed = false,
  onToggleLeft,
  onToggleRight,
  onToggleFocus,
  onAskAgent,
}) {
  const [activeTab, setActiveTab] = useState('debate'); // 'debate' | 'fundamentals'
  const [quantData, setQuantData] = useState(null);
  const [loadingQuant, setLoadingQuant] = useState(false);
  const scrollRef = useRef(null);

  const turns = debate?.debate?.turns || [];
  const debateData = debate?.debate || {};

  // Separate non-Jev dialogue turns from Jev compliance turn
  const nonJevTurns = useMemo(() => {
    return turns.filter(t => t.agent !== 'jev');
  }, [turns]);

  const totalTurnsCount = nonJevTurns.length;

  // Dialogue Orchestrator State for To-and-Fro playback
  const [visibleTurnCount, setVisibleTurnCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1 | 1.5 | 2
  const [activeSpeaker, setActiveSpeaker] = useState(null); // 'value' | 'risk' | 'jev' | null
  const [speakerStatus, setSpeakerStatus] = useState('');

  // Visible dialogue turns (declared before useEffect dependencies)
  const visibleTurns = useMemo(() => {
    if (isPlaying) {
      return nonJevTurns.slice(0, Math.max(0, visibleTurnCount));
    }
    return nonJevTurns;
  }, [isPlaying, nonJevTurns, visibleTurnCount]);

  // Net conviction updates dynamically with each turn that appears
  const convictionValue = useMemo(() => {
    if (visibleTurns.length === 0) return 0;
    return visibleTurns.reduce((acc, t) => acc + (t.conviction_delta || 0), 0);
  }, [visibleTurns]);

  // Jev Panel & VoteBar unlock when debate finishes or is already available
  const isJevVisible = useMemo(() => {
    if (isPlaying) {
      return visibleTurnCount >= totalTurnsCount && totalTurnsCount > 0;
    }
    return Boolean(debateFinished || (jevResult && (!isStreaming || debateData?.summary)));
  }, [isPlaying, visibleTurnCount, totalTurnsCount, debateFinished, jevResult, isStreaming, debateData]);

  const seenSignalsRef = useRef(new Set());
  const timerRef = useRef(null);
  const transitionTimerRef = useRef(null);
  const prevSignalIdRef = useRef(null);
  const prevStreamingRef = useRef(isStreaming);

  // Fetch explainable quant ML profile
  useEffect(() => {
    if (!signal?.id) return;
    setLoadingQuant(true);
    fetchQuantSignal(signal.id)
      .then(res => {
        setQuantData(res.profile || null);
      })
      .catch(err => {
        console.warn('Failed to load quant profile:', err);
      })
      .finally(() => {
        setLoadingQuant(false);
      });
  }, [signal?.id]);

  // Handle Signal change: ensure new/selected signal displays its debate cleanly
  useEffect(() => {
    if (!signal?.id) return;

    const isNewSignal = prevSignalIdRef.current !== signal.id;
    prevSignalIdRef.current = signal.id;

    if (isNewSignal) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      setIsPlaying(false);
      setIsPaused(false);
      setActiveSpeaker(null);
      setSpeakerStatus('');
      setVisibleTurnCount(nonJevTurns.length);
    }
  }, [signal?.id, nonJevTurns.length]);

  // Dynamic speaker indicator during live streaming
  useEffect(() => {
    if (!isStreaming) return;

    const count = nonJevTurns.length;
    if (count === 0) {
      setActiveSpeaker('value');
      setSpeakerStatus('Value Agent is formulating opening investment thesis & growth catalysts...');
    } else if (count === 1) {
      setActiveSpeaker('risk');
      setSpeakerStatus('Risk Agent is scrutinizing valuation multiples & downside risks...');
    } else if (count === 2) {
      setActiveSpeaker('value');
      setSpeakerStatus('Value Agent is preparing counter-rebuttal on competitive moats...');
    } else if (count === 3) {
      setActiveSpeaker('risk');
      setSpeakerStatus('Risk Agent is probing governance, liquidity & cycle risks...');
    } else if (count === 4) {
      setActiveSpeaker('value');
      setSpeakerStatus('Value Agent is summarizing net conviction thesis...');
    } else if (count >= 5) {
      if (!jevResult) {
        setActiveSpeaker('jev');
        setSpeakerStatus('Jev Compliance Officer is auditing trade against risk constraints...');
      } else {
        setActiveSpeaker(null);
        setSpeakerStatus('');
      }
    }
  }, [isStreaming, nonJevTurns.length, jevResult]);

  // Dialogue Orchestrator Stepping Effect (Only active when user explicitly clicks "Replay Debate")
  useEffect(() => {
    if (!isPlaying || isPaused) return;

    // Case 1: Waiting to reveal Turn 1
    if (visibleTurnCount === 0) {
      if (totalTurnsCount === 0) {
        setIsPlaying(false);
        return;
      }
      setActiveSpeaker('value');
      setSpeakerStatus('Value Agent is presenting opening investment thesis...');
      timerRef.current = setTimeout(() => {
        setVisibleTurnCount(1);
      }, Math.round(600 / playbackSpeed));
      return () => clearTimeout(timerRef.current);
    }

    // Case 2: In the middle of dialogue turns (1 to totalTurnsCount - 1)
    if (visibleTurnCount > 0 && visibleTurnCount < totalTurnsCount) {
      const nextTurn = nonJevTurns[visibleTurnCount];
      const nextSpeaker = nextTurn ? nextTurn.agent : (visibleTurnCount % 2 === 1 ? 'risk' : 'value');

      const readDuration = Math.round(1800 / playbackSpeed);
      const switchTime = Math.round(800 / playbackSpeed);

      transitionTimerRef.current = setTimeout(() => {
        setActiveSpeaker(nextSpeaker);
        if (nextSpeaker === 'risk') {
          setSpeakerStatus('Risk Agent is scrutinizing valuation multiples & downside risks...');
        } else {
          setSpeakerStatus('Value Agent is preparing counter-rebuttal on competitive moats...');
        }
      }, switchTime);

      timerRef.current = setTimeout(() => {
        setVisibleTurnCount(c => c + 1);
      }, readDuration);

      return () => {
        clearTimeout(timerRef.current);
        clearTimeout(transitionTimerRef.current);
      };
    }

    // Case 3: All dialogue turns revealed, transition to Jev compliance
    if (visibleTurnCount >= totalTurnsCount && totalTurnsCount > 0) {
      setActiveSpeaker('jev');
      setSpeakerStatus('Jev Compliance Officer is auditing trade against risk constraints...');

      timerRef.current = setTimeout(() => {
        setIsPlaying(false);
        setActiveSpeaker(null);
        setSpeakerStatus('');
        setVisibleTurnCount(totalTurnsCount);
      }, Math.round(900 / playbackSpeed));

      return () => clearTimeout(timerRef.current);
    }
  }, [isPlaying, isPaused, visibleTurnCount, nonJevTurns, totalTurnsCount, playbackSpeed]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  // Controls: Skip to end
  const handleSkipToEnd = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    setVisibleTurnCount(totalTurnsCount);
    setIsPlaying(false);
    setIsPaused(false);
    setActiveSpeaker(null);
    setSpeakerStatus('');
  }, [totalTurnsCount]);

  // Controls: Replay debate
  const handleReplayDebate = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    setVisibleTurnCount(0);
    setIsPlaying(true);
    setIsPaused(false);
    setActiveSpeaker('value');
    setSpeakerStatus('Value Agent is formulating opening investment thesis & growth catalysts...');
  }, []);

  // Controls: Toggle Pause
  const handleTogglePause = useCallback(() => {
    setIsPaused(p => !p);
  }, []);

  // Keyboard shortcuts: Space toggles pause, S skips to end
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.code === 'Space' && isPlaying) {
        e.preventDefault();
        setIsPaused(p => !p);
      } else if (e.key.toLowerCase() === 's' && isPlaying) {
        e.preventDefault();
        handleSkipToEnd();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, handleSkipToEnd]);

  // Auto-scroll to latest turn as visible turns or status updates
  useEffect(() => {
    if (scrollRef.current && activeTab === 'debate') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleTurns?.length, isStreaming, isPlaying, speakerStatus, activeTab]);



  // Sparkline data for fundamentals tab
  const sparkData = useMemo(() => {
    if (!signal?.sparkline) return [];
    return signal.sparkline.map((price, idx) => ({
      day: `D-${30 - idx}`,
      price: Number(price),
    }));
  }, [signal?.sparkline]);

  const priceChangePct = useMemo(() => {
    if (!signal?.sparkline || signal.sparkline.length < 2) return 0;
    const first = signal.sparkline[0];
    const last = signal.sparkline[signal.sparkline.length - 1];
    if (first === 0) return 0;
    return (((last - first) / first) * 100).toFixed(1);
  }, [signal?.sparkline]);

  if (!signal) return <EmptyState />;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Top Bar with Stock Overview & Layout Controls */}
      <div className="px-5 py-3.5 border-b border-white/[0.08] bg-[#0B1020]/95 backdrop-blur-md sticky top-0 z-30 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          {/* Stock identity */}
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="font-mono text-xl font-bold text-gold tracking-tight">{signal.symbol}</h2>
                <span className="font-mono text-base font-semibold text-text">
                  ₹{Number(signal.price).toLocaleString()}
                </span>
                {signal.market_cap_display && (
                  <span className="text-[11px] font-mono text-gold/80 px-2 py-0.5 rounded-md bg-gold/[0.08] border border-gold/[0.15]">
                    {signal.market_cap_display}
                  </span>
                )}
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md border ${Number(priceChangePct) >= 0 ? 'bg-value/10 text-value border-value/20' : 'bg-risk/10 text-risk border-risk/20'}`}>
                  {Number(priceChangePct) >= 0 ? `+${priceChangePct}%` : `${priceChangePct}%`} (30d)
                </span>
              </div>
              <p className="text-xs text-muted mt-1">
                {signal.company_name} · <span className="text-text/80">{signal.sector}</span>
              </p>
            </div>
          </div>

          {/* Action & Layout Toolbar */}
          <div className="flex items-center gap-2">
            {onRegenerateDebate && (
              <button
                onClick={onRegenerateDebate}
                disabled={isStreaming || isPlaying}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25 transition disabled:opacity-40 flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Regenerate dynamic debate in real time via Azure OpenAI"
              >
                <span>{isStreaming ? '⚡' : '✨'}</span>
                <span>{isStreaming ? 'Debating...' : 'Re-Debate'}</span>
              </button>
            )}

            {/* View & Collapse Controls */}
            <div className="flex items-center bg-white/[0.04] p-1 rounded-xl border border-white/10 text-xs">
              {onToggleLeft && (
                <button
                  onClick={onToggleLeft}
                  className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer
                    ${!leftCollapsed ? 'bg-gold/20 text-gold border border-gold/30' : 'text-muted hover:text-text'}`}
                  title="Toggle Stock Signals Feed ([)"
                >
                  <span>◧</span>
                  <span className="hidden md:inline">Signals</span>
                </button>
              )}
              {onToggleFocus && (
                <button
                  onClick={onToggleFocus}
                  className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer
                    ${leftCollapsed && rightCollapsed ? 'bg-gold/20 text-gold border border-gold/30' : 'text-muted hover:text-text'}`}
                  title="Toggle Focus Mode (Both sidebars collapsed) (F)"
                >
                  <span>⛶</span>
                  <span className="hidden md:inline">Focus</span>
                </button>
              )}
              {onToggleRight && (
                <button
                  onClick={onToggleRight}
                  className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer
                    ${!rightCollapsed ? 'bg-gold/20 text-gold border border-gold/30' : 'text-muted hover:text-text'}`}
                  title="Toggle Research Chat (])"
                >
                  <span className="hidden md:inline">Chat</span>
                  <span>◨</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs inside the Boardroom */}
        <div className="max-w-5xl mx-auto flex items-center gap-2 mt-2.5 pt-2 border-t border-white/[0.06]">
          <button
            onClick={() => setActiveTab('debate')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer
              ${activeTab === 'debate'
                ? 'bg-gold/15 text-gold border border-gold/30 shadow-sm'
                : 'text-muted hover:text-text hover:bg-white/[0.04]'}`}
          >
            <span>💬</span>
            <span>Committee Debate</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-muted ml-0.5">
              {isPlaying && visibleTurnCount > 0 ? `Turn ${visibleTurnCount}/${totalTurnsCount}` : `${totalTurnsCount} turns`}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('fundamentals')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer
              ${activeTab === 'fundamentals'
                ? 'bg-gold/15 text-gold border border-gold/30 shadow-sm'
                : 'text-muted hover:text-text hover:bg-white/[0.04]'}`}
          >
            <span>📈</span>
            <span>Valuation & Technicals</span>
          </button>
          {debateData.skill_name && (
            <span className="ml-auto text-[11px] font-mono text-muted/70 shrink-0 hidden sm:inline">
              Style: <span className="text-gold/90">{debateData.skill_name}</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-5 max-w-5xl mx-auto w-full space-y-4">
        {activeTab === 'debate' ? (
          <>
            {/* Executive Dais: Value Agent + Integrated Tug-of-War Gauge + Risk Agent */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.04] to-transparent border border-white/10 shadow-sm">
              <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                {/* Value Agent Seat */}
                <div className="flex-1 min-w-[140px]">
                  <AgentSeat
                    agent="value"
                    name="Value Agent"
                    tags={debateData.value_tags || ['Analytical', 'Growth Catalysts']}
                    isSpeaking={activeSpeaker === 'value'}
                  />
                </div>

                {/* Center Conviction Tug-of-War Gauge */}
                <div className="flex-1 max-w-sm px-2 flex flex-col items-center">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted/90 mb-1.5 flex items-center gap-1.5">
                    <span className="text-text/70">Conviction Tug-of-War</span>
                    <span className={`font-bold text-[11px] ${convictionValue > 0 ? 'text-value' : convictionValue < 0 ? 'text-risk' : 'text-muted'}`}>
                      {convictionValue > 0 ? `+${convictionValue} Bullish` : convictionValue < 0 ? `${convictionValue} Bearish` : 'Neutral (0)'}
                    </span>
                  </div>
                  <div className="w-full">
                    <ConvictionBar value={convictionValue} />
                  </div>
                  <div className="flex justify-between w-full text-[10px] font-mono mt-1.5">
                    <span className="text-value/90 font-medium">◀ Bull Thesis</span>
                    <span className="text-risk/90 font-medium">Risk Headwinds ▶</span>
                  </div>
                </div>

                {/* Risk Agent Seat */}
                <div className="flex-1 min-w-[140px] flex justify-end">
                  <AgentSeat
                    agent="risk"
                    name="Risk Agent"
                    tags={debateData.risk_tags || ['Prudent', 'Downside Scrutiny']}
                    isSpeaking={activeSpeaker === 'risk'}
                  />
                </div>
              </div>

              {/* Dais Toolbar: Playback controls + To-and-fro Step Indicators */}
              <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-white/10 text-xs flex-wrap bg-white/[0.02] -mx-4 -mb-4 px-4 pb-3 rounded-b-2xl">
                {/* Progress info & dots */}
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] font-mono text-muted flex items-center gap-1.5">
                    {isPlaying ? (
                      <span className="text-gold font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-gold animate-ping" />
                        Replay Turn {Math.min(visibleTurnCount + 1, totalTurnsCount)} of {totalTurnsCount || 5}
                      </span>
                    ) : isStreaming ? (
                      <span className="text-gold font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-gold animate-ping" />
                        Live Debate: Turn {totalTurnsCount} of 5
                      </span>
                    ) : (
                      <span>{totalTurnsCount} turns total</span>
                    )}
                  </span>

                  {totalTurnsCount > 0 && (
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.max(totalTurnsCount, isStreaming ? 5 : totalTurnsCount) }).map((_, idx) => (
                        <span
                          key={idx}
                          className={`w-2 h-2 rounded-full transition-all duration-300 ${
                            idx < (isPlaying ? visibleTurnCount : totalTurnsCount)
                              ? (idx % 2 === 0 ? 'bg-value ring-1 ring-value/50' : 'bg-risk ring-1 ring-risk/50')
                              : 'bg-white/10'
                          }`}
                          title={`Turn ${idx + 1}: ${idx % 2 === 0 ? 'Value Agent' : 'Risk Agent'}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Playback Controls */}
                <div className="flex items-center gap-2">
                  {isPlaying && (
                    <>
                      <button
                        type="button"
                        onClick={handleTogglePause}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-muted hover:text-text transition flex items-center gap-1 cursor-pointer"
                        title="Pause / Resume debate playback (Space)"
                      >
                        <span>{isPaused ? '▶' : '⏸'}</span>
                        <span>{isPaused ? 'Resume' : 'Pause'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPlaybackSpeed(s => s === 1 ? 1.5 : s === 1.5 ? 2 : 1)}
                        className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gold transition cursor-pointer"
                        title="Toggle speed: 1x, 1.5x, 2x"
                      >
                        {playbackSpeed}x
                      </button>

                      <button
                        type="button"
                        onClick={handleSkipToEnd}
                        className="px-3 py-1 text-xs font-semibold rounded-lg bg-gold/20 hover:bg-gold/30 border border-gold/40 text-gold transition flex items-center gap-1 cursor-pointer shadow-sm"
                        title="Skip to end of debate (S)"
                      >
                        <span>⏭</span>
                        <span>Skip to End</span>
                      </button>
                    </>
                  )}

                  {!isPlaying && totalTurnsCount > 0 && (
                    <button
                      type="button"
                      onClick={handleReplayDebate}
                      className="px-3 py-1 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-muted hover:text-gold transition flex items-center gap-1.5 cursor-pointer"
                      title="Replay the debate step by step"
                    >
                      <span>↺</span>
                      <span>Replay Debate</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Speech Bubbles Stream — Opposing To-and-Fro Conversation */}
            <div
              ref={scrollRef}
              className="flex flex-col space-y-2 min-h-[220px] max-h-[460px] xl:max-h-[560px] 2xl:max-h-[640px] overflow-y-auto px-1 py-1 scroll-smooth"
            >
              {totalTurnsCount === 0 && !isStreaming && !isPlaying && (
                <div className="text-center py-12 text-muted text-xs border border-dashed border-border rounded-2xl">
                  No debate turns recorded. Click "Re-Debate" above to convene the committee.
                </div>
              )}

              {/* Render visible turns (Value on left, Risk on right) */}
              {visibleTurns.map((turn, i) => (
                <SpeechBubble
                  key={turn.order || i}
                  turn={turn}
                  isLatest={(isStreaming && i === visibleTurns.length - 1) || (isPlaying && i === visibleTurnCount - 1)}
                  onAskAgent={onAskAgent}
                  speed={Math.round(12 / playbackSpeed)}
                />
              ))}

              {/* Dynamic to-and-fro active speaker indicator (Appears on the speaker's opposing side) */}
              {(isStreaming || isPlaying) && activeSpeaker && (
                <div className={`w-full flex ${
                  activeSpeaker === 'value'
                    ? 'justify-start'
                    : activeSpeaker === 'risk'
                      ? 'justify-end'
                      : 'justify-center'
                } my-2`}>
                  <div className={`flex items-center gap-2.5 py-2.5 px-4 rounded-xl border text-xs shadow-sm animate-pulse max-w-[85%] md:max-w-[70%] ${
                    activeSpeaker === 'value'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 rounded-tl-xs'
                      : activeSpeaker === 'risk'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 rounded-tr-xs'
                        : 'bg-gold/10 border-gold/30 text-gold'
                  }`}>
                    <span className={`w-2 h-2 rounded-full animate-ping shrink-0 ${
                      activeSpeaker === 'value' ? 'bg-emerald-400' : activeSpeaker === 'risk' ? 'bg-rose-400' : 'bg-gold'
                    }`} />
                    <span className="font-mono font-medium">
                      {speakerStatus || (
                        activeSpeaker === 'value'
                          ? 'Value Agent is formulating investment thesis & growth catalysts...'
                          : activeSpeaker === 'risk'
                            ? 'Risk Agent is scrutinizing valuation multiples & downside risks...'
                            : 'Jev is running deterministic compliance rule checks...'
                      )}
                    </span>
                    {isPlaying && (
                      <button
                        type="button"
                        onClick={handleSkipToEnd}
                        className="ml-2 px-2 py-0.5 text-[10px] font-semibold rounded bg-white/10 hover:bg-white/20 border border-white/20 transition cursor-pointer"
                      >
                        Skip ⏭
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Jev Compliance Panel */}
            {isJevVisible && (
              <JevPanel
                jevResult={jevResult || debate?.jev_report}
                signal={signal}
                quantity={quantity}
                onQuantityChange={onQuantityChange}
              />
            )}

            {/* Vote Bar */}
            {isJevVisible && (
              <VoteBar
                signal={signal}
                jevResult={jevResult || debate?.jev_report}
                debateFinished={debateFinished}
                quantity={quantity}
                onQuantityChange={onQuantityChange}
                onExecute={onExecute}
                onPass={onPass}
                defaultQuantity={debate?.default_quantity || 10}
              />
            )}

            {/* Lesson Card */}
            {lessonCard && isJevVisible && (
              <div className="p-4 rounded-2xl bg-gold/5 border border-gold/20 text-sm shadow-sm">
                <div className="text-gold font-semibold text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <span>💡</span>
                  <span>Educational Takeaway</span>
                </div>
                <p className="text-text/90 leading-relaxed text-xs">{lessonCard}</p>
              </div>
            )}
          </>
        ) : (
          /* Fundamentals & Quantitative ML Prediction Engine */
          <div className="space-y-4">
            {/* Explainable ML Predictor Banner */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-gold/10 via-panel to-value/10 border border-gold/30 shadow-lg">
              <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🤖</span>
                  <div>
                    <h3 className="text-sm font-bold text-text flex items-center gap-2">
                      <span>Quantitative ML Prediction Engine</span>
                      {loadingQuant && <span className="text-xs text-muted font-normal animate-pulse">(Computing metrics...)</span>}
                    </h3>
                    <p className="text-xs text-muted">Multi-factor algorithmic momentum, mean reversion & volatility evaluation</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted">Model Verdict:</span>
                  <span className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border shadow-sm ${
                    (quantData?.ml_score || signal.ml_confidence) >= 80
                      ? 'bg-value/20 text-value border-value/40 shadow-value/20'
                      : (quantData?.ml_score || signal.ml_confidence) >= 65
                        ? 'bg-gold/20 text-gold border-gold/40 shadow-gold/20'
                        : 'bg-risk/20 text-risk border-risk/40 shadow-risk/20'
                  }`}>
                    {quantData?.signal_verdict || (signal.ml_confidence >= 75 ? 'STRONG BUY' : 'ACCUMULATE')} ({quantData?.ml_score || signal.ml_confidence}%)
                  </span>
                </div>
              </div>

              {/* Algorithmic Narrative */}
              <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 text-xs text-text/90 leading-relaxed font-mono">
                {quantData?.summary || signal.ml_reason}
              </div>

              {/* 4 Quantitative Factor Pillars */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3.5">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="text-[10px] font-mono uppercase text-muted mb-0.5">Trend Alignment</div>
                  <div className="font-bold text-xs text-gold truncate">
                    {quantData?.trend || 'BULLISH'}
                  </div>
                  <div className="text-[10px] text-muted/80 truncate mt-0.5">
                    {quantData?.trend_status || 'EMA-5 > EMA-15'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="text-[10px] font-mono uppercase text-muted mb-0.5">Relative Strength (RSI)</div>
                  <div className={`font-bold text-xs ${
                    quantData?.rsi >= 70 ? 'text-risk' : quantData?.rsi <= 35 ? 'text-value' : 'text-text'
                  }`}>
                    {quantData?.rsi !== undefined ? quantData.rsi : '58.4'}
                  </div>
                  <div className="text-[10px] text-muted/80 truncate mt-0.5">
                    {quantData?.rsi_status || 'Healthy Accumulation'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="text-[10px] font-mono uppercase text-muted mb-0.5">Volatility (%B)</div>
                  <div className="font-bold text-xs text-text">
                    {quantData?.pct_b !== undefined ? quantData.pct_b : '0.72'}
                  </div>
                  <div className="text-[10px] text-muted/80 truncate mt-0.5">
                    Upper: ₹{quantData?.upper_band || (signal.price * 1.05).toFixed(1)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="text-[10px] font-mono uppercase text-muted mb-0.5">30-Day Momentum</div>
                  <div className={`font-bold text-xs ${Number(priceChangePct) >= 0 ? 'text-value' : 'text-risk'}`}>
                    {quantData?.roc_30 !== undefined ? `${quantData.roc_30 > 0 ? '+' : ''}${quantData.roc_30}%` : `${Number(priceChangePct) >= 0 ? '+' : ''}${priceChangePct}%`}
                  </div>
                  <div className="text-[10px] text-muted/80 truncate mt-0.5">
                    Net price rate of change
                  </div>
                </div>
              </div>
            </div>

            {/* 30-Day Interactive Chart */}
            <div className="p-5 rounded-2xl bg-panel border border-border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-text">30-Day Historical Price Action</h3>
                  <p className="text-xs text-muted">Closing session quotes (in ₹)</p>
                </div>
                <span className={`text-xs font-mono font-bold px-2 py-1 rounded-lg ${Number(priceChangePct) >= 0 ? 'bg-value/15 text-value border border-value/30' : 'bg-risk/15 text-risk border border-risk/30'}`}>
                  {Number(priceChangePct) >= 0 ? `▲ +${priceChangePct}%` : `▼ ${priceChangePct}%`}
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkData}>
                    <XAxis dataKey="day" stroke="#8B93A7" fontSize={10} tickLine={false} />
                    <YAxis
                      domain={['auto', 'auto']}
                      stroke="#8B93A7"
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={val => `₹${val}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#131822',
                        borderColor: '#262D3D',
                        borderRadius: '12px',
                        color: '#E2E8F0',
                        fontSize: '12px',
                      }}
                      formatter={val => [`₹${val}`, 'Close Price']}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke={Number(priceChangePct) >= 0 ? '#34D399' : '#F87171'}
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-panel border border-border">
                <div className="text-[11px] uppercase font-mono text-muted mb-1">Market Capitalization</div>
                <div className="text-lg font-bold font-mono text-gold">{signal.market_cap_display || 'N/A'}</div>
                <div className="text-xs text-muted mt-1">₹ Crores estimate</div>
              </div>

              <div className="p-4 rounded-xl bg-panel border border-border">
                <div className="text-[11px] uppercase font-mono text-muted mb-1">Quantitative Momentum</div>
                <div className="text-lg font-bold font-mono text-value">{quantData?.ml_score || signal.ml_confidence}%</div>
                <div className="text-xs text-muted mt-1">Algorithmic trend score</div>
              </div>

              <div className="p-4 rounded-xl bg-panel border border-border">
                <div className="text-[11px] uppercase font-mono text-muted mb-1">Sector Classification</div>
                <div className="text-base font-semibold text-text truncate">{signal.sector}</div>
                <div className="text-xs text-muted mt-1">Indian Equity Market</div>
              </div>
            </div>

            {/* Inquire Action */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => onAskAgent && onAskAgent('value', `What is the investment thesis given the ML Quant score of ${quantData?.ml_score || signal.ml_confidence}% and RSI at ${quantData?.rsi || '58'}?`)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-gold/15 border border-gold/30 text-gold hover:bg-gold/25 transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <span>💬</span>
                <span>Debate this ML Signal in Boardroom Chat →</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
