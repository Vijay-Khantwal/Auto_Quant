import React from 'react';

export default function PortfolioSidebar({ portfolio }) {
  if (!portfolio) return null;

  return (
    <div className="flex items-center gap-6 px-6 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted text-xs uppercase tracking-wider">Cash</span>
        <span className="font-mono font-medium text-value">
          ₹{Number(portfolio.cash).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-muted text-xs uppercase tracking-wider">Portfolio</span>
        <span className="font-mono font-medium text-gold">
          ₹{Number(portfolio.total_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>

      {/* Holdings chips */}
      {portfolio.holdings && portfolio.holdings.length > 0 && (
        <div className="flex items-center gap-2 ml-2">
          <span className="text-muted text-xs">|</span>
          {portfolio.holdings.map((h, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-[11px] font-mono rounded-md bg-white/5 border border-white/10 text-muted"
            >
              {h.symbol} ×{h.quantity}
            </span>
          ))}
        </div>
      )}

      <div className="ml-auto text-[11px] text-muted italic">
        Educational simulation. Not financial advice.
      </div>
    </div>
  );
}
