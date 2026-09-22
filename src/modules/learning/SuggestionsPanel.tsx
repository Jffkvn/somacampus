/**
 * P2B-2 / P2B-3 suggestions panel — recommend-only. Human accept/dismiss.
 * Evidence links are always shown. Nothing auto-assigns or grades.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill, type StatusVariant } from '../../components/ui/StatusPill';
import { AlertCircle, Lightbulb, Check, X } from 'lucide-react';
import { suggestionService } from './suggestionService';
import type { LearningSuggestion } from './suggestionDomain';

const KIND_PILL: Record<string, StatusVariant> = {
  gap: 'warning',
  pacing: 'info',
  intervention: 'pending',
};

export interface SuggestionsPanelProps {
  studentId: string;
  /** When true, teacher can accept/dismiss. */
  canDecide?: boolean;
  onChanged?: () => void;
}

export const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({
  studentId,
  canDecide = false,
  onChanged,
}) => {
  const [items, setItems] = useState<LearningSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setItems(await suggestionService.listForStudent(studentId));
    } catch (err: any) {
      console.error('Suggestions load failed:', err);
      setError('We could not load suggestions right now.');
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const decide = async (id: string, status: 'accepted' | 'dismissed') => {
    setBusyId(id);
    try {
      await suggestionService.decide(id, status);
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err?.message ?? 'Could not save that decision');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-brand-teal" /> Suggestions (recommend only)
            </span>
          </CardTitle>
          <CardDescription>
            Gaps and pacing from evidence. AI never writes grades — you decide.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">No suggestions yet.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((s) => (
              <li key={s.id} className="rounded-xl border border-slate-100 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                    <p className="text-xs text-slate-500 mt-1">{s.rationale}</p>
                    <ul className="mt-2 space-y-0.5">
                      {s.evidenceLinks.map((e) => (
                        <li key={e.id} className="text-[11px] text-slate-400">
                          {e.kind} · {e.label} · <code>{String(e.id).slice(0, 8)}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <StatusPill status={KIND_PILL[s.kind] ?? 'neutral'} label={s.kind} />
                    {s.status === 'suggested' && canDecide && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === s.id}
                          onClick={() => void decide(s.id, 'accepted')}
                          leftIcon={<Check className="w-3.5 h-3.5" />}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === s.id}
                          onClick={() => void decide(s.id, 'dismissed')}
                          leftIcon={<X className="w-3.5 h-3.5" />}
                        >
                          Dismiss
                        </Button>
                      </div>
                    )}
                    {s.status !== 'suggested' && (
                      <StatusPill
                        status={s.status === 'accepted' ? 'success' : 'neutral'}
                        label={s.status}
                      />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
