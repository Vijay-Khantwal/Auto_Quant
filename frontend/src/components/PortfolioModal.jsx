import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PortfolioModal({
  isOpen,
  onClose,
  portfolio,
  onRefreshLTP,
  onSellHolding,
  refreshing = false,
}) {
  const [sellingSymbol, setSellingSymbol] = useState(null);
  const [sellQty, setSellQty] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !portfolio) return null;

  const holdings = portfolio.holdings || [];
  const unrealizedPnl = portfolio.unrealized_pnl || 0;
  const pnlPct = portfolio.unrealized_pnl_pct || 0;

  const handleOpenSell = (h) => {
    setSellingSymbol(h.symbol);
    setSellQty(h.quantity);
  };

  const handleConfirmSell = async (symbol) => {
    if (sellQty <= 0) return;
    setIsSubmitting(true);
    try {
      await onSellHolding(symbol, sellQty);
      setSellingSymbol(null);
    } catch (err) {
      console.error('Failed to sell holding:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-4xl max-h-[88vh] flex flex-col bg-panel border border-border rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💼</span>
            <div>
              <h2 className="text-lg font-bold text-text flex items-center gap-2">
                <span>Institutional Portfolio & PnL Hub</span>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/20">
                  {holdings.length} active positions
                </span>
              </h2>
              <p className="text-xs text-muted">Real-time valuation, unrealized returns, and paper trade exits</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefreshLTP}
              disabled={refreshing}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gold transition flex items-center gap-1.5 disabled:opacity-40"
              title="Fetch latest Last Traded Price quotes"
            >
              <span className={refreshing ? 'animate-spin' : ''}>↻</span>
              <span>{refreshing ? 'Updating Quotes...' : 'Refresh LTP'}</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-muted hover:text-text transition flex items-center justify-center text-sm"
              title="Close Portfolio Hub (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Top KPI Metric Cards */}
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/[0.01] border-b border-border">
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">Total Equity</div>
            <div className="text-lg font-bold font-mono text-gold">
              ₹{Number(portfolio.total_value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-muted/70 mt-0.5">Cash + Market Value</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">Available Cash</div>
            <div className="text-lg font-bold font-mono text-text">
              ₹{Number(portfolio.cash || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-muted/70 mt-0.5">Liquid reserve balance</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">Invested Capital</div>
            <div className="text-lg font-bold font-mono text-text">
              ₹{Number(portfolio.invested_capital || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-muted/70 mt-0.5">Cost basis of holdings</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">Total Unrealized PnL</div>
            <div className={`text-lg font-bold font-mono ${unrealizedPnl >= 0 ? 'text-value' : 'text-risk'}`}>
              {unrealizedPnl >= 0 ? '+' : ''}₹{Number(unrealizedPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className={`text-[10px] font-mono ${pnlPct >= 0 ? 'text-value/80' : 'text-risk/80'} mt-0.5`}>
              {pnlPct >= 0 ? '▲ +' : '▼ '}{pnlPct}% return
            </div>
          </div>
        </div>

        {/* Holdings Table */}
        <div className="flex-1 overflow-y-auto p-5">
          {holdings.length === 0 ? (
            <div className="py-16 text-center text-muted">
              <div className="text-4xl mb-3">📭</div>
              <h3 className="text-base font-semibold text-text mb-1">No Open Stock Positions</h3>
              <p className="text-xs max-w-sm mx-auto mb-4">
                You currently have no equity positions. Convene the committee in the Boardroom to debate signals and execute paper trades.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-gold/20 text-gold text-xs font-semibold hover:bg-gold/30 transition"
              >
                Go to Boardroom Table
              </button>
            </div>
          ) : (
            <div className="border border-border rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-white/[0.03] text-muted uppercase font-mono text-[10px]">
                    <th className="py-3 px-4">Ticker</th>
                    <th className="py-3 px-4">Shares</th>
                    <th className="py-3 px-4">Avg Buy</th>
                    <th className="py-3 px-4">Current LTP</th>
                    <th className="py-3 px-4">Market Value</th>
                    <th className="py-3 px-4">Unrealized PnL</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {holdings.map((h) => {
                    const isSellingThis = sellingSymbol === h.symbol;
                    const pnlPositive = h.unrealized_pnl >= 0;

                    return (
                      <tr key={h.symbol} className="hover:bg-white/[0.02] transition">
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-gold text-sm">{h.symbol}</div>
                          <div className="text-[11px] text-muted truncate max-w-[140px]">{h.company_name}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-medium">{h.quantity}</td>
                        <td className="py-3.5 px-4 font-mono text-muted">₹{Number(h.avg_price).toLocaleString()}</td>
                        <td className="py-3.5 px-4 font-mono font-medium text-text">₹{Number(h.current_price).toLocaleString()}</td>
                        <td className="py-3.5 px-4 font-mono font-medium">₹{Number(h.market_value).toLocaleString()}</td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold border ${
                            pnlPositive
                              ? 'bg-value/10 text-value border-value/20'
                              : 'bg-risk/10 text-risk border-risk/20'
                          }`}>
                            {pnlPositive ? '+' : ''}₹{Number(h.unrealized_pnl).toLocaleString()} ({pnlPositive ? '+' : ''}{h.unrealized_pnl_pct}%)
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {isSellingThis ? (
                            <div className="inline-flex items-center gap-1.5 bg-black/40 p-1.5 rounded-xl border border-border">
                              <input
                                type="number"
                                min="1"
                                max={h.quantity}
                                value={sellQty}
                                onChange={(e) => setSellQty(Math.max(1, Math.min(h.quantity, parseInt(e.target.value) || 1)))}
                                className="w-14 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-xs font-mono text-center text-text focus:outline-none"
                              />
                              <button
                                onClick={() => handleConfirmSell(h.symbol)}
                                disabled={isSubmitting}
                                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-risk text-white hover:bg-risk/90 transition disabled:opacity-40"
                              >
                                {isSubmitting ? '...' : 'Sell'}
                              </button>
                              <button
                                onClick={() => setSellingSymbol(null)}
                                className="px-1.5 py-1 text-[11px] text-muted hover:text-text"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleOpenSell(h)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-risk bg-risk/10 border border-risk/20 hover:bg-risk/20 transition"
                            >
                              Sell Position
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-white/[0.02] flex items-center justify-between text-xs text-muted">
          <div className="flex items-center gap-2">
            <span>🛡️ Paper Execution Simulation</span>
            <span>·</span>
            <span>All trades audited deterministically</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-text hover:bg-white/10 transition text-xs font-medium"
          >
            Close Dashboard
          </button>
        </div>
      </motion.div>
    </div>
  );
}
