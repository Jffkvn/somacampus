import React from 'react';
import { cn } from '../../lib/utils';

export interface PageHeaderProps {
  /** Path / eyebrow, e.g. "People & Operations" */
  eyebrow?: string;
  /** Short page title — avoid full sentences */
  title: string;
  description?: string;
  /** Status chips or pills on the meta line */
  chips?: React.ReactNode;
  /** Primary / secondary actions, top-right */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * P2 polish — shared ops page chrome.
 * Eyebrow + short H1 + meta chips + actions. Replaces icon+wall-of-text titles.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  chips,
  actions,
  className,
}) => {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-teal">{eyebrow}</p>
        )}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{title}</h1>
        {(description || chips) && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            {description && <p className="m-0">{description}</p>}
            {chips}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
};
