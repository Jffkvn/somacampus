import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { NAVIGATION_CONFIG } from '../../config/navigation';
import { UserRole } from '../../config/permissions';
import { cn } from '../../lib/utils';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  role: UserRole;
}

/**
 * P1 — narrow ⌘K palette: role-filtered nav destinations only.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, role }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const flat: Array<{ label: string; href: string; group: string }> = [];
    for (const group of NAVIGATION_CONFIG) {
      if (group.roles && !group.roles.includes(role)) continue;
      if (group.href) {
        flat.push({ label: group.label, href: group.href, group: group.label });
      }
      for (const sub of group.subItems || []) {
        if (sub.roles && !sub.roles.includes(role)) continue;
        flat.push({ label: sub.label, href: sub.href, group: group.label });
      }
    }
    if (!q) return flat.slice(0, 12);
    return flat
      .filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          i.href.toLowerCase().includes(q) ||
          i.group.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [query, role]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  if (!open) return null;

  const go = (href: string) => {
    navigate(href);
    onClose();
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150 print:hidden"
      data-print="hide"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center gap-2 px-4 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && items[index]) {
                e.preventDefault();
                go(items[index].href);
              }
            }}
            placeholder="Jump to students, fees, payroll…"
            className="flex-1 py-3.5 text-sm outline-none placeholder:text-slate-400"
            aria-label="Search navigation"
          />
          <kbd className="text-[10px] font-mono text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-72 overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-slate-400">No matches</p>
          )}
          {items.map((item, i) => (
            <button
              key={item.href + item.label}
              type="button"
              onClick={() => go(item.href)}
              onMouseEnter={() => setIndex(i)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-sm transition-colors',
                i === index ? 'bg-brand-teal/10 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
              )}
            >
              <span>
                <span className="font-medium">{item.label}</span>
                <span className="ml-2 text-[11px] text-slate-400">{item.group}</span>
              </span>
              {i === index && <CornerDownLeft className="w-3.5 h-3.5 text-slate-400" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
