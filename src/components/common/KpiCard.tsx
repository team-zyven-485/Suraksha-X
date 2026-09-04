import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  id?: string;
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  statusColor?: 'red' | 'orange' | 'amber' | 'emerald' | 'blue' | 'slate';
  onClick?: () => void;
  isActive?: boolean;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  id,
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  statusColor = 'slate',
  onClick,
  isActive = false,
}) => {
  const borderColors = {
    red: 'border-critical/20 hover:border-critical/40 bg-critical-soft/50',
    orange: 'border-warn/20 hover:border-warn/40 bg-warn-soft/50',
    amber: 'border-warn/20 hover:border-warn/40 bg-warn-soft/50',
    emerald: 'border-safe/20 hover:border-safe/40 bg-safe-soft/50',
    blue: 'border-brand/20 hover:border-brand/40 bg-brand-soft/50',
    slate: 'border-hairline hover:border-ink-faint/40 bg-surface',
  };

  const iconColors = {
    red: 'text-critical bg-critical-soft border-critical/20',
    orange: 'text-warn bg-warn-soft border-warn/20',
    amber: 'text-warn bg-warn-soft border-warn/20',
    emerald: 'text-safe bg-safe-soft border-safe/20',
    blue: 'text-brand bg-brand-soft border-brand/20',
    slate: 'text-ink-soft bg-paper-alt border-hairline',
  };

  return (
    <div
      id={id}
      onClick={onClick}
      className={`relative p-3.5 sm:p-4 rounded-xl border shadow-sm transition-all duration-200 ${borderColors[statusColor]} ${
        isActive ? 'ring-1 ring-brand border-brand' : ''
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[11px] font-mono tracking-wider text-ink-faint uppercase">
            {title}
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-ink">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
          </div>
        </div>
        <div className={`p-2.5 rounded-lg border shrink-0 ${iconColors[statusColor]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {(subtitle || trend) && (
        <div className="mt-2.5 pt-2 border-t border-hairline flex items-center justify-between text-xs">
          {subtitle && <span className="text-ink-soft truncate">{subtitle}</span>}
          {trend && (
            <span
              className={`font-mono text-[11px] font-medium ml-auto ${
                trend.isPositive ? 'text-safe' : 'text-critical'
              }`}
            >
              {trend.value} {trend.label && <span className="text-ink-faint">{trend.label}</span>}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
