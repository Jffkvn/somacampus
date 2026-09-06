import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { onlineTeachingService } from './onlineTeachingService';
import type { OnlineSessionDetail, ParticipationStatus } from './onlineTeachingService';
import { onlineClassroomService } from './onlineClassroomService';
import type { ClassroomSignal } from './onlineClassroomService';
import { useAuth } from '../../lib/authContext';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import type { StatusVariant } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { ArrowLeft, ExternalLink, Play, CheckCircle2, Lock, StickyNote, Activity } from 'lucide-react';

const FALLBACK_TEACHER = 'teacher@somacampus.ug';

/** Terminal states: cockpit is read-only (no actions offered). */
const READ_ONLY_STATUSES: ReadonlySet<string> = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

const SESSION_PILL: Record<string, StatusVariant> = {
  SCHEDULED: 'info',
  CONFIRMED: 'pending',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'critical',
};

const PARTICIPATION_PILL: Record<ParticipationStatus, StatusVariant> = {
  pending: 'neutral',
  present: 'success',
  absent: 'critical',
  late: 'warning',
  partial: 'info',
  excused: 'neutral',
};

const MARK_OPTIONS: ParticipationStatus[] = ['present', 'absent', 'late', 'partial', 'excused'];

function formatRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} – ${end}`;
  const day = s.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  return `${day}, ${s.toLocaleTimeString([], opts)} – ${e.toLocaleTimeString([], opts)}`;
}

export const OnlineSessionCockpitPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const teacherKey = user?.email ?? FALLBACK_TEACHER;

  const [detail, setDetail] = useState<OnlineSessionDetail | null>(null);
  const [signals, setSignals] = useState<ClassroomSignal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [markingStudentId, setMarkingStudentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) {
      setLoadError('Missing session reference in the URL.');
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setLoadError(null);
      const d = await onlineTeachingService.getOnlineSession(sessionId, teacherKey);
      setDetail(d);
      // Technical signals are evidence only (Phase 9H): a failure here must
      // never break the cockpit — fall back to an honest empty list.
      try {
        const s = await onlineClassroomService.getSessionSignals(sessionId, teacherKey);
        setSignals(s ?? []);
      } catch {
        setSignals([]);
      }
    } catch (err: any) {
      setLoadError(err?.message ?? 'Could not load session cockpit. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, teacherKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading || (!detail && !loadError)) {
    return <LoadingState label="Loading session cockpit..." />;
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Session cockpit unavailable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">{loadError}</p>
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/teaching/online')}>
            Back to online day
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Lock}
          title="Session unavailable"
          description="This session does not exist or is not assigned to you. You can only open your own online sessions."
          actionLabel="Back to online day"
          onAction={() => navigate('/teaching/online')}
        />
      </div>
    );
  }

  const { session, participants } = detail;
  const readOnly = READ_ONLY_STATUSES.has(session.status);
  const canStart = session.status === 'SCHEDULED' || session.status === 'CONFIRMED';
  const canComplete = session.status === 'IN_PROGRESS';

  const handleStart = async () => {
    if (!sessionId) return;
    try {
      setIsActing(true);
      setActionError(null);
      await onlineTeachingService.startSession(sessionId, teacherKey);
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Could not start the session.');
    } finally {
      setIsActing(false);
    }
  };

  const handleMark = async (studentId: string, status: ParticipationStatus) => {
    if (!sessionId) return;
    try {
      setMarkingStudentId(studentId);
      setActionError(null);
      await onlineTeachingService.recordParticipation(sessionId, teacherKey, studentId, status);
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Could not record participation.');
    } finally {
      setMarkingStudentId(null);
    }
  };

  const handleComplete = async () => {
    if (!sessionId) return;
    if (!note.trim()) {
      setActionError('A completion note is required to complete the session.');
      return;
    }
    try {
      setIsActing(true);
      setActionError(null);
      await onlineTeachingService.completeSession(sessionId, teacherKey, note);
      setNote('');
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Could not complete the session.');
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <Link
          to="/teaching/online"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Online day
        </Link>
      </div>

      {/* Header: context, time, join link */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-teal">
              Online session cockpit
            </span>
            <CardTitle className="text-xl font-extrabold text-slate-900 mt-1">
              {session.offeringTitle ?? 'Online session'}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">{formatRange(session.scheduledStart, session.scheduledEnd)}</p>
          </div>
          <StatusPill status={SESSION_PILL[session.status] ?? 'neutral'} label={session.status} />
        </CardHeader>
        <CardContent className="pt-0 flex flex-wrap items-center gap-3">
          {session.joinUrl ? (
            <a
              href={session.joinUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-brand-teal text-white hover:opacity-90"
            >
              <ExternalLink className="w-4 h-4" />
              Join session
            </a>
          ) : (
            <span className="text-xs text-slate-400">No join link set for this session.</span>
          )}
          <span className="text-xs text-slate-500">
            {session.participantCount} participant{session.participantCount === 1 ? '' : 's'}
            {' • '}
            {session.presentCount} present
          </span>
        </CardContent>
      </Card>

      {readOnly && (
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="py-4 flex items-center gap-2 text-sm text-slate-600">
            <Lock className="w-4 h-4 text-slate-400" />
            This session is {session.status} — read-only. No further actions are available.
          </CardContent>
        </Card>
      )}

      {actionError && (
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="py-3 text-sm text-red-800">{actionError}</CardContent>
        </Card>
      )}

      {/* Start / complete actions */}
      {canStart && (
        <Card>
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <p className="text-sm text-slate-600">Ready when you are — starting opens the live roster.</p>
            <Button
              variant="primary"
              size="md"
              leftIcon={<Play className="w-4 h-4" />}
              isLoading={isActing}
              onClick={handleStart}
            >
              Start session
            </Button>
          </CardContent>
        </Card>
      )}

      {canComplete && (
        <Card className="border-amber-200/80">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-teal" />
              Complete session
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <label className="block text-xs font-semibold text-slate-700" htmlFor="completion-note">
              Completion note (required)
            </label>
            <textarea
              id="completion-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What was covered? What should the next session pick up?"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
            />
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="md"
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
                isLoading={isActing}
                disabled={!note.trim()}
                onClick={handleComplete}
              >
                Complete session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Roster */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">
            Participants ({participants.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {participants.length === 0 ? (
            <p className="text-sm text-slate-500">No participants enrolled in this session yet.</p>
          ) : (
            participants.map((p) => (
              <div
                key={p.id}
                className="p-3.5 rounded-2xl border border-slate-200/80 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">{p.studentName ?? 'Student'}</p>
                  {p.admissionNumber && (
                    <p className="text-xs text-slate-400">{p.admissionNumber}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusPill status={PARTICIPATION_PILL[p.status] ?? 'neutral'} label={p.status} />
                  {canComplete && (
                    <div className="flex items-center gap-1">
                      {MARK_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          disabled={markingStudentId === p.studentId}
                          onClick={() => handleMark(p.studentId, opt)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg capitalize transition-all disabled:opacity-50 ${
                            p.status === opt
                              ? 'bg-brand-teal text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Technical signals (evidence only — never participation) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-teal" />
            Technical signals ({signals.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {signals.length === 0 ? (
            <p className="text-xs text-slate-400">No technical signals recorded for this session yet.</p>
          ) : (
            signals.map((s) => {
              const owner = participants.find((p) => p.studentId === s.studentId);
              const at = new Date(s.occurredAt);
              const time = Number.isNaN(at.getTime())
                ? s.occurredAt
                : at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div
                  key={s.id}
                  className="px-3 py-2 rounded-xl border border-slate-200/80 bg-slate-50/60 flex items-center justify-between gap-3"
                >
                  <div className="text-xs text-slate-700">
                    <span className="font-bold">{owner?.studentName ?? 'System'}</span>
                    <span className="text-slate-400"> • {s.signalType} • {time}</span>
                    {s.recordedSource === 'provider' && (
                      <span className="text-slate-400"> • provider</span>
                    )}
                  </div>
                  <StatusPill status="info" label={s.signalType} />
                </div>
              );
            })
          )}
          <p className="text-[11px] text-slate-400 pt-1">
            Signals are connection evidence only — they never set participation. Confirm each student manually above.
          </p>
        </CardContent>
      </Card>

      {/* Previous session note */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-brand-teal" />
            Previous session note
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {detail.previousNote ? (
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
              {detail.previousNote}
            </p>
          ) : (
            <p className="text-xs text-slate-400">No prior session notes yet for this offering.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
