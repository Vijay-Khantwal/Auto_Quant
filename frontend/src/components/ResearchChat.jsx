import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { postChat } from '../api';

function ToolChip({ tool, args }) {
  if (!tool) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded-md bg-jev/10 text-jev border border-jev/20">
      🔧 {tool}({args?.symbol || ''})
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-1 py-2 px-3">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted"
          animate={{ y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export default function ResearchChat({ selectedSignal }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const quickPrompts = [
    { label: '📄 Latest filing', query: 'Pull the latest SEC filing' },
    { label: '📰 News', query: 'What is the latest news?' },
    { label: '📈 Price', query: 'Show me the price performance' },
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
        text: 'Sorry, something went wrong. Please try again.',
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  }, [selectedSignal]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text">Research Assistant</h3>
        <p className="text-[11px] text-muted">
          {selectedSignal
            ? `Researching ${selectedSignal.symbol}`
            : 'Select a signal to start'}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-muted text-sm">Ask me about filings, news, or price data.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] p-3 rounded-2xl text-sm
              ${msg.role === 'user'
                ? 'bg-gold/10 border border-gold/20 text-text'
                : msg.error
                  ? 'bg-risk/5 border border-risk/20 text-risk'
                  : 'bg-panel border border-border text-text/90'
              }`}>
              {msg.tool && (
                <div className="mb-2">
                  <ToolChip tool={msg.tool} args={msg.args} />
                </div>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
            </div>
          </div>
        ))}
        {loading && <TypingIndicator />}
      </div>

      {/* Quick prompts */}
      <div className="px-4 py-2 flex gap-2 flex-wrap">
        {quickPrompts.map((p, i) => (
          <button
            key={i}
            onClick={() => sendMessage(p.query)}
            disabled={loading || !selectedSignal}
            className="px-2.5 py-1 text-[11px] rounded-lg bg-panel border border-border
              text-muted hover:text-text hover:bg-white/5 transition-all duration-200
              disabled:opacity-30 disabled:cursor-not-allowed"
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
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={selectedSignal ? "Ask about this stock..." : "Select a signal first"}
            disabled={!selectedSignal || loading}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-white/[0.03] border border-border
              text-text placeholder:text-muted/50 focus:outline-none focus:border-gold/40
              disabled:opacity-40 transition"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || !selectedSignal}
            className="px-3 py-2 rounded-lg bg-gold/15 text-gold text-sm font-medium
              hover:bg-gold/25 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            →
          </button>
        </form>
      </div>
    </div>
  );
}
