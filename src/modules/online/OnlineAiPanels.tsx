import React, { useMemo, useState } from 'react';
import {
  suggestTeachers,
  prepareSession,
  summarizeSession,
  approveSessionSummary,
  summarizeForParent,
} from './onlineAiService';
import type {
  TeacherCandidate,
  PrepOutstandingItem,
} from './onlineAiService';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { Button } from '../../components/ui/Button';
import { CheckCircle2, StickyNote, Users } from 'lucide-react';

/**
 * Phase 9I Task 1 — advisory AI panels (presentational only).
 *
 * Every panel is suggestion UI with approve/dismiss and takes NO automatic
 * action: approve/dismiss only flip local state or call a parent-supplied
 * callback. Nothing here writes to the DB, sends, shares, or assigns.
 */

function AdvisoryNote({ text }: { text: string }): React.ReactElement {
  return <p className="text-[11px] text-slate-400 pt-1">{text}</p>;
}

const ADVISORY_FOOTER =
  'Advisory only — generated deterministically from session data. A human must approve; this panel takes no automatic action.';

/* ------------------------------------------------------------------ */
/* Teacher match suggestions (booking hook; no booking UI exists yet,   */
/* so the cockpit hosts it with whatever candidates are supplied).      */
/* ------------------------------------------------------------------ */

export const MatchingPanel: React.FC<{
  requiredSubjectId: string;
  candidates: TeacherCandidate[];
  onApprove: (teacherId: string) => void;
}> = ({ requiredSubjectId, candidates, onApprove }) => {
  const result = useMemo(
    () => suggestTeachers(requiredSubjectId, candidates),
    [requiredSubjectId, candidates],
  );
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [approvedId, setApprovedId] = useState<string | null>(null);
  const visible = result.suggestions.filter((s) => !dismissed.has(s.teacherId));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-teal" />
          Teacher match suggestions (advisory)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {visible.length === 0 ? (
          <p className="text-xs text-slate-400">
            {result.emptyMessage ??
              'All suggestions dismissed. No teacher is assigned by this panel.'}
          </p>
        ) : (
          visible.map((s) => (
            <div
              key={s.teacherId}
              className="p-3 rounded-xl border border-slate-200/80 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-900">
                    {s.displayName ?? s.teacherId}
                  </p>
                  <StatusPill status={s.eligible ? 'success' : 'neutral'} label={s.eligible ? 'Eligible' : 'Not eligible'} />
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{s.reasons.join(' ')}</p>
                {approvedId === s.teacherId && (
                  <p className="text-xs font-semibold text-emerald-700 mt-1">
                    Approved — assign manually in the booking flow. This panel assigns no one.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!s.eligible}
                  onClick={() => {
                    setApprovedId(s.teacherId);
                    onApprove(s.teacherId);
                  }}
                >
                  Approve &amp; assign
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDismissed((prev) => new Set(prev).add(s.teacherId))}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          ))
        )}
        <AdvisoryNote text={ADVISORY_FOOTER} />
      </CardContent>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* Session preparation summary (cockpit).                              */
/* ------------------------------------------------------------------ */

export const PrepSummaryPanel: React.FC<{
  sessionId: string;
  priorNote: string | null;
  outstanding: PrepOutstandingItem[];
  objectives: string[];
}> = ({ sessionId, priorNote, outstanding, objectives }) => {
  const prep = useMemo(
    () => prepareSession({ sessionId, priorNote, outstanding, objectives }),
    [sessionId, priorNote, outstanding, objectives],
  );
  const [dismissed, setDismissed] = useState(false);
  const [approved, setApproved] = useState(false);
  if (dismissed) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-brand-teal" />
          Session preparation (advisory)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 whitespace-pre-line">
          {prep.body}
        </p>
        {approved && (
          <p className="text-xs font-semibold text-emerald-700">
            Approved by the teacher — preparation reviewed, nothing sent anywhere.
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setApproved(true)}>
            Approve
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
        <AdvisoryNote text={ADVISORY_FOOTER} />
      </CardContent>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* Post-completion session summary (approval-gated, never auto-shared). */
/* ------------------------------------------------------------------ */

export const SessionSummaryPanel: React.FC<{
  sessionId: string;
  presentCount: number;
  participantCount: number;
  completionNote: string;
  approverId: string;
}> = ({ sessionId, presentCount, participantCount, completionNote, approverId }) => {
  const draft = useMemo(
    () => summarizeSession({ sessionId, presentCount, participantCount, completionNote }),
    [sessionId, presentCount, participantCount, completionNote],
  );
  const [approved, setApproved] = useState<{ by: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const view = approved ? approveSessionSummary(draft, approved.by) : draft;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-brand-teal" />
          Session summary (advisory)
        </CardTitle>
        <StatusPill status={view.shareable ? 'success' : 'warning'} label={view.shareable ? 'Approved — may be shared manually' : 'Not shareable until approved'} />
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 whitespace-pre-line">
          {view.body}
        </p>
        {!approved && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setApproved({ by: approverId })}>
              Approve for sharing
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDismissed(true)}>
              Dismiss
            </Button>
          </div>
        )}
        <AdvisoryNote text="Unapproved summaries are never shared. Approval here only marks the draft — sharing stays manual." />
      </CardContent>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* Parent evidence summary (ParentHomePage online card, read-only).     */
/* Inputs are the already-parent-visible feedback items on screen, so   */
/* the approved-evidence rule holds by construction; the composer flag  */
/* is retained for provenance. No amounts, no internal notes.           */
/* ------------------------------------------------------------------ */

export const ParentAiSummary: React.FC<{
  studentName: string;
  feedback: Array<{ text: string }>;
}> = ({ studentName, feedback }) => {
  const summary = useMemo(
    () =>
      summarizeForParent(
        studentName,
        feedback.map((f) => ({ observationText: f.text, visibility: 'parent_visible' as const })),
      ),
    [studentName, feedback],
  );

  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3">
      <p className="text-[11px] font-bold text-brand-teal uppercase mb-1">
        Advisory summary (from teacher feedback above)
      </p>
      <p className="text-sm text-slate-700 whitespace-pre-line">{summary.body}</p>
    </div>
  );
};
