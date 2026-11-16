import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import SignalFeed from './components/SignalFeed';
import BoardroomTable from './components/BoardroomTable';
import ResearchChat from './components/ResearchChat';
import PortfolioSidebar from './components/PortfolioSidebar';
import PortfolioModal from './components/PortfolioModal';
import Onboarding from './components/Onboarding';
import {
  fetchSignals,
  fetchDebate,
  getDebateStreamUrl,
  postJevCheck,
  postTrade,
  postSellHolding,
  fetchPortfolio,
  searchOrCreateSignal
} from './api';

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

function Toast({ message, type = 'info', onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const colors = {
    success: 'border-value bg-value/10 text-value',
    error: 'border-risk bg-risk/10 text-risk',
    info: 'border-gold bg-gold/10 text-gold',
  };

  return (
    <div className={`px-4 py-3 rounded-xl border ${colors[type] || colors.info} backdrop-blur-md text-sm font-medium shadow-lg transition-all duration-300`}>
      {message}
    </div>
  );
}

export default function App({ bootstrapData = {} }) {
  const [signals, setSignals] = useState(bootstrapData.signals || []);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [debate, setDebate] = useState(null);
  const [jevResult, setJevResult] = useState(null);
  const [portfolio, setPortfolio] = useState(bootstrapData.portfolio || null);
  const [quantity, setQuantity] = useState(10);
  const [loadingSignals, setLoadingSignals] = useState(!bootstrapData.signals);
  const [isStreamingDebate, setIsStreamingDebate] = useState(false);
  const [debateFinished, setDebateFinished] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [showOnboarding, setShowOnboarding] = useState(!getCookie('aq_onboarded'));
  const [lessonCard, setLessonCard] = useState(null);
  const [leftCollapsed, setLeftCollapsed] = useState(() => localStorage.getItem('aq_left_collapsed') === 'true');
  const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem('aq_right_collapsed') === 'true');
  const [showPortfolioModal, setShowPortfolioModal] = useState(false);
  const [refreshingLTP, setRefreshingLTP] = useState(false);
  const [chatPrompt, setChatPrompt] = useState('');
  const eventSourceRef = useRef(null);
  const debateCacheRef = useRef({});

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleRefreshLTP = useCallback(async () => {
    setRefreshingLTP(true);
    try {
      const data = await fetchPortfolio(true);
      setPortfolio(data);
      addToast('Holdings LTP updated with live quotes', 'success');
    } catch (err) {
      console.error('Failed to refresh quotes:', err);
      addToast('Failed to refresh quotes', 'error');
    } finally {
      setRefreshingLTP(false);
    }
  }, [addToast]);

  const handleSellHolding = useCallback(async (symbol, quantity) => {
    try {
      const res = await postSellHolding(symbol, quantity);
      addToast(`Sold ${quantity} × ${symbol} for ₹${Number(res.proceeds).toLocaleString()}`, 'success');
      const updated = await fetchPortfolio(false);
      setPortfolio(updated);
    } catch (err) {
      console.error('Sell failed:', err);
      addToast('Sell failed: ' + err.message, 'error');
      throw err;
    }
  }, [addToast]);

  // Save sidebar preferences
  useEffect(() => {
    localStorage.setItem('aq_left_collapsed', String(leftCollapsed));
  }, [leftCollapsed]);

  useEffect(() => {
    localStorage.setItem('aq_right_collapsed', String(rightCollapsed));
  }, [rightCollapsed]);

  // Keyboard shortcuts: [ to toggle signals, ] to toggle chat, f for focus mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.key === '[') {
        setLeftCollapsed(prev => !prev);
      } else if (e.key === ']') {
        setRightCollapsed(prev => !prev);
      } else if (e.key.toLowerCase() === 'f') {
        setLeftCollapsed(prevL => {
          const bothCollapsed = prevL && rightCollapsed;
          const target = !bothCollapsed;
          setRightCollapsed(target);
          return target;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rightCollapsed]);

  const handleToggleLeft = useCallback(() => setLeftCollapsed(p => !p), []);
  const handleToggleRight = useCallback(() => setRightCollapsed(p => !p), []);
  const handleToggleFocus = useCallback(() => {
    const bothCollapsed = leftCollapsed && rightCollapsed;
    setLeftCollapsed(!bothCollapsed);
    setRightCollapsed(!bothCollapsed);
  }, [leftCollapsed, rightCollapsed]);

  const handleAskAgent = useCallback((agent, contextText) => {
    setRightCollapsed(false); // auto-expand chat
    setChatPrompt(`@${agent} Regarding: "${contextText.slice(0, 75).trim()}..." `);
  }, []);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Load signals on mount
  useEffect(() => {
    if (!bootstrapData.signals) {
      fetchSignals()
        .then(data => {
          setSignals(data.signals || data || []);
          setLoadingSignals(false);
        })
        .catch(err => {
          console.error('Failed to load signals:', err);
          setLoadingSignals(false);
          addToast('Failed to load signals', 'error');
        });
    }
  }, [bootstrapData.signals, addToast]);

  // Load portfolio on mount
  useEffect(() => {
    if (!bootstrapData.portfolio) {
      fetchPortfolio()
        .then(data => setPortfolio(data))
        .catch(err => console.error('Failed to load portfolio:', err));
    }
  }, [bootstrapData.portfolio]);

  // Connect real-time debate stream (handles both instant cached debates and live streaming)
  const connectDebateStream = useCallback((signal, isRegen = false) => {
    if (!signal) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setDebate(null);
    setJevResult(null);
    setDebateFinished(false);
    setLessonCard(null);
    setIsStreamingDebate(!isRegen ? false : true);
    setQuantity(10);

    // Initial table placeholder so header and seats display immediately without skeleton buffering
    setDebate({
      debate: {
        id: null,
        skill_name: 'Institutional Committee',
        turns: [],
        value_tags: ['Analytical', 'Growth Catalysts'],
        risk_tags: ['Prudent', 'Downside Scrutiny'],
      },
    });

    const streamUrl = getDebateStreamUrl(signal.id, isRegen);
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    // Fired immediately if debate already exists in DB
    es.addEventListener('complete', (e) => {
      try {
        const data = JSON.parse(e.data);
        const debateObj = { debate: data };
        setDebate(debateObj);
        setJevResult(data.jev_result);
        setDebateFinished(true);
        setIsStreamingDebate(false);
        if (data.lesson) setLessonCard(data.lesson);

        // Save in local debate cache for instant zero-latency return
        if (signal?.id) {
          debateCacheRef.current[signal.id] = {
            debate: debateObj,
            jevResult: data.jev_result,
            lesson: data.lesson,
          };
        }
      } catch (err) {
        console.error('Error parsing complete event:', err);
      }
      es.close();
    });

    // Fired when generating fresh debate
    es.addEventListener('init', (e) => {
      setIsStreamingDebate(true);
      try {
        const data = JSON.parse(e.data);
        setDebate(prev => ({
          debate: {
            id: null,
            skill_name: data.skill_name || 'Institutional Committee',
            turns: [],
            value_tags: ['Analytical', 'Growth Catalysts'],
            risk_tags: ['Prudent', 'Downside Scrutiny'],
          },
        }));
      } catch (err) {
        console.error('Error parsing init event:', err);
      }
    });

    // Fired turn by turn in real-time as each chat is generated
    es.addEventListener('turn', (e) => {
      setIsStreamingDebate(true);
      try {
        const data = JSON.parse(e.data);
        setDebate(prev => {
          const prevTurns = prev?.debate?.turns || [];
          return {
            ...prev,
            debate: {
              ...prev?.debate,
              turns: [...prevTurns, data.turn],
              runningConviction: data.conviction,
            },
          };
        });
      } catch (err) {
        console.error('Error parsing turn event:', err);
      }
    });

    // Fired when Jev deterministic compliance is evaluated
    es.addEventListener('jev', (e) => {
      try {
        const data = JSON.parse(e.data);
        setDebate(prev => {
          const prevTurns = prev?.debate?.turns || [];
          return {
            ...prev,
            debate: {
              ...prev?.debate,
              turns: [...prevTurns, data.turn],
              runningConviction: data.conviction,
            },
          };
        });
        setJevResult(data.report);
      } catch (err) {
        console.error('Error parsing jev event:', err);
      }
    });

    // Fired when debate generation completes
    es.addEventListener('done', (e) => {
      try {
        const data = JSON.parse(e.data);
        setDebate(prev => {
          const updated = {
            ...prev,
            debate: {
              ...prev?.debate,
              id: data.debate_id,
              summary: data.summary,
              lesson: data.lesson,
            },
          };
          if (signal?.id) {
            debateCacheRef.current[signal.id] = {
              debate: updated,
              jevResult: jevResult,
              lesson: data.lesson,
            };
          }
          return updated;
        });
        setDebateFinished(true);
        setIsStreamingDebate(false);
        if (data.lesson) setLessonCard(data.lesson);
      } catch (err) {
        console.error('Error parsing done event:', err);
      }
      es.close();
    });

    es.addEventListener('error', (e) => {
      setIsStreamingDebate(false);
      es.close();
    });
  }, [jevResult]);

  // Select signal and load debate (instant if cached, otherwise connect stream)
  const handleSelectSignal = useCallback((signal) => {
    if (!signal) return;
    setSelectedSignal(signal);

    // Instant zero-latency restore if debate is already cached
    const cached = debateCacheRef.current[signal.id];
    if (cached && cached.debate?.debate?.turns?.length > 0) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setDebate(cached.debate);
      setJevResult(cached.jevResult);
      setDebateFinished(true);
      setIsStreamingDebate(false);
      setQuantity(10);
      if (cached.lesson) setLessonCard(cached.lesson);
      return;
    }

    connectDebateStream(signal, false);
  }, [connectDebateStream]);

  const handleRegenerateDebate = useCallback(() => {
    if (!selectedSignal) return;
    delete debateCacheRef.current[selectedSignal.id];
    addToast(`Re-debating ${selectedSignal.symbol} in real time...`, 'info');
    connectDebateStream(selectedSignal, true);
  }, [selectedSignal, connectDebateStream, addToast]);

  // Jev check when quantity changes or debate finishes
  const handleJevCheck = useCallback(async (signalId, qty) => {
    try {
      const result = await postJevCheck(signalId, qty);
      setJevResult(result);
    } catch (err) {
      console.error('Jev check failed:', err);
    }
  }, []);

  const handleDebateFinished = useCallback(() => {
    setDebateFinished(true);
    if (selectedSignal) {
      handleJevCheck(selectedSignal.id, quantity);
    }
  }, [selectedSignal, quantity, handleJevCheck]);

  const handleQuantityChange = useCallback((qty) => {
    setQuantity(qty);
    if (selectedSignal && debateFinished) {
      handleJevCheck(selectedSignal.id, qty);
    }
  }, [selectedSignal, debateFinished, handleJevCheck]);

  // Execute trade
  const handleExecute = useCallback(async () => {
    if (!selectedSignal || !debate) return;
    try {
      const result = await postTrade(selectedSignal.id, debate.debate?.id || debate.id, 'execute', quantity);
      addToast(`Bought ${quantity} × ${selectedSignal.symbol} (paper)`, 'success');
      setLessonCard(debate.debate?.lesson || null);
      // Refresh portfolio
      fetchPortfolio().then(data => setPortfolio(data)).catch(() => {});
    } catch (err) {
      console.error('Trade failed:', err);
      addToast('Trade failed: ' + err.message, 'error');
    }
  }, [selectedSignal, debate, quantity, addToast]);

  // Pass on signal
  const handlePass = useCallback(async () => {
    if (!selectedSignal || !debate) return;
    try {
      const result = await postTrade(selectedSignal.id, debate.debate?.id || debate.id, 'pass', 0);
      addToast('Passed — moving on', 'info');
      setLessonCard(debate.debate?.lesson || null);

      // Auto-select next signal
      const currentIdx = signals.findIndex(s => s.id === selectedSignal.id);
      if (currentIdx < signals.length - 1) {
        handleSelectSignal(signals[currentIdx + 1]);
      }
    } catch (err) {
      console.error('Pass failed:', err);
      addToast('Action failed: ' + err.message, 'error');
    }
  }, [selectedSignal, debate, signals, handleSelectSignal, addToast]);

  const handleAddCustomStock = useCallback(async (query) => {
    try {
      const res = await searchOrCreateSignal(query);
      const newSig = res.signal;
      setSignals(prev => {
        if (prev.some(s => s.id === newSig.id)) {
          return prev;
        }
        return [newSig, ...prev];
      });
      handleSelectSignal(newSig);
      addToast(
        res.created
          ? `Analyzed & loaded ${newSig.symbol} into Boardroom`
          : `Selected ${newSig.symbol}`,
        'success'
      );
    } catch (err) {
      console.error('Failed to add custom stock:', err);
      addToast('Could not analyze stock: ' + err.message, 'error');
    }
  }, [handleSelectSignal, addToast]);

  const handleDismissOnboarding = useCallback(() => {
    document.cookie = 'aq_onboarded=1; path=/; max-age=31536000';
    setShowOnboarding(false);
  }, []);

  return (
    <div className="h-[calc(100vh-65px)] flex flex-col overflow-hidden bg-bg">
      {/* Main 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Signal Feed (Collapsible) */}
        {leftCollapsed ? (
          <div
            onClick={() => setLeftCollapsed(false)}
            className="w-11 flex-shrink-0 border-r border-border bg-[#0F1526] hover:bg-panel cursor-pointer flex flex-col items-center py-4 transition-all duration-200 group select-none"
            title="Expand Stock Signals Feed ([)"
          >
            <button
              type="button"
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-muted group-hover:text-gold group-hover:border-gold/40 transition mb-6"
            >
              ▶
            </button>
            <div
              className="text-xs font-semibold uppercase tracking-wider text-muted group-hover:text-gold transition flex items-center gap-2"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              <span>Signals Feed</span>
              <span className="font-mono text-[10px] text-gold px-1.5 py-0.5 rounded bg-gold/10 border border-gold/20">
                {signals.length}
              </span>
            </div>
          </div>
        ) : (
          <div className="w-80 flex-shrink-0 border-r border-border overflow-y-auto transition-all duration-200 bg-[#0D1225]/90">
            <SignalFeed
              signals={signals}
              loading={loadingSignals}
              selectedSignal={selectedSignal}
              onSelectSignal={handleSelectSignal}
              onAddCustomStock={handleAddCustomStock}
              onCollapse={() => setLeftCollapsed(true)}
            />
          </div>
        )}

        {/* Center: Boardroom Table */}
        <div className="flex-1 overflow-y-auto">
          <BoardroomTable
            signal={selectedSignal}
            debate={debate}
            jevResult={jevResult}
            isStreaming={isStreamingDebate}
            debateFinished={debateFinished}
            quantity={quantity}
            onQuantityChange={handleQuantityChange}
            onDebateFinished={handleDebateFinished}
            onExecute={handleExecute}
            onPass={handlePass}
            onRegenerateDebate={handleRegenerateDebate}
            lessonCard={lessonCard}
            leftCollapsed={leftCollapsed}
            rightCollapsed={rightCollapsed}
            onToggleLeft={handleToggleLeft}
            onToggleRight={handleToggleRight}
            onToggleFocus={handleToggleFocus}
            onAskAgent={handleAskAgent}
          />
        </div>

        {/* Right: Research Chat (Collapsible) */}
        {rightCollapsed ? (
          <div
            onClick={() => setRightCollapsed(false)}
            className="w-11 flex-shrink-0 border-l border-border bg-[#0F1526] hover:bg-panel cursor-pointer flex flex-col items-center py-4 transition-all duration-200 group select-none"
            title="Expand Research Chat (])"
          >
            <button
              type="button"
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-muted group-hover:text-gold group-hover:border-gold/40 transition mb-6"
            >
              ◀
            </button>
            <div
              className="text-xs font-semibold uppercase tracking-wider text-muted group-hover:text-gold transition flex items-center gap-2"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              <span>Research Chat</span>
              {selectedSignal && (
                <span className="font-mono text-[10px] text-gold px-1.5 py-0.5 rounded bg-gold/10 border border-gold/20">
                  {selectedSignal.symbol}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="w-96 flex-shrink-0 border-l border-border overflow-hidden transition-all duration-200 bg-[#0D1225]/90">
            <ResearchChat
              selectedSignal={selectedSignal}
              externalPrompt={chatPrompt}
              onCollapse={() => setRightCollapsed(true)}
            />
          </div>
        )}
      </div>

      {/* Bottom: Portfolio Sidebar */}
      <div>
        <PortfolioSidebar
          portfolio={portfolio}
          onOpenModal={() => setShowPortfolioModal(true)}
        />
      </div>

      {/* Portfolio Hub Modal */}
      <AnimatePresence>
        {showPortfolioModal && (
          <PortfolioModal
            isOpen={showPortfolioModal}
            onClose={() => setShowPortfolioModal(false)}
            portfolio={portfolio}
            onRefreshLTP={handleRefreshLTP}
            onSellHolding={handleSellHolding}
            refreshing={refreshingLTP}
          />
        )}
      </AnimatePresence>

      {/* Onboarding */}
      <AnimatePresence>
        {showOnboarding && (
          <Onboarding onDismiss={handleDismissOnboarding} />
        )}
      </AnimatePresence>

      {/* Toast container */}
      <div className="toast-container">
        <AnimatePresence>
          {toasts.map(t => (
            <Toast
              key={t.id}
              message={t.message}
              type={t.type}
              onDismiss={() => removeToast(t.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
