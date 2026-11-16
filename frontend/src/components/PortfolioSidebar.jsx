import React from 'react';

export default function PortfolioSidebar({ portfolio, onOpenModal }) {
  if (!portfolio) return null;

  const unrealizedPnl = portfolio.unrealized_pnl || 0;
  const pnlPct = portfolio.unrealized_pnl_pct || 0;
  const pnlPositive = unrealizedPnl >= 0;

  return (
    <div className="flex items-center gap-5 px-5 py-2.5 text-xs bg-[#111827] border-t border-gold/[0.12] select-none shadow-[0_-2px_16px_rgba(0,0,0,0.3)]">
      <div className="flex items-center gap-2">
        <span className="text-muted/80 text-[10px] uppercase font-mono tracking-wider">Cash</span>
        <span className="font-mono font-semibold text-sm text-text">
          ₹{Number(portfolio.cash || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>

      <div className="w-px h-5 bg-white/10" />

      <div className="flex items-center gap-2">
        <span className="text-muted/80 text-[10px] uppercase font-mono tracking-wider">Equity</span>
        <span className="font-mono font-bold text-sm text-gold">
          ₹{Number(portfolio.total_value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>

      {portfolio.holdings && portfolio.holdings.length > 0 && (
        <>
          <div className="w-px h-5 bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-muted/80 text-[10px] uppercase font-mono tracking-wider">PnL</span>
            <span className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold border ${
              pnlPositive
                ? 'bg-value/15 text-value border-value/25'
                : 'bg-risk/15 text-risk border-risk/25'
            }`}>
              {pnlPositive ? '▲ +' : '▼ '}₹{Number(unrealizedPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pnlPositive ? '+' : ''}{pnlPct}%)
            </span>
          </div>
        </>
      )}

      {/* Holdings quick preview */}
      {portfolio.holdings && portfolio.holdings.length > 0 && (
        <div className="hidden md:flex items-center gap-1.5 ml-1">
          <div className="w-px h-5 bg-white/10" />
          {portfolio.holdings.slice(0, 4).map((h, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-[10px] font-mono rounded-md bg-white/[0.04] border border-white/[0.08] text-muted"
            >
              {h.symbol} ×{h.quantity}
            </span>
          ))}
          {portfolio.holdings.length > 4 && (
            <span className="text-[10px] text-muted">+{portfolio.holdings.length - 4}</span>
          )}
        </div>
      )}

      {/* Action to open full modal */}
      {onOpenModal && (
        <button
          onClick={onOpenModal}
          className="ml-auto px-3.5 py-1.5 rounded-xl bg-gold/[0.12] hover:bg-gold/[0.22] text-gold border border-gold/25 font-semibold text-xs transition flex items-center gap-1.5 shadow-sm cursor-pointer"
        >
          <span>💼</span>
          <span>Portfolio & PnL Hub</span>
        </button>
      )}

      <div className="hidden lg:block text-[10px] text-muted/60 italic ml-2">
        Paper trading simulation
      </div>
    </div>
  );
}
