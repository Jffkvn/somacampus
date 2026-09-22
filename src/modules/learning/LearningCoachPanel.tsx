/**
 * Digital Learning Spine P1 — Learning Coach panel.
 *
 * Shows configurable coach policy + weekly signed hours + recent
 * confirmations. Coach actions (hours sign-off / offline-work verify)
 * only appear when the school policy enables those capabilities.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill } from '../../components/ui/StatusPill';
import { AlertCircle, Clock3, UserCheck, BadgeCheck } from 'lucide-react';
import {
  learningCoachService,
  type CoachConfirmation,
  type LearningCoachAssignment,
  type LearningCoachSettings,
} from './learningCoachService';

function weekWindow(now = new Date()): { from: string; to: string } {
  const day = now.getDay(); // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(monday), to: iso(sunday) };
}

export interface LearningCoachPanelProps {
  schoolId: string;
  studentId: string;
  /** Person id of the signed-in coach when they can record confirmations. */
  coachPersonId?: string | null;
  stageKey?: string | null;
}

export const LearningCoachPanel: React.FC<LearningCoachPanelProps> = ({
  schoolId,
  studentId,
  coachPersonId,
  stageKey = null,
}) => {
  const [settings, setSettings] = useState<LearningCoachSettings | null>(null);
  const [assignments, setAssignments] = useState<LearningCoachAssignment[]>([]);
  const [confirmations, setConfirmations] = useState<CoachConfirmation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hoursInput, setHoursInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [s, a, c] = await Promise.all([
        learningCoachService.getSettings(schoolId, stageKey),
        learningCoachService.listAssignmentsForStudent(studentId),
        learningCoachService.listConfirmationsForStudent(studentId),
      ]);
      setSettings(s);
      setAssignments(a);
      setConfirmations(c);
    } catch (err: any) {
      console.error('Learning coach panel failed:', err);
      setError('We could not load coaching right now. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, studentId, stageKey]);

  const week = useMemo(() => weekWindow(), []);
  const signedHours = useMemo(
    () => learningCoachService.sumSignedHours(confirmations, week.from, week.to),
    [confirmations, week.from, week.to],
  );
  const target = settings?.weeklyHoursTarget ?? null;
  const activeAssignment = assignments[0] ?? null;
  const canSignOff =
    Boolean(settings?.isEnabled && settings.capabilities.signOffHours) &&
    Boolean(coachPersonId && activeAssignment);

  const record = async (kind: 'hours_sign_off' | 'offline_work_verify' | 'engagement_confirm') => {
    if (!activeAssignment || !coachPersonId) return;
    if (kind === 'hours_sign_off') {
      const hours = Number(hoursInput);
      if (!Number.isFinite(hours) || hours < 0) {
        setError('Enter the coaching hours to sign off (0 or more).');
        return;
      }
    }
    setIsSaving(true);
    setError(null);
    try {
      await learningCoachService.recordConfirmation({
        schoolId,
        studentId,
        assignmentId: activeAssignment.id,
        confirmationKind: kind,
        confirmedByPersonId: coachPersonId,
        hours: kind === 'hours_sign_off' ? Number(hoursInput) : null,
        note: noteInput.trim() || null,
      });
      setHoursInput('');
      setNoteInput('');
      await load();
    } catch (err: any) {
      console.error('Coach confirmation failed:', err);
      const raw = String(err?.message ?? '');
      setError(/PGRST|permission|violates/i.test(raw) ? 'Could not save that confirmation. Please try again.' : raw || 'Could not save.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-slate-400">Loading coaching…</CardContent>
      </Card>
    );
  }

  if (settings && !settings.isEnabled) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-brand-teal" /> Learning Coach
              </span>
            </CardTitle>
            <CardDescription>Coaching is turned off for this school stage.</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-brand-teal" /> Learning Coach
            </span>
          </CardTitle>
          <CardDescription>
            Parent/guardian coaching — hours and confirmations are school-configured, not fixed.
            {settings ? ` Timezone ${settings.timezone}.` : ''}
          </CardDescription>
        </div>
        <StatusPill
          status={activeAssignment ? 'success' : 'neutral'}
          label={activeAssignment ? activeAssignment.coachRole.replace('_', ' ') : 'no coach'}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {target != null && settings?.capabilities.signOffHours && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 flex items-center gap-3">
            <Clock3 className="w-4 h-4 text-brand-teal shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">This week (signed)</p>
              <p className="text-lg font-bold text-slate-900">
                {signedHours} / {target} hrs
              </p>
              <p className="text-[11px] text-slate-500">
                {week.from} → {week.to} · coach sign-off only
              </p>
            </div>
          </div>
        )}

        {canSignOff && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Coach actions</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="0"
                step="0.5"
                value={hoursInput}
                onChange={(e) => setHoursInput(e.target.value)}
                placeholder="Hours"
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
                aria-label="Coaching hours to sign off"
              />
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Note (optional)"
                maxLength={500}
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
                aria-label="Coach note"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {settings?.capabilities.signOffHours && (
                <Button
                  type="button"
                  size="sm"
                  disabled={isSaving || hoursInput.trim() === ''}
                  onClick={() => void record('hours_sign_off')}
                  leftIcon={<Clock3 className="w-3.5 h-3.5" />}
                >
                  Sign off hours
                </Button>
              )}
              {settings?.capabilities.verifyOfflineWork && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => void record('offline_work_verify')}
                  leftIcon={<BadgeCheck className="w-3.5 h-3.5" />}
                >
                  Verify offline work
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isSaving}
                onClick={() => void record('engagement_confirm')}
              >
                Confirm engagement
              </Button>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Recent confirmations</p>
          {confirmations.length === 0 ? (
            <p className="text-sm text-slate-400">None yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {confirmations.slice(0, 6).map((c) => (
                <li key={c.id} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {c.confirmationKind.replace(/_/g, ' ')}
                      {c.hours != null ? ` · ${c.hours}h` : ''}
                    </p>
                    {c.note && <p className="text-xs text-slate-500 truncate">{c.note}</p>}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{c.confirmedOn}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
