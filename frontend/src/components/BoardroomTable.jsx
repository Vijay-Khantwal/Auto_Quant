import React, { useRef, useEffect } from 'react';
import AgentSeat from './AgentSeat';
import SpeechBubble from './SpeechBubble';
import ConvictionBar from './ConvictionBar';
import JevPanel from './JevPanel';
import VoteBar from './VoteBar';

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">◈</div>
        <h3 className="text-lg font-semibold mb-2">Select a Signal</h3>
        <p className="text-muted text-sm">
          Choose a stock from the signal feed to start a boardroom debate between the Value and Risk agents.
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
}) {
  const scrollRef = useRef(null);
  const turns = debate?.debate?.turns || [];
  const debateData = debate?.debate || {};

  // Auto-scroll to latest turn as messages arrive in real-time
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns.length, isStreaming]);

  if (!signal) return <EmptyState />;

  // Determine which agent is currently formulating or speaking
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
    <div className="flex flex-col h-full p-6 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-xl font-bold text-gold">{signal.symbol}</h2>
            {signal.market_cap_display && (
              <span className="text-xs font-mono text-muted px-2 py-0.5 rounded bg-white/5 border border-white/10">
                {signal.market_cap_display}
              </span>
            )}
          </div>
          <p className="text-sm text-muted">{signal.company_name} · {signal.sector}</p>
        </div>
        <div className="flex items-center gap-2">
          {debateData.skill_name && (
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-gold/10 text-gold border border-gold/20">
              Tuned by: {debateData.skill_name}
            </span>
          )}
          {onRegenerateDebate && (
            <button
              onClick={onRegenerateDebate}
              disabled={isStreaming}
              className="px-3 py-1 text-xs font-medium rounded-full bg-white/5 border border-white/10 hover:border-gold/40 hover:bg-gold/10 text-gold transition disabled:opacity-40"
              title="Regenerate dynamic debate in real time"
            >
              {isStreaming ? '⚡ Debating...' : '✨ Re-Debate'}
            </button>
          )}
        </div>
      </div>

      {/* Agent Seats */}
      <div className="flex justify-between items-start gap-8">
        <AgentSeat
          agent="value"
          name="Value Agent"
          tags={debateData.value_tags || ['Analytical', 'Growth Catalysts']}
          isSpeaking={currentSpeakingAgent === 'value'}
        />
        <AgentSeat
          agent="risk"
          name="Risk Agent"
          tags={debateData.risk_tags || ['Prudent', 'Downside Scrutiny']}
          isSpeaking={currentSpeakingAgent === 'risk'}
        />
      </div>

      {/* Speech Bubbles Stream */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 min-h-[220px] max-h-[420px] px-2 scroll-smooth"
      >
        {turns.length === 0 && !isStreaming && (
          <div className="text-center py-12 text-muted text-xs">
            No debate turns recorded. Click "Re-Debate" to start the committee.
          </div>
        )}

        {turns.filter(t => t.agent !== 'jev').map((turn, i) => (
          <SpeechBubble
            key={turn.order || i}
            turn={turn}
            isLatest={i === turns.filter(t => t.agent !== 'jev').length - 1 && isStreaming}
          />
        ))}

        {/* Live real-time indicator */}
        {isStreaming && (
          <div className="flex items-center gap-2.5 py-2 px-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-gold animate-pulse">
            <span className="w-2 h-2 rounded-full bg-gold animate-ping" />
            <span className="font-mono">
              {currentSpeakingAgent === 'value' && 'Value Agent is formulating thesis & catalysts...'}
              {currentSpeakingAgent === 'risk' && 'Risk Agent is scrutinizing valuation & downside risks...'}
              {currentSpeakingAgent === 'jev' && 'Jev is evaluating deterministic compliance rules...'}
              {!currentSpeakingAgent && 'Investment Committee is convening...'}
            </span>
          </div>
        )}
      </div>

      {/* Conviction Bar */}
      <ConvictionBar value={convictionValue} />

      {/* Jev Panel */}
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
        <div className="p-4 rounded-xl bg-gold/5 border border-gold/20 text-sm">
          <div className="text-gold font-semibold text-xs uppercase tracking-wider mb-1">
            💡 Educational Takeaway
          </div>
          <p className="text-text/90">{lessonCard}</p>
        </div>
      )}
    </div>
  );
}
