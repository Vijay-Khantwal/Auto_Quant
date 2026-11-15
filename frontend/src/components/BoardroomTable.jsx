import React, { useState, useRef, useEffect, useMemo } from 'react';
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

  // Auto-scroll to latest turn as messages arrive in real-time
  useEffect(() => {
    if (scrollRef.current && activeTab === 'debate') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns.length, isStreaming, activeTab]);

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

  // Determine active speaking agent
  let currentSpeakingAgent = null;
  if (isStreaming) {
    const turnsCount = turns.length;
    if (turnsCount === 0 || turnsCount === 2 || turnsCount === 4) {
      currentSpeakingAgent = 'value';
    } else if (turnsCount === 1 || turnsCount === 3) {
      currentSpeakingAgent = 'risk';
    } else if (turnsCount >= 5) {
      currentSpeakingAgent = 'jev';
    }
  }

  // Calculate net conviction dynamically as turns stream in
  const convictionValue = debateData.runningConviction !== undefined
    ? debateData.runningConviction
    : turns.reduce((acc, t) => acc + (t.conviction_delta || 0), 0);

  const isJevVisible = debateFinished || !!jevResult;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Top Bar with Stock Overview & Layout Controls */}
      <div className="p-4 border-b border-border bg-panel/40 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          {/* Stock identity */}
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-xl font-bold text-gold tracking-tight">{signal.symbol}</h2>
                <span className="font-mono text-base font-semibold text-text">
                  ₹{Number(signal.price).toLocaleString()}
                </span>
                {signal.market_cap_display && (
                  <span className="text-xs font-mono text-muted px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                    {signal.market_cap_display}
                  </span>
                )}
                <span className={`text-xs font-mono px-2 py-0.5 rounded-md border ${Number(priceChangePct) >= 0 ? 'bg-value/10 text-value border-value/20' : 'bg-risk/10 text-risk border-risk/20'}`}>
                  {Number(priceChangePct) >= 0 ? `+${priceChangePct}%` : `${priceChangePct}%`} (30d)
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                {signal.company_name} · <span className="text-text/80">{signal.sector}</span>
              </p>
            </div>
          </div>

          {/* Action & Layout Toolbar */}
          <div className="flex items-center gap-2">
            {onRegenerateDebate && (
              <button
                onClick={onRegenerateDebate}
                disabled={isStreaming}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25 transition disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
                title="Regenerate dynamic debate in real time"
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
                  className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5
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
                  className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5
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
                  className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5
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
        <div className="max-w-5xl mx-auto flex items-center gap-4 mt-3 border-t border-border/40 pt-2">
          <button
            onClick={() => setActiveTab('debate')}
            className={`text-xs font-semibold pb-1.5 px-2 border-b-2 transition flex items-center gap-1.5
              ${activeTab === 'debate'
                ? 'border-gold text-gold'
                : 'border-transparent text-muted hover:text-text'}`}
          >
            <span>💬</span>
            <span>Committee Debate ({turns.length} turns)</span>
          </button>
          <button
            onClick={() => setActiveTab('fundamentals')}
            className={`text-xs font-semibold pb-1.5 px-2 border-b-2 transition flex items-center gap-1.5
              ${activeTab === 'fundamentals'
                ? 'border-gold text-gold'
                : 'border-transparent text-muted hover:text-text'}`}
          >
            <span>📈</span>
            <span>Valuation & Technicals</span>
          </button>
          {debateData.skill_name && (
            <span className="ml-auto text-[11px] font-mono text-muted/70">
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
                    isSpeaking={currentSpeakingAgent === 'value'}
                  />
                </div>

                {/* Center Conviction Tug-of-War Gauge */}
                <div className="flex-1 max-w-sm px-2 flex flex-col items-center">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted mb-1 flex items-center gap-1.5">
                    <span>Conviction Tug-of-War</span>
                    <span className={`font-semibold ${convictionValue > 0 ? 'text-value' : convictionValue < 0 ? 'text-risk' : 'text-muted'}`}>
                      {convictionValue > 0 ? `+${convictionValue} Bullish` : convictionValue < 0 ? `${convictionValue} Bearish` : 'Neutral (0)'}
                    </span>
                  </div>
                  <div className="w-full">
                    <ConvictionBar value={convictionValue} />
                  </div>
                  <div className="flex justify-between w-full text-[9px] font-mono text-muted/70 mt-1">
                    <span className="text-value">◀ Bull Thesis</span>
                    <span className="text-risk">Risk Headwinds ▶</span>
                  </div>
                </div>

                {/* Risk Agent Seat */}
                <div className="flex-1 min-w-[140px] flex justify-end">
                  <AgentSeat
                    agent="risk"
                    name="Risk Agent"
                    tags={debateData.risk_tags || ['Prudent', 'Downside Scrutiny']}
                    isSpeaking={currentSpeakingAgent === 'risk'}
                  />
                </div>
              </div>
            </div>

            {/* Speech Bubbles Stream */}
            <div
              ref={scrollRef}
              className="space-y-3 min-h-[220px] max-h-[460px] overflow-y-auto px-1 py-1 scroll-smooth"
            >
              {turns.length === 0 && !isStreaming && (
                <div className="text-center py-12 text-muted text-xs border border-dashed border-border rounded-2xl">
                  No debate turns recorded. Click "Re-Debate" above to convene the committee.
                </div>
              )}

              {turns.filter(t => t.agent !== 'jev').map((turn, i) => (
                <SpeechBubble
                  key={turn.order || i}
                  turn={turn}
                  isLatest={i === turns.filter(t => t.agent !== 'jev').length - 1 && isStreaming}
                  onAskAgent={onAskAgent}
                />
              ))}

              {/* Live real-time indicator */}
              {isStreaming && (
                <div className="flex items-center gap-2.5 py-2.5 px-4 rounded-xl bg-gold/10 border border-gold/30 text-xs text-gold animate-pulse">
                  <span className="w-2.5 h-2.5 rounded-full bg-gold animate-ping" />
                  <span className="font-mono">
                    {currentSpeakingAgent === 'value' && 'Value Agent is formulating investment thesis & growth catalysts...'}
                    {currentSpeakingAgent === 'risk' && 'Risk Agent is scrutinizing valuation multiples & downside risks...'}
                    {currentSpeakingAgent === 'jev' && 'Jev is running deterministic compliance rule checks...'}
                    {!currentSpeakingAgent && 'Investment Committee is convening...'}
                  </span>
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
            {lessonCard && (
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
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-gold/15 border border-gold/30 text-gold hover:bg-gold/25 transition flex items-center gap-1.5 shadow-sm"
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
