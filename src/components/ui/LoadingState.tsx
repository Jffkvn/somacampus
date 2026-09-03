import React from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  label?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading...',
  className,
}) => {
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
