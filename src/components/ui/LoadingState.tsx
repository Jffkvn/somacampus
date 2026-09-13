import React from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  label?: string;
  className?: string;
  variant?: 'spinner' | 'table' | 'cards';
  rows?: number;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading...',
  className,
  variant = 'spinner',
  rows = 5,
}) => {
  if (variant === 'table') {
    return (
      <div
        className={cn(
          'p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-4 animate-in fade-in',
          className
        )}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="h-5 w-40 bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-4 w-28 bg-slate-100 rounded-lg animate-pulse" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50/70 border border-slate-100 animate-pulse"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div
                    className="h-3.5 bg-slate-200 rounded"
                    style={{ width: `${60 + (i % 3) * 15}%` }}
                  />
                  <div className="h-2.5 w-24 bg-slate-200/60 rounded" />
                </div>
              </div>
              <div className="h-4 w-20 bg-slate-200 rounded shrink-0" />
              <div className="h-6 w-16 bg-slate-200/80 rounded-full shrink-0" />
            </div>
          ))}
        </div>
        {label && (
          <p className="text-center text-xs font-medium text-slate-400 pt-2">{label}</p>
        )}
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div
        className={cn(
          'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in',
          className
        )}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-3 animate-pulse"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 bg-slate-200 rounded" />
              <div className="w-8 h-8 rounded-xl bg-slate-100" />
            </div>
            <div className="h-7 w-28 bg-slate-200 rounded" />
            <div className="h-2.5 w-36 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-white/50 border border-slate-100',
        className
      )}
    >
      <Loader2 className="w-8 h-8 animate-spin text-brand-teal mb-3" />
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
};
