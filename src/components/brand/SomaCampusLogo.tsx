import React from 'react';

interface SomaCampusLogoProps {
  variant?: 'full' | 'icon' | 'badge';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  theme?: 'light' | 'dark';
  className?: string;
}

const sizeMap = {
  sm: { height: 28, fontSize: 18, subSize: 8 },
  md: { height: 38, fontSize: 24, subSize: 9.5 },
  lg: { height: 48, fontSize: 32, subSize: 11 },
  xl: { height: 64, fontSize: 42, subSize: 13 },
};

export const SomaCampusLogo: React.FC<SomaCampusLogoProps> = ({
  variant = 'full',
  size = 'md',
  theme = 'light',
  className = '',
}) => {
  const brandTeal = '#006c8b';
  const textColor = theme === 'dark' ? '#f8fafc' : '#0f172a';
  const subColor = theme === 'dark' ? '#94a3b8' : '#64748b';

  const { height, fontSize, subSize } = sizeMap[size];

  // Standalone Icon
  if (variant === 'icon') {
    return (
      <svg
        viewBox="0 0 100 100"
        height={height}
        width={height}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-label="SomaCampus Logo Icon"
      >
        <path d="M 12 40 L 12 18 C 12 12 12 12 18 12 L 40 12" stroke={brandTeal} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
        <polygon points="50,18 85,34 50,50 15,34" fill={brandTeal} stroke={brandTeal} strokeWidth="2" strokeLinejoin="round"/>
        <path d="M 28 42 L 28 54 C 28 64 72 64 72 54 L 72 42" fill="none" stroke={brandTeal} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M 85 34 L 88 52 C 88 56 86 60 86 62" fill="none" stroke={brandTeal} strokeWidth="3" strokeLinecap="round"/>
        <circle cx="86" cy="65" r="3" fill={brandTeal}/>
        <path d="M 18 68 C 32 63 46 64 50 71 C 54 64 68 63 82 68" fill="none" stroke={brandTeal} strokeWidth="5" strokeLinecap="round"/>
        <path d="M 18 78 C 32 73 46 74 50 81 C 54 74 68 73 82 78" fill="none" stroke={brandTeal} strokeWidth="5" strokeLinecap="round"/>
        <line x1="50" y1="71" x2="50" y2="86" stroke={brandTeal} strokeWidth="4" strokeLinecap="round"/>
        <path d="M 60 88 L 82 88 C 88 88 88 88 88 82 L 88 60" stroke={brandTeal} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }

  // Full Horizontal Lockup
  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <svg
        viewBox="0 0 100 100"
        height={height}
        width={height}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <path d="M 12 40 L 12 18 C 12 12 12 12 18 12 L 40 12" stroke={brandTeal} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
        <polygon points="50,18 85,34 50,50 15,34" fill={brandTeal} stroke={brandTeal} strokeWidth="2" strokeLinejoin="round"/>
        <path d="M 28 42 L 28 54 C 28 64 72 64 72 54 L 72 42" fill="none" stroke={brandTeal} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M 85 34 L 88 52 C 88 56 86 60 86 62" fill="none" stroke={brandTeal} strokeWidth="3" strokeLinecap="round"/>
        <circle cx="86" cy="65" r="3" fill={brandTeal}/>
        <path d="M 18 68 C 32 63 46 64 50 71 C 54 64 68 63 82 68" fill="none" stroke={brandTeal} strokeWidth="5" strokeLinecap="round"/>
        <path d="M 18 78 C 32 73 46 74 50 81 C 54 74 68 73 82 78" fill="none" stroke={brandTeal} strokeWidth="5" strokeLinecap="round"/>
        <line x1="50" y1="71" x2="50" y2="86" stroke={brandTeal} strokeWidth="4" strokeLinecap="round"/>
        <path d="M 60 88 L 82 88 C 88 88 88 88 88 82 L 88 60" stroke={brandTeal} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div className="flex flex-col justify-center leading-tight">
        <span
          style={{ fontSize: `${fontSize}px`, color: brandTeal }}
          className="font-extrabold tracking-tight font-sans"
        >
          Soma<span style={{ color: textColor }} className="font-semibold">Campus</span>
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            style={{ fontSize: `${subSize}px`, color: subColor }}
            className="font-bold tracking-widest uppercase font-sans"
          >
            BY JANTAHR
          </span>
          <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
          <span
            style={{ fontSize: `${subSize * 0.9}px`, color: brandTeal }}
            className="font-semibold tracking-wider uppercase opacity-80"
          >
            SCHOOL OS
          </span>
        </div>
      </div>
    </div>
  );
};
