import React from 'react';
import AgentSeat from './AgentSeat';
import SpeechBubble from './SpeechBubble';
import ConvictionBar from './ConvictionBar';
import JevPanel from './JevPanel';
import VoteBar from './VoteBar';
import useDebatePlayer from '../hooks/useDebatePlayer';

function DebateSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3 animate-pulse">
        <div className="w-16 h-16 rounded-full bg-white/5 mx-auto" />
        <div className="h-3 bg-white/5 rounded w-40 mx-auto" />
        <div className="h-2 bg-white/5 rounded w-32 mx-auto" />
      </div>
    </div>
  );
}

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
  signal, debate, jevResult, loadingDebate, debateFinished,
  quantity, onQuantityChange, onDebateFinished, onExecute, onPass, lessonCard,
  onRegenerateDebate
}) {
  const turns = debate?.debate?.turns || [];
  const debateData = debate?.debate || {};
  const player = useDebatePlayer(turns, onDebateFinished);

  if (!signal) return <EmptyState />;
  if (loadingDebate) return <DebateSkeleton />;

  const visibleTurns = turns.slice(0, player.currentTurnIndex + 1);
  const isJevVisible = debateFinished || player.currentTurnIndex >= turns.length - 1;

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
            {debateData.source === 'llm' && (
              <span className="text-[10px] font-mono text-value px-2 py-0.5 rounded-full bg-value/10 border border-value/30">
                ⚡ Live AI (Azure)
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
              className="px-3 py-1 text-xs font-medium rounded-full bg-white/5 border border-white/10 hover:border-gold/40 hover:bg-gold/10 text-gold transition"
              title="Regenerate dynamic debate using Azure OpenAI"
            >
              ✨ Re-Debate (AI)
            </button>
          )}
        </div>
      </div>

      {/* Agent Seats */}
      <div className="flex justify-between items-start gap-8">
        <AgentSeat
          agent="value"
          name="Value Agent"
          tags={debateData.value_tags || ['Analytical', 'Optimistic']}
          isSpeaking={turns[player.currentTurnIndex]?.agent === 'value'}
        />
        <AgentSeat
          agent="risk"
          name="Risk Agent"
          tags={debateData.risk_tags || ['Prudent', 'Skeptical']}
          isSpeaking={turns[player.currentTurnIndex]?.agent === 'risk'}
        />
      </div>

      {/* Speech Bubbles */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-[200px] max-h-[400px] px-2">
        {visibleTurns.filter(t => t.agent !== 'jev').map((turn, i) => (
          <SpeechBubble
            key={i}
            turn={turn}
            isLatest={i === visibleTurns.filter(t => t.agent !== 'jev').length - 1 && player.isPlaying}
          />
        ))}
      </div>

      {/* Conviction Bar */}
      <ConvictionBar value={player.convictionValue} />

      {/* Player Controls */}
      <div className="flex items-center justify-center gap-3">
        {player.isPlaying ? (
          <button onClick={player.pause} className="px-3 py-1.5 text-xs rounded-lg bg-panel border border-border hover:bg-white/10 transition">
            ⏸ Pause
          </button>
        ) : player.currentTurnIndex < turns.length - 1 ? (
          <button onClick={player.play} className="px-3 py-1.5 text-xs rounded-lg bg-panel border border-border hover:bg-white/10 transition">
            ▶ Play
          </button>
        ) : null}
        <button onClick={player.skipToEnd} className="px-3 py-1.5 text-xs rounded-lg bg-panel border border-border hover:bg-white/10 transition">
          ⏭ Skip
        </button>
        <button onClick={player.replay} className="px-3 py-1.5 text-xs rounded-lg bg-panel border border-border hover:bg-white/10 transition">
          ↺ Replay
        </button>
        {/* Progress */}
        <div className="flex-1 max-w-[200px] h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-gold/60 rounded-full transition-all duration-300"
            style={{ width: `${player.progress}%` }}
          />
        </div>
      </div>

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
            💡 What you just learned
          </div>
          <p className="text-text/90">{lessonCard}</p>
        </div>
      )}
    </div>
  );
}
