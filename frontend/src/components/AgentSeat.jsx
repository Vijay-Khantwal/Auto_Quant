import React from 'react';
import { TrendingUp, ShieldAlert, Lock } from 'lucide-react';

const agentConfig = {
  value: {
    icon: TrendingUp,
    color: 'value',
    borderColor: 'border-value/30',
    bgColor: 'bg-value/10',
    ringColor: 'shadow-[0_0_12px_rgba(52,211,153,0.4)]',
  },
  risk: {
    icon: ShieldAlert,
    color: 'risk',
    borderColor: 'border-risk/30',
    bgColor: 'bg-risk/10',
    ringColor: 'shadow-[0_0_12px_rgba(248,113,113,0.4)]',
  },
  jev: {
    icon: Lock,
    color: 'jev',
    borderColor: 'border-jev/30',
    bgColor: 'bg-jev/10',
    ringColor: 'shadow-[0_0_12px_rgba(96,165,250,0.4)]',
  },
};

export default function AgentSeat({ agent, name, tags = [], isSpeaking = false }) {
  const config = agentConfig[agent] || agentConfig.value;
  const Icon = config.icon;
  const isJev = agent === 'jev';

  return (
    <div className={`flex flex-col items-center gap-2 transition-all duration-300
      ${isSpeaking ? 'scale-105 opacity-100' : 'opacity-70'}`}>
      {/* Avatar */}
      <div className={`relative flex items-center justify-center
        ${isJev ? 'w-14 h-14 rounded-xl' : 'w-16 h-16 rounded-full'}
        ${config.bgColor} border ${config.borderColor}
        ${isSpeaking ? config.ringColor : ''}
        transition-shadow duration-300`}>
        <Icon className={`w-6 h-6 text-${config.color}`} />
        {isSpeaking && !isJev && (
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-${config.color} animate-pulse`} />
        )}
      </div>

      {/* Name */}
      <span className={`text-sm font-semibold text-${config.color}`}>{name}</span>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex gap-1.5">
          {tags.map((tag, i) => (
            <span key={i}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-full
                ${config.bgColor} text-${config.color}/80`}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {isJev && (
        <span className="text-[10px] text-muted italic">Not an AI</span>
      )}
    </div>
  );
}
