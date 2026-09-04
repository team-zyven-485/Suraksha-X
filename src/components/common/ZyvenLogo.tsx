import React from 'react';

interface ZyvenLogoProps {
  variant?: 'full' | 'icon' | 'horizontal' | 'badge';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  showText?: boolean;
}

export const ZyvenLogo: React.FC<ZyvenLogoProps> = ({
  variant = 'horizontal',
  size = 'md',
  className = '',
  showText = true,
}) => {
  // Dimension calculations
  const getIconDimensions = () => {
    if (typeof size === 'number') return { width: size, height: size };
    switch (size) {
      case 'xs':
        return { width: 22, height: 22 };
      case 'sm':
        return { width: 32, height: 32 };
      case 'md':
        return { width: 42, height: 42 };
      case 'lg':
        return { width: 56, height: 56 };
      case 'xl':
        return { width: 80, height: 80 };
      default:
        return { width: 40, height: 40 };
    }
  };

  const { width, height } = getIconDimensions();

  // The stylized Z icon with topographic wave contours & map pin
  const renderZIcon = () => (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 transition-transform duration-200"
    >
      <defs>
        {/* Top blue bar gradient */}
        <linearGradient id="zyven-blue-top" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0062FF" />
          <stop offset="100%" stopColor="#00D2FF" />
        </linearGradient>

        {/* Bottom blue bar gradient */}
        <linearGradient id="zyven-blue-bottom" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0052EA" />
          <stop offset="100%" stopColor="#00C2FF" />
        </linearGradient>

        {/* Green/Cyan diagonal bar gradient */}
        <linearGradient id="zyven-green-diag" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0099FF" />
          <stop offset="30%" stopColor="#00C853" />
          <stop offset="70%" stopColor="#00E676" />
          <stop offset="100%" stopColor="#00E5FF" />
        </linearGradient>

        {/* Text 'e' gradient */}
        <linearGradient id="zyven-e-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00D2FF" />
          <stop offset="100%" stopColor="#00E676" />
        </linearGradient>

        {/* Text 'ven' gradient */}
        <linearGradient id="zyven-text-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0066FF" />
          <stop offset="50%" stopColor="#00D2FF" />
          <stop offset="100%" stopColor="#00E676" />
        </linearGradient>

        {/* Shadow for pin */}
        <filter id="pin-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Top Bar of Z */}
      <path
        d="M 28 24 L 172 24 C 178 24 182 28 179 34 L 150 78 L 62 78 L 86 34 C 88 30 84 24 78 24 Z"
        fill="url(#zyven-blue-top)"
      />

      {/* Bottom Bar of Z */}
      <path
        d="M 122 122 L 38 122 C 32 122 28 128 31 134 L 60 178 L 148 178 L 124 134 C 122 130 126 122 132 122 Z"
        fill="url(#zyven-blue-bottom)"
      />

      {/* Diagonal Middle Segment with Topographic Contours */}
      <g>
        {/* Main diagonal curved band */}
        <path
          d="M 172 24 C 180 32 178 44 168 58 L 54 168 C 42 180 26 182 18 172 C 10 162 14 148 26 134 L 142 26 C 152 14 164 16 172 24 Z"
          fill="url(#zyven-green-diag)"
        />

        {/* Topographic Contours inside diagonal */}
        <path
          d="M 38 152 Q 65 140 85 155 T 145 105"
          stroke="rgba(255, 255, 255, 0.45)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 60 162 Q 85 125 115 135 T 160 70"
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 90 100 Q 110 70 135 80 T 170 38"
          stroke="rgba(255, 255, 255, 0.35)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />

        {/* Concentric GIS Ripple Rings below Pin */}
        <ellipse
          cx="100"
          cy="114"
          rx="22"
          ry="9"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeOpacity="0.8"
          fill="none"
        />
        <ellipse
          cx="100"
          cy="114"
          rx="12"
          ry="5"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeOpacity="0.9"
          fill="none"
        />

        {/* Map Location Pin Icon in Center */}
        <g filter="url(#pin-shadow)">
          <path
            d="M 100 84 C 92 84 86 90 86 98 C 86 108 100 120 100 120 C 100 120 114 108 114 98 C 114 90 108 84 100 84 Z"
            fill="#FFFFFF"
          />
          <circle cx="100" cy="97" r="4" fill="#00C853" />
        </g>
      </g>
    </svg>
  );

  // Text representation with proper branding colors
  const renderTypography = () => (
    <div className="flex flex-col leading-none select-none">
      <div className="flex items-baseline font-black tracking-tighter lowercase">
        <span className="text-[#0062FF] font-sans font-bold">z</span>
        <span className="relative text-[#0070FF] font-sans font-bold">
          y
          <span className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#00E676]" />
        </span>
        <span className="text-[#0091FF] font-sans font-bold">v</span>
        <span className="text-[#00E676] font-sans font-bold bg-gradient-to-br from-[#00D2FF] to-[#00E676] bg-clip-text text-transparent">
          e
        </span>
        <span className="text-[#0080FF] font-sans font-bold">n</span>
      </div>
      {/* Sleek Underline with Center Green Dot */}
      <div className="relative flex items-center justify-center w-full mt-1">
        <div className="w-full h-[1.5px] bg-gradient-to-r from-[#0062FF]/20 via-[#0062FF] to-[#0062FF]/20" />
        <div className="absolute w-2 h-2 rounded-full bg-[#00E676] border-2 border-surface" />
      </div>
    </div>
  );

  if (variant === 'icon') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        {renderZIcon()}
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        {renderZIcon()}
        {showText && (
          <div className="text-xl sm:text-2xl font-bold tracking-tight">
            {renderTypography()}
          </div>
        )}
      </div>
    );
  }

  // Horizontal variant (default)
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {renderZIcon()}
      {showText && (
        <div className="flex flex-col">
          <div className="flex items-baseline text-lg font-black tracking-tight lowercase">
            <span className="text-[#0062FF]">z</span>
            <span className="relative text-[#0070FF]">
              y
              <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#00E676]" />
            </span>
            <span className="text-[#0091FF]">v</span>
            <span className="text-transparent bg-gradient-to-r from-[#00D2FF] to-[#00E676] bg-clip-text">
              e
            </span>
            <span className="text-[#0080FF]">n</span>
          </div>
          <div className="relative flex items-center w-full mt-0.5">
            <div className="w-full h-[1.5px] bg-[#0062FF]/60" />
            <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#00E676]" />
          </div>
        </div>
      )}
    </div>
  );
};
