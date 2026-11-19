import React from 'react';

interface AppLogoProps {
  variant?: 'icon' | 'horizontal';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  /** Show the "SURAKSHA-X" wordmark next to the icon (horizontal variant). */
  showText?: boolean;
}

const SIZES = { xs: 22, sm: 32, md: 42, lg: 56, xl: 80 } as const;

/** SURAKSHA-X mark: a shield (safety) around a map pin (location / relocation). */
export const AppLogo: React.FC<AppLogoProps> = ({ variant = 'horizontal', size = 'md', className = '', showText = true }) => {
  const px = typeof size === 'number' ? size : SIZES[size];

  const icon = (
    <svg width={px} height={px} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id="app-logo-grad" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0062FF" />
          <stop offset="1" stopColor="#00B96B" />
        </linearGradient>
      </defs>
      <path d="M32 4 L54 12 V30 C54 44 44 54 32 60 C20 54 10 44 10 30 V12 Z" fill="url(#app-logo-grad)" />
      <path
        d="M32 17 C25.4 17 20.5 22 20.5 28.4 C20.5 36.5 32 46 32 46 C32 46 43.5 36.5 43.5 28.4 C43.5 22 38.6 17 32 17 Z"
        fill="#FFFFFF"
      />
      <circle cx="32" cy="28" r="4.6" fill="#0062FF" />
    </svg>
  );

  if (variant === 'icon' || !showText) return <span className={`inline-flex ${className}`}>{icon}</span>;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {icon}
      <span className="font-mono font-bold tracking-wider text-ink leading-none" style={{ fontSize: Math.max(11, Math.round(px * 0.5)) }}>
        SURAKSHA-X
      </span>
    </span>
  );
};
