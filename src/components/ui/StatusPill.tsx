import React from 'react';
import { cn } from '../../lib/utils';

export type StatusVariant = 'success' | 'pending' | 'warning' | 'critical' | 'info' | 'neutral';

export interface StatusPillProps {
  status: StatusVariant;
  label?: string;
  children?: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  showDot?: boolean;
}

const statusStyles: Record<StatusVariant, { pill: string; dot: string }> = {
  success: {
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  pending: {
    pill: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  warning: {
    pill: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
  },
  critical: {
    pill: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
  },
  info: {
    pill: 'bg-sky-50 text-sky-700 border-sky-200',
    dot: 'bg-sky-500',
  },
  neutral: {
    pill: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
};

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  label,
  children,
  size = 'sm',
  className,
  showDot = true,
}) => {
  const { pill, dot } = statusStyles[status];
  const sizeClass = size === 'sm' ? 'text-xs px-2.5 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border',
        sizeClass,
        pill,
        className
      )}
    >
      {showDot && <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />}
      <span>{label || children}</span>
    </span>
  );
};
