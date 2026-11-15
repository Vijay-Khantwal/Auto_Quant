import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { postChat, fetchChatHistory, clearChatHistory } from '../api';

function ToolChip({ tool, args }) {
  if (!tool) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded-md bg-jev/15 text-jev border border-jev/30">
      🔧 {tool}({args?.symbol || args?.agent || ''})
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-1 py-2 px-3">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gold"
          animate={{ y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export default function ResearchChat({ selectedSignal, externalPrompt, onCollapse }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const inputRef = useRef(null);

  // Sync external prompt (e.g. from speech bubble interrogation)
  useEffect(() => {
    if (externalPrompt) {
      setInput(externalPrompt);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [externalPrompt]);

  // Load persistent chat history from DB when a signal is selected
  useEffect(() => {
    if (!selectedSignal) {
      setMessages([]);
      return;
    }
    setLoadingHistory(true);
    fetchChatHistory(selectedSignal.id)
      .then(res => {
        setMessages(res.messages || []);
      })
      .catch(err => {
        console.warn('Failed to load chat history:', err);
      })
      .finally(() => {
        setLoadingHistory(false);
      });
  }, [selectedSignal?.id]);

  const quickPrompts = [
    { label: '📈 Ask @Value', query: '@value What is your strongest catalyst for buying this stock?' },
    { label: '🛡️ Challenge @Risk', query: '@risk What are the biggest red flags and downside risks?' },
    { label: '📰 Live News', query: 'What is the latest news and sentiment?' },
    { label: '📄 Filing', query: 'Pull the latest financial filing bullets' },
    { label: '📊 Valuation', query: 'Show me the price performance and market cap' },
  ];

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || !selectedSignal) return;

    const userMsg = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const result = await postChat(text, selectedSignal.id);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: result.reply,
        tool: result.tool,
        args: result.args,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Sorry, communication with the research committee timed out. Please try again.',
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  }, [selectedSignal]);

  const handleClear = useCallback(async () => {
    if (!selectedSignal) return;
    try {
      await clearChatHistory(selectedSignal.id);
      setMessages([]);
    } catch (e) {
      console.warn('Failed to clear chat:', e);
    }
  }, [selectedSignal]);

  return (
    <div className="flex flex-col h-full bg-panel">
      {/* Header */}
      <div className="p-3.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 rounded-lg text-muted hover:text-gold hover:bg-white/10 transition text-xs"
              title="Collapse Research Chat (])"
            >
              ▶
            </button>
          )}
          <div>
            <h3 className="text-sm font-semibold text-text flex items-center gap-1.5">
              <span>Research & Committee Chat</span>
            </h3>
            <p className="text-[11px] text-muted">
              {selectedSignal
                ? `Live context: ${selectedSignal.symbol} (${selectedSignal.market_cap_display || ''})`
                : 'Select a stock to interrogate analysts'}
            </p>
          </div>
        </div>
        {selectedSignal && messages.length > 0 && (
          <button
            onClick={handleClear}
            className="text-[10px] text-muted hover:text-risk px-2 py-1 rounded bg-white/5 border border-white/10 transition"
            title="Clear saved chat history for this stock"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingHistory ? (
          <div className="text-center py-6 text-muted text-xs animate-pulse">
            Loading saved research context...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 px-4">
            <div className="text-2xl mb-2">💬</div>
            <p className="text-text font-medium text-xs mb-1">Talk with the Analysts</p>
            <p className="text-muted text-[11px] leading-relaxed">
              Tag <span className="text-value font-mono">@value</span> or <span className="text-risk font-mono">@risk</span> to interrogate the committee, or ask for live filings & Tavily news.
            </p>
          </div>
        ) : null}

        {messages.map((msg, i) => {
          const isUser = msg.role === 'user';
          const isValueAgent = msg.text?.includes('[Value Agent]');
          const isRiskAgent = msg.text?.includes('[Risk Agent]');

          return (
            <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[92%] p-3 rounded-2xl text-xs leading-relaxed
                ${isUser
                  ? 'bg-gold/15 border border-gold/30 text-text ml-4'
                  : isValueAgent
                    ? 'bg-value/10 border border-value/30 text-value mr-4'
                    : isRiskAgent
                      ? 'bg-risk/10 border border-risk/30 text-risk mr-4'
                      : 'bg-white/[0.04] border border-border text-text/90 mr-4'
                }`}>
                {msg.tool && (
                  <div className="mb-1.5">
                    <ToolChip tool={msg.tool} args={msg.args} />
                  </div>
                )}
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          );
        })}
        {loading && <TypingIndicator />}
      </div>

      {/* Quick prompts */}
      <div className="px-3 py-2 flex gap-1.5 flex-wrap border-t border-border/50 bg-black/20">
        {quickPrompts.map((p, i) => (
          <button
            key={i}
            onClick={() => sendMessage(p.query)}
            disabled={loading || !selectedSignal}
            className="px-2 py-1 text-[10px] rounded-lg bg-white/5 border border-white/10
              text-muted hover:text-text hover:bg-white/10 transition
              disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={selectedSignal ? "Ask committee or @value / @risk..." : "Select a signal first"}
            disabled={!selectedSignal || loading}
            className="flex-1 px-3 py-2 text-xs rounded-xl bg-white/[0.03] border border-border
              text-text placeholder:text-muted/50 focus:outline-none focus:border-gold/40
              disabled:opacity-40 transition"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || !selectedSignal}
            className="px-3.5 py-2 rounded-xl bg-gold/20 text-gold text-xs font-semibold
              hover:bg-gold/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
