import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Width class for the panel */
  widthClassName?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const EXIT_MS = 180;

/**
 * P2 — right-side sheet (macOS inspector / Bencho-style panel).
 * Focus trap + Escape + backdrop dismiss. Chrome only; content stays paper.
 */
export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  widthClassName = 'w-full max-w-2xl',
}) => {
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useRef(`sheet-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
      return;
    }
    if (!mounted) return;
    setExiting(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted || exiting) return;
    restoreRef.current = (document.activeElement as HTMLElement) ?? null;
    const panel = panelRef.current;
    if (panel) {
      const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      (focusables[0] ?? panel).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      restoreRef.current?.focus?.();
    };
  }, [mounted, exiting, onClose]);

  const onBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!mounted) return null;

  return (
    <div
      role="presentation"
      onClick={onBackdrop}
      className={cn(
        'fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] print:hidden',
        exiting ? 'animate-out fade-out duration-150' : 'animate-in fade-in duration-200'
      )}
      data-print="hide"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'absolute right-0 top-0 bottom-0 flex flex-col bg-white shadow-2xl outline-none',
          widthClassName,
          exiting
            ? 'animate-out slide-out-to-right duration-200'
            : 'animate-in slide-in-from-right duration-200'
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-slate-900 tracking-tight">
              {title}
            </h2>
            {description && (
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
};
