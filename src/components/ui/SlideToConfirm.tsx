import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { prefersReducedMotion } from '../../lib/numberFlow';

export interface SlideToConfirmProps {
  label: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  /** Hold duration in ms (ignored when reduced motion → single confirm click). */
  holdMs?: number;
}

/**
 * P1 — irreversible-action control (payroll finalize, register submit).
 * Hold to confirm; keyboard: Space/Enter hold. Reduced-motion: plain confirm.
 */
export const SlideToConfirm: React.FC<SlideToConfirmProps> = ({
  label,
  onConfirm,
  disabled,
  isLoading,
  className,
  holdMs = 700,
}) => {
  const [progress, setProgress] = useState(0);
  const holdingRef = useRef(false);
  const rafRef = useRef(0);
  const startRef = useRef(0);

  const stop = useCallback(() => {
    holdingRef.current = false;
    cancelAnimationFrame(rafRef.current);
    setProgress(0);
  }, []);

  const complete = useCallback(async () => {
    stop();
    await onConfirm();
  }, [onConfirm, stop]);

  const startHold = useCallback(() => {
    if (disabled || isLoading) return;
    if (prefersReducedMotion()) {
      void complete();
      return;
    }
    holdingRef.current = true;
    startRef.current = performance.now();
    const tick = (now: number) => {
      if (!holdingRef.current) return;
      const p = Math.min(1, (now - startRef.current) / holdMs);
      setProgress(p);
      if (p >= 1) {
        void complete();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [complete, disabled, holdMs, isLoading]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        startHold();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (!e.repeat) startHold();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') stop();
      }}
      aria-label={`${label} — hold to confirm`}
      className={cn(
        'relative overflow-hidden select-none touch-none',
        'inline-flex items-center justify-center min-h-[40px] px-4 rounded-xl font-medium text-sm',
        'bg-emerald-700 text-white shadow-sm',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
        className
      )}
    >
      <span
        className="absolute inset-y-0 left-0 bg-emerald-800/80 pointer-events-none"
        style={{ width: `${progress * 100}%`, transition: progress === 0 ? 'width 120ms ease' : 'none' }}
        aria-hidden
      />
      <span className="relative flex items-center gap-2">
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        <span>{isLoading ? 'Working…' : label}</span>
      </span>
    </button>
  );
};
