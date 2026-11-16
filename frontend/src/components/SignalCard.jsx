import React, { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

function ConfidenceRing({ value, size = 44 }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 70 ? '#34D399' : value >= 50 ? '#FBBF24' : '#F87171';

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size/2} cy={size/2} r={radius}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
      <circle cx={size/2} cy={size/2} r={radius}
        fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize="11" fontWeight="600" fontFamily="JetBrains Mono, monospace">
        {value}
      </text>
    </svg>
  );
}

export default function SignalCard({ signal, isSelected, onClick }) {
  const sparkData = useMemo(() =>
    (signal.sparkline || []).map((v, i) => ({ v })),
    [signal.sparkline]
  );

  const sparkColor = sparkData.length >= 2
    ? (sparkData[sparkData.length - 1].v >= sparkData[0].v ? '#34D399' : '#F87171')
    : '#8B93A7';

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-xl border cursor-pointer transition-all duration-200
        ${isSelected
          ? 'border-gold/50 shadow-[0_0_12px_rgba(245,196,81,0.12)] bg-gold/[0.06]'
          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]'
        }`}
    >
      {/* Row 1: Symbol + Sector + Confidence Ring */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-mono font-bold text-sm text-text">{signal.symbol}</span>
            <span className="text-[11px] text-muted/70 truncate">{signal.sector}</span>
          </div>
          <div className="text-[11px] text-muted truncate">{signal.company_name}</div>
        </div>
        <ConfidenceRing value={signal.ml_confidence} />
      </div>

      {/* Row 2: Price + Market Cap + Sparkline (separate row, no cramping) */}
      <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-white/[0.04]">
        <span className="font-mono font-semibold text-sm text-text">
          ₹{Number(signal.price).toLocaleString()}
        </span>
        {signal.market_cap_display && (
          <span className="text-[10px] font-mono text-gold/80 px-1.5 py-0.5 rounded-md bg-gold/[0.08] border border-gold/[0.15]">
            {signal.market_cap_display}
          </span>
        )}
        {sparkData.length > 2 && (
          <div className="w-14 h-5 ml-auto">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line type="monotone" dataKey="v" stroke={sparkColor}
                  strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
