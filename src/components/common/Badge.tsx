import React from 'react';

interface BadgeProps {
  variant: 'critical' | 'high' | 'moderate' | 'safe' | 'info' | 'neutral' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant,
  size = 'md',
  children,
  dot = false,
  className = '',
}) => {
  const variantStyles = {
    critical: 'bg-critical-soft text-critical border border-critical/25',
    high: 'bg-warn-soft text-warn border border-warn/25',
    moderate: 'bg-warn-soft text-warn border border-warn/20',
    safe: 'bg-safe-soft text-safe border border-safe/25',
    info: 'bg-brand-soft text-brand border border-brand/25',
    neutral: 'bg-paper-alt text-ink-soft border border-hairline',
    outline: 'bg-transparent text-ink-soft border border-hairline',
  };

  const dotColors = {
    critical: 'bg-critical animate-pulse',
    high: 'bg-warn',
    moderate: 'bg-warn',
    safe: 'bg-safe',
    info: 'bg-brand',
    neutral: 'bg-ink-faint',
    outline: 'bg-ink-faint',
  };

  const sizeStyles = {
    sm: 'text-[10px] px-1.5 py-0.5 font-medium tracking-wide',
    md: 'text-xs px-2 py-0.5 font-medium tracking-wide',
    lg: 'text-sm px-2.5 py-1 font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded uppercase font-mono whitespace-nowrap ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
};
