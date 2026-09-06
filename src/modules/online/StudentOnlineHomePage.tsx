import React, { useEffect, useState } from 'react';
import { onlineStudentService } from './onlineStudentService';
import type { OnlineHome } from './onlineStudentService';
import { useAuth } from '../../lib/authContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import type { StatusVariant } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { Video, BookOpen, MessageSquareText, ExternalLink, CalendarClock } from 'lucide-react';

/**
 * Phase 9D Task 1 — student online home.
 *
 * Greeting + next-session hero (join button) + upcoming list + assignments
 * due + recent feedback, all scoped to the signed-in learner's own online
 * participant/submission rows.
 *
 * Locked: online-only learners see NO class/timetable/attendance
 * artifacts — this page renders none and queries none (see
 * onlineStudentService). Join = link display; no video build.
 */

const SESSION_PILL: Record<string, StatusVariant> = {
  SCHEDULED: 'info',
  CONFIRMED: 'pending',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'critical',
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-UG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const StudentOnlineHomePage: React.FC = () => {
  const { user, schoolId, fullName } = useAuth();
  // No demo-identity fallback: a missing email must surface an honest
  // error, never a real-looking learner's home.
  const studentKey = user?.email ?? null;

  const [home, setHome] = useState<OnlineHome | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!schoolId || !studentKey) {
        setHome({ student: null, upcomingSessions: [], assignmentsDue: [], recentFeedback: [] });
        setLoadError(
          !studentKey
            ? 'We could not identify your learner account. Please sign out and sign in again, or contact the school office.'
            : null,
        );
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setLoadError(null);
        setHome(await onlineStudentService.getOnlineHome(studentKey, schoolId));
      } catch (err: any) {
        setLoadError(err?.message ?? 'Could not load your online home. Please try again.');
        setHome(null);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [studentKey, schoolId]);

  if (isLoading) {
    return <LoadingState label="Loading your online home..." />;
  }

  const displayName = home?.student?.name ?? fullName ?? 'Learner';
  const [next, ...rest] = home?.upcomingSessions ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="pb-6 border-b border-slate-200/80">
        <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
          Online Learning
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
          Hi {displayName}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Your upcoming sessions, assignments and teacher feedback.
        </p>
      </div>

      {loadError && (
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="py-4 text-sm text-red-800">{loadError}</CardContent>
        </Card>
      )}

      {/* Next session hero */}
      {next ? (
        <Card className="border-sky-200/80 bg-sky-50/30">
          <CardHeader>
            <div>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Video className="w-4 h-4 text-brand-teal" /> Up next
                </span>
              </CardTitle>
              <CardDescription>Your next online session — join from the link below.</CardDescription>
            </div>
            <StatusPill status={SESSION_PILL[next.status] ?? 'neutral'} label={next.status} />
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-lg font-bold text-slate-900">
              {next.offeringTitle ?? next.subject ?? 'Online session'}
            </p>
            <p className="text-sm text-slate-500">
              {fmtDateTime(next.start)}
              {next.teacherName ? ` • ${next.teacherName}` : ''}
              {next.subject && next.offeringTitle && next.subject !== next.offeringTitle
                ? ` • ${next.subject}`
                : ''}
            </p>
            {next.joinUrl && (
              <a
                href={next.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-brand-teal text-white hover:opacity-90"
              >
                <ExternalLink className="w-4 h-4" />
                Join session
              </a>
            )}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Video}
          title="No upcoming sessions"
          description="No upcoming sessions — check back soon. New sessions appear here once your teacher schedules them."
        />
      )}

      {/* Upcoming list */}
      {rest.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-brand-teal" /> Coming up
                </span>
              </CardTitle>
              <CardDescription>Your other scheduled sessions, soonest first.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-slate-100">
              {rest.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {s.offeringTitle ?? s.subject ?? 'Online session'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {fmtDateTime(s.start)}
                      {s.teacherName ? ` • ${s.teacherName}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusPill status={SESSION_PILL[s.status] ?? 'neutral'} label={s.status} />
                    {s.joinUrl && (
                      <a
                        href={s.joinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Join
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Assignments due */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand-teal" /> Assignments due
              </span>
            </CardTitle>
            <CardDescription>Work waiting for you to hand in.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {(home?.assignmentsDue ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">Nothing due right now — enjoy the breather.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(home?.assignmentsDue ?? []).map((a) => (
                <li key={a.submissionId} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{a.title}</p>
                    <p className="text-xs text-slate-400">
                      {a.subject ? `${a.subject} • ` : ''}{a.dueDate ? `Due ${a.dueDate}` : 'No due date set'}
                    </p>
                  </div>
                  <StatusPill status={a.status === 'missing' ? 'critical' : 'pending'} label={a.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recent feedback */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <MessageSquareText className="w-4 h-4 text-brand-teal" /> Recent feedback
              </span>
            </CardTitle>
            <CardDescription>Notes from your teachers on sessions and submitted work.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {(home?.recentFeedback ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">No feedback yet — it will show up here after your sessions and submissions are reviewed.</p>
          ) : (
            <ul className="space-y-2">
              {(home?.recentFeedback ?? []).map((f, i) => (
                <li
                  key={`${f.kind}-${f.sessionId ?? f.assignmentId ?? i}`}
                  className="text-sm bg-slate-50 border border-slate-100 rounded-xl px-4 py-3"
                >
                  <p className="font-semibold text-slate-800">
                    {f.sourceTitle ?? (f.kind === 'session' ? 'Session note' : 'Assignment feedback')}
                    <span className="font-normal text-slate-400">
                      {' • '}
                      {f.kind === 'session' ? 'Session' : 'Assignment'}
                      {f.date ? ` • ${f.date}` : ''}
                      {typeof f.score === 'number' ? ` • ${f.score} marks` : ''}
                    </span>
                  </p>
                  <p className="text-slate-600 mt-0.5">{f.text}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
