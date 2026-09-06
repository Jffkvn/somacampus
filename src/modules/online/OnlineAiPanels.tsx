import React, { useMemo, useState } from 'react';
import {
  suggestTeachers,
  prepareSession,
  generateTeacherBriefing,
  summarizeSession,
  approveSessionSummary,
  discardSessionSummary,
  summarizeForParent,
  recommendNextSteps,
  recommendScheduling,
  type TeacherCandidate,
  type PrepOutstandingItem,
  type TeacherBriefingInput,
  type NextStepInput,
  type SchedulingInput,
} from './onlineAiService';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { Button } from '../../components/ui/Button';
import {
  CheckCircle2,
  StickyNote,
  Users,
  Sparkles,
  Calendar,
  HelpCircle,
  Clock,
} from 'lucide-react';

/**
 * Advisory AI Panels — SomaCampus Phase 9I.
 *
 * Enforces visual distinction between AI Suggestions, Drafts, and System Records.
 * Gated: no automated actions are taken from these panels.
 */

export const AiBadge: React.FC<{
  variant: 'SUGGESTION' | 'DRAFT' | 'APPROVED' | 'SYSTEM';
  label?: string;
}> = ({ variant, label }) => {
  switch (variant) {
    case 'SUGGESTION':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
          <Sparkles className="w-3 h-3" />
          {label ?? 'AI Suggestion'}
        </span>
      );
    case 'DRAFT':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3" />
          {label ?? 'AI Draft'}
        </span>
      );
    case 'APPROVED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          {label ?? 'Teacher Approved'}
        </span>
      );
    case 'SYSTEM':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
          {label ?? 'System Record'}
        </span>
      );
  }
};

function AdvisoryNote({ text }: { text: string }): React.ReactElement {
  return <p className="text-[11px] text-slate-400 pt-1 italic">{text}</p>;
}

const ADVISORY_FOOTER =
  'Advisory only — generated deterministically from session data. A human must approve; this panel takes no automatic action.';

/* ------------------------------------------------------------------ */
/* (1) Teacher Match Suggestions Panel                                */
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
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-teal" />
          Teacher match suggestions
        </CardTitle>
        <AiBadge variant="SUGGESTION" label="Allocation Recommendation" />
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
                  <StatusPill
                    status={s.eligible ? 'success' : 'neutral'}
                    label={s.eligible ? 'Eligible' : 'Not eligible'}
                  />
                  {s.activeSessionCount !== undefined && (
                    <span className="text-[11px] text-slate-500 font-medium">
                      Load: {s.activeSessionCount} sessions
                    </span>
                  )}
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
                  Select candidate
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
/* (2) Session Preparation / Teacher Pre-Session Briefing             */
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
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-brand-teal" />
          Pre-session preparation
        </CardTitle>
        <AiBadge variant={approved ? 'APPROVED' : 'SUGGESTION'} label={approved ? 'Reviewed' : 'Advisory Briefing'} />
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 whitespace-pre-line">
          {prep.body}
        </p>
        {approved && (
          <p className="text-xs font-semibold text-emerald-700">
            Preparation acknowledged by teacher — ready for instruction.
          </p>
        )}
        <div className="flex items-center gap-2">
          {!approved && (
            <Button variant="outline" size="sm" onClick={() => setApproved(true)}>
              Acknowledge Briefing
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
        <AdvisoryNote text={ADVISORY_FOOTER} />
      </CardContent>
    </Card>
  );
};

export const TeacherBriefingPanel: React.FC<TeacherBriefingInput> = (props) => {
  const briefing = useMemo(() => generateTeacherBriefing(props), [props]);
  const [dismissed, setDismissed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  if (dismissed) return null;

  return (
    <Card className="border-indigo-100 bg-gradient-to-b from-indigo-50/20 to-white">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-bold flex items-center gap-2 text-indigo-950">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          Pre-Session Intelligence Briefing
        </CardTitle>
        <AiBadge variant={acknowledged ? 'APPROVED' : 'DRAFT'} label={acknowledged ? 'Teacher Reviewed' : 'AI Briefing'} />
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {briefing.isEmpty ? (
          <p className="text-xs text-slate-500 italic">{briefing.emptyMessage}</p>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
              <span className="font-semibold text-slate-800 uppercase tracking-wider text-[10px]">
                Previous Session Context:
              </span>
              <p className="text-slate-700">{briefing.whatHappenedPreviously}</p>
            </div>

            {briefing.relevantLearnerPatterns.length > 0 && (
              <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200/60 space-y-1">
                <span className="font-semibold text-amber-900 uppercase tracking-wider text-[10px]">
                  Learner Evidence & Friction Points:
                </span>
                <ul className="list-disc pl-4 space-y-0.5 text-amber-950">
                  {briefing.relevantLearnerPatterns.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
              <span className="font-semibold text-slate-800 uppercase tracking-wider text-[10px]">
                Recommended Focus & Pacing:
              </span>
              <p className="text-slate-700">{briefing.suggestedFocus}</p>
              <p className="text-slate-600 mt-1">{briefing.suggestedNextSteps}</p>
            </div>

            {briefing.suggestedQuestions.length > 0 && (
              <div className="p-3 bg-teal-50/40 rounded-lg border border-teal-200/60 space-y-1">
                <span className="font-semibold text-teal-900 uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <HelpCircle className="w-3 h-3 text-teal-600" />
                  Suggested Retrieval Questions:
                </span>
                <ul className="list-disc pl-4 space-y-1 text-teal-950">
                  {briefing.suggestedQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {!acknowledged && !briefing.isEmpty && (
            <Button variant="outline" size="sm" onClick={() => setAcknowledged(true)}>
              Acknowledge Briefing
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
        <AdvisoryNote text="Evidence grounded. Claims cite authorized session records; diagnosis terms stripped." />
      </CardContent>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* (3) Post-Session Summary Panel                                     */
/* ------------------------------------------------------------------ */

export const SessionSummaryPanel: React.FC<{
  sessionId: string;
  presentCount: number;
  participantCount: number;
  completionNote: string;
  approverId: string;
  curriculumRef?: string | null;
}> = ({ sessionId, presentCount, participantCount, completionNote, approverId, curriculumRef }) => {
  const draft = useMemo(
    () =>
      summarizeSession({
        sessionId,
        presentCount,
        participantCount,
        completionNote,
        curriculumRef,
      }),
    [sessionId, presentCount, participantCount, completionNote, curriculumRef],
  );

  const [approvedSummary, setApprovedSummary] = useState<any | null>(null);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const view = approvedSummary ? approveSessionSummary(draft, approvedSummary.by) : draft;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-brand-teal" />
          Session completion summary
        </CardTitle>
        <AiBadge
          variant={view.shareable ? 'APPROVED' : 'DRAFT'}
          label={view.shareable ? 'Approved for Sharing' : 'Requires Approval'}
        />
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 whitespace-pre-line">
          {view.body}
        </p>
        {!approvedSummary && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApprovedSummary({ by: approverId })}
            >
              Approve for sharing
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                discardSessionSummary(draft, approverId, 'Teacher dismissed summary');
                setDismissed(true);
              }}
            >
              Discard
            </Button>
          </div>
        )}
        <AdvisoryNote text="Unapproved summaries are never shared. Approval marks draft as verified; original completion note is never overwritten." />
      </CardContent>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* (4) Session Follow-up / Next Steps Panel                           */
/* ------------------------------------------------------------------ */

export const NextStepsPanel: React.FC<NextStepInput> = (props) => {
  const rec = useMemo(() => recommendNextSteps(props), [props]);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <Card className="border-teal-100 bg-teal-50/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-bold flex items-center gap-2 text-teal-950">
          <Sparkles className="w-4 h-4 text-teal-600" />
          Recommended Pedagogical Follow-ups
        </CardTitle>
        <AiBadge variant="SUGGESTION" label="Advisory Next-Steps" />
      </CardHeader>
      <CardContent className="pt-0 space-y-2 text-xs">
        <div className="space-y-1">
          <span className="font-semibold text-teal-900 uppercase tracking-wider text-[10px]">
            Consolidation Exercises:
          </span>
          <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
            {rec.suggestedActivities.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
        <div className="pt-1">
          <span className="font-semibold text-teal-900 uppercase tracking-wider text-[10px]">
            Pacing Recommendation:
          </span>
          <p className="text-slate-600 italic mt-0.5">{rec.pacingAdvice}</p>
        </div>
        <div className="pt-2 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* (5) Online Scheduling Recommendations Panel                        */
/* ------------------------------------------------------------------ */

export const SchedulingRecommendationPanel: React.FC<
  SchedulingInput & { onSelectSlot?: (slotId: string) => void }
> = (props) => {
  const rec = useMemo(() => recommendScheduling(props), [props]);

  return (
    <Card className="border-indigo-100">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
          <Calendar className="w-4 h-4 text-indigo-600" />
          Recommended session slots
        </CardTitle>
        <AiBadge variant="SUGGESTION" label="Advisory Schedule" />
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {rec.recommendedSlots.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            {rec.emptyMessage ?? 'No slots match the requested frequency.'}
          </p>
        ) : (
          <div className="space-y-2">
            {rec.recommendedSlots.map((slot) => (
              <div
                key={slot.slotTemplateId}
                className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">
                      Day {slot.dayOfWeek} • {slot.startTime}–{slot.endTime}
                    </span>
                    <StatusPill
                      status={slot.conflictFree ? 'success' : 'warning'}
                      label={slot.conflictFree ? 'Conflict-free' : 'Conflict'}
                    />
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">{slot.rationale}</p>
                </div>
                {props.onSelectSlot && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => props.onSelectSlot?.(slot.slotTemplateId)}
                  >
                    Select Slot
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        <AdvisoryNote text="Advisory recommendations only. Confirming a booking requires manual review and booking service execution." />
      </CardContent>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* (6) Parent Evidence Summary (Parent Portal Online Card)            */
/* ------------------------------------------------------------------ */

export const ParentAiSummary: React.FC<{
  studentName: string;
  feedback: Array<{ text: string }>;
}> = ({ studentName, feedback }) => {
  const summary = useMemo(
    () =>
      summarizeForParent(
        studentName,
        feedback.map((f) => ({
          observationText: f.text,
          visibility: 'parent_visible' as const,
        })),
      ),
    [studentName, feedback],
  );

  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-bold text-brand-teal uppercase">
          Advisory summary (from teacher feedback above)
        </p>
        <AiBadge variant="SUGGESTION" label="Parent Overview" />
      </div>
      <p className="text-sm text-slate-700 whitespace-pre-line">{summary.body}</p>
    </div>
  );
};
