import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { marked } from 'marked';
import { postChat, fetchChatHistory, clearChatHistory } from '../api';

// Configure marked options for clean, safe inline & block rendering
marked.setOptions({
  gfm: true,
  breaks: true,
});

function FormattedMessage({ text }) {
  const html = useMemo(() => {
    if (!text) return '';
    let cleanText = text;
    // Strip redundant raw agent label prefixes if present (with or without brackets, emojis, bolding)
    cleanText = cleanText.replace(/^(\*{1,2})?([📈🛡️◈]\s*)?\[?(Value Agent|Risk Agent|Research Committee)\]?(\*{1,2})?:?\s*/i, '');
    return marked.parse(cleanText);
  }, [text]);

  return (
    <div
      className="chat-markdown text-xs leading-relaxed text-text/90
        [&>p]:mb-1.5 [&>p:last-child]:mb-0
        [&>ul]:my-1.5 [&>ul]:pl-4 [&>ul]:list-disc [&>ul>li]:mb-0.5
        [&>ol]:my-1.5 [&>ol]:pl-4 [&>ol]:list-decimal [&>ol>li]:mb-0.5
        [&>blockquote]:border-l-2 [&>blockquote]:border-gold/40 [&>blockquote]:pl-2.5 [&>blockquote]:italic [&>blockquote]:text-muted [&>blockquote]:my-1.5
        [&_strong]:font-semibold [&_strong]:text-gold/90
        [&_em]:italic [&_em]:text-text/80
        [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-white/10 [&_code]:font-mono [&_code]:text-[11px]
        [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-gold [&_h1]:mb-1
        [&_h2]:text-xs [&_h2]:font-bold [&_h2]:text-gold [&_h2]:mb-1
        [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-text [&_h3]:mb-0.5
        [&_a]:text-gold [&_a]:underline"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

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
  const scrollRef = useRef(null);

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

  // Auto-scroll chat to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

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
        text: 'Communication with the research committee timed out. Please try again.',
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
    <div className="flex flex-col h-full bg-[#0D1225]/80">
      {/* Header */}
      <div className="p-3.5 border-b border-gold/[0.1] flex items-center justify-between bg-[#0F1526]">
        <div className="flex items-center gap-2">
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 rounded-lg text-muted hover:text-gold hover:bg-white/10 transition text-xs cursor-pointer"
              title="Collapse Research Chat (])"
            >
              ▶
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <div className="w-1 h-3.5 rounded-full bg-gold/60" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5">
                <span>Research & Committee Chat</span>
              </h3>
            </div>
            <p className="text-[11px] text-muted mt-0.5 ml-3">
              {selectedSignal
                ? `Context: ${selectedSignal.symbol} (${selectedSignal.market_cap_display || ''})`
                : 'Select a stock to interrogate analysts'}
            </p>
          </div>
        </div>
        {selectedSignal && messages.length > 0 && (
          <button
            onClick={handleClear}
            className="text-[10px] text-muted hover:text-risk px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:border-risk/30 transition cursor-pointer"
            title="Clear saved chat history for this stock"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth">
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
          const isValueAgent = !isUser && /\[?Value Agent\]?/i.test(msg.text || '');
          const isRiskAgent = !isUser && /\[?Risk Agent\]?/i.test(msg.text || '');

          const bubbleClasses = isUser
            ? 'bg-gold/15 border border-gold/30 text-text rounded-2xl rounded-tr-xs ml-4'
            : isValueAgent
              ? 'bg-[#0d221c]/90 border border-emerald-500/30 text-text rounded-2xl rounded-tl-xs shadow-[0_4px_20px_rgba(16,185,129,0.06)] mr-4'
              : isRiskAgent
                ? 'bg-[#240e16]/90 border border-rose-500/30 text-text rounded-2xl rounded-tl-xs shadow-[0_4px_20px_rgba(244,63,94,0.06)] mr-4'
                : 'bg-white/[0.04] border border-white/10 text-text/90 rounded-2xl rounded-tl-xs mr-4';

          return (
            <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[92%] p-3.5 text-xs leading-relaxed ${bubbleClasses}`}>
                {/* Agent Header Tag */}
                {!isUser && (
                  <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-white/5">
                    {isValueAgent ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                        <span>📈</span>
                        <span>Value Agent</span>
                      </span>
                    ) : isRiskAgent ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 border border-rose-500/30 text-rose-400">
                        <span>🛡️</span>
                        <span>Risk Agent</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gold/15 border border-gold/30 text-gold">
                        <span>◈</span>
                        <span>Research Committee</span>
                      </span>
                    )}
                  </div>
                )}

                {msg.tool && (
                  <div className="mb-2">
                    <ToolChip tool={msg.tool} args={msg.args} />
                  </div>
                )}

                <FormattedMessage text={msg.text} />
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
              disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
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
              hover:bg-gold/30 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
