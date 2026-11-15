import React, { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

function ConfidenceRing({ value, size = 48 }) {
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
      className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-200
        ${isSelected
          ? 'border-gold/60 shadow-[0_0_16px_rgba(245,196,81,0.15)] bg-gold/5'
          : 'border-border bg-panel hover:bg-white/[0.04] hover:border-white/15'
        }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono font-semibold text-sm">{signal.symbol}</span>
            <span className="text-xs text-muted truncate">{signal.sector}</span>
          </div>
          <div className="text-xs text-muted truncate mb-2">{signal.company_name}</div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium">₹{Number(signal.price).toLocaleString()}</span>
            {signal.market_cap_display && (
              <span className="text-[11px] font-mono text-gold/80 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                {signal.market_cap_display}
              </span>
            )}
            {sparkData.length > 2 && (
              <div className="w-16 h-6">
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
        <ConfidenceRing value={signal.ml_confidence} />
      </div>
    </div>
  );
}
