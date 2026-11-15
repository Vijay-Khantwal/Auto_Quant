import React from 'react';

export default function PortfolioSidebar({ portfolio, onOpenModal }) {
  if (!portfolio) return null;

  const unrealizedPnl = portfolio.unrealized_pnl || 0;
  const pnlPct = portfolio.unrealized_pnl_pct || 0;
  const pnlPositive = unrealizedPnl >= 0;

  return (
    <div className="flex items-center gap-6 px-6 py-2.5 text-xs bg-panel/80 backdrop-blur-sm select-none">
      <div className="flex items-center gap-2">
        <span className="text-muted text-[10px] uppercase font-mono tracking-wider">Cash</span>
        <span className="font-mono font-semibold text-text">
          ₹{Number(portfolio.cash || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-muted text-[10px] uppercase font-mono tracking-wider">Equity</span>
        <span className="font-mono font-bold text-gold">
          ₹{Number(portfolio.total_value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>

      {portfolio.holdings && portfolio.holdings.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-muted text-[10px] uppercase font-mono tracking-wider">PnL</span>
          <span className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold border ${
            pnlPositive
              ? 'bg-value/15 text-value border-value/30'
              : 'bg-risk/15 text-risk border-risk/30'
          }`}>
            {pnlPositive ? '▲ +' : '▼ '}₹{Number(unrealizedPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pnlPositive ? '+' : ''}{pnlPct}%)
          </span>
        </div>
      )}

      {/* Holdings quick preview */}
      {portfolio.holdings && portfolio.holdings.length > 0 && (
        <div className="hidden md:flex items-center gap-1.5 ml-2">
          <span className="text-border">|</span>
          {portfolio.holdings.slice(0, 4).map((h, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-[10px] font-mono rounded-md bg-white/5 border border-white/10 text-muted"
            >
              {h.symbol} ×{h.quantity}
            </span>
          ))}
          {portfolio.holdings.length > 4 && (
            <span className="text-[10px] text-muted">+{portfolio.holdings.length - 4} more</span>
          )}
        </div>
      )}

      {/* Action to open full modal */}
      {onOpenModal && (
        <button
          onClick={onOpenModal}
          className="ml-auto px-3 py-1 rounded-xl bg-gold/15 hover:bg-gold/25 text-gold border border-gold/30 font-semibold text-xs transition flex items-center gap-1.5 shadow-sm"
        >
          <span>💼</span>
          <span>Portfolio & PnL Hub →</span>
        </button>
      )}

      <div className="hidden lg:block text-[11px] text-muted italic ml-3">
        Paper trading simulation
      </div>
    </div>
  );
}
