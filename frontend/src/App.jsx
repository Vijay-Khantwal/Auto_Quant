import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import SignalFeed from './components/SignalFeed';
import BoardroomTable from './components/BoardroomTable';
import ResearchChat from './components/ResearchChat';
import PortfolioSidebar from './components/PortfolioSidebar';
import Onboarding from './components/Onboarding';
import {
  fetchSignals,
  fetchDebate,
  getDebateStreamUrl,
  postJevCheck,
  postTrade,
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
  const eventSourceRef = useRef(null);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
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
        setDebate({ debate: data });
        setJevResult(data.jev_result);
        setDebateFinished(true);
        setIsStreamingDebate(false);
        if (data.lesson) setLessonCard(data.lesson);
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
        setDebate(prev => ({
          ...prev,
          debate: {
            ...prev?.debate,
            id: data.debate_id,
            summary: data.summary,
            lesson: data.lesson,
          },
        }));
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
  }, []);

  // Select signal and load debate
  const handleSelectSignal = useCallback((signal) => {
    setSelectedSignal(signal);
    connectDebateStream(signal, false);
  }, [connectDebateStream]);

  const handleRegenerateDebate = useCallback(() => {
    if (!selectedSignal) return;
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
        {/* Left: Signal Feed */}
        <div className="w-80 flex-shrink-0 border-r border-border overflow-y-auto">
          <SignalFeed
            signals={signals}
            loading={loadingSignals}
            selectedSignal={selectedSignal}
            onSelectSignal={handleSelectSignal}
            onAddCustomStock={handleAddCustomStock}
          />
        </div>

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
          />
        </div>

        {/* Right: Research Chat */}
        <div className="w-96 flex-shrink-0 border-l border-border overflow-hidden">
          <ResearchChat selectedSignal={selectedSignal} />
        </div>
      </div>

      {/* Bottom: Portfolio Sidebar */}
      <div className="border-t border-border">
        <PortfolioSidebar portfolio={portfolio} />
      </div>

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
