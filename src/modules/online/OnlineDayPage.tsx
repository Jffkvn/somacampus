import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { teacherService } from '../teacher/teacherService';
import { toLocalYYYYMMDD } from '../teacher/scheduleUtils';
import { mergeDayItems, onlineTeachingService } from './onlineTeachingService';
import type { DayTimelineItem, OnlineDaySession } from './onlineTeachingService';
import type { TimetableEntry } from '../../types/domain';
import { useAuth } from '../../lib/authContext';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import type { StatusVariant } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { ArrowLeft, Video, ExternalLink } from 'lucide-react';

const FALLBACK_TEACHER = 'teacher@somacampus.ug';

const SESSION_PILL: Record<string, StatusVariant> = {
  SCHEDULED: 'info',
  CONFIRMED: 'pending',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'critical',
};

/** '2026-09-08T09:00:00Z' → '09:00' (UTC, matching the service day window). */
function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export const OnlineDayPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const teacherKey = user?.email ?? FALLBACK_TEACHER;

  const [date, setDate] = useState(toLocalYYYYMMDD());
  const [physical, setPhysical] = useState<TimetableEntry[]>([]);
  const [online, setOnline] = useState<OnlineDaySession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setLoadError(null);
        const [today, onlineDay] = await Promise.all([
          teacherService.getTeacherToday(teacherKey, date),
          onlineTeachingService.getOnlineDay(teacherKey, date),
        ]);
        setPhysical(today.schedule ?? []);
        setOnline(onlineDay);
      } catch (err: any) {
        setLoadError(err?.message ?? 'Could not load your online day. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [teacherKey, date]);

  if (isLoading) {
    return <LoadingState label="Loading your teaching day..." />;
  }

  const timeline: DayTimelineItem<TimetableEntry>[] = mergeDayItems(physical, online);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
            Online Teaching
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            My Teaching Day
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Physical periods and online sessions, merged chronologically.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal"
            aria-label="Teaching day date"
          />
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate('/teacher/today')}
          >
            Today
          </Button>
        </div>
      </div>

      {loadError && (
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="py-4 text-sm text-red-800">{loadError}</CardContent>
        </Card>
      )}

      {timeline.length === 0 ? (
        <EmptyState
          icon={Video}
          title="Nothing scheduled this day"
          description="No physical periods or online sessions found for this date."
        />
      ) : (
        <div className="space-y-3">
          {timeline.map((item) =>
            item.kind === 'physical' ? (
              <div
                key={`physical-${item.entry.id}`}
                className="p-4 rounded-2xl border bg-white/80 border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 text-center">
                    <p className="text-sm font-bold text-slate-900">{item.entry.startTime}</p>
                    <p className="text-[11px] text-slate-400">{item.entry.endTime}</p>
                  </div>
                  <div className="border-l border-slate-200 pl-4 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{item.entry.className}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-sm font-semibold text-brand-teal">{item.entry.subjectName}</span>
                    </div>
                    <p className="text-xs text-slate-500">{item.entry.roomName ?? 'Classroom'}</p>
                  </div>
                </div>
                <StatusPill status="info" label={item.contextBadge} />
              </div>
            ) : (
              <Card key={`online-${item.session.id}`} className="border-sky-200/80 bg-sky-50/30">
                <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <div className="w-14 text-center">
                      <p className="text-sm font-bold text-slate-900">{hhmm(item.session.scheduledStart)}</p>
                      <p className="text-[11px] text-slate-400">{hhmm(item.session.scheduledEnd)}</p>
                    </div>
                    <div className="border-l border-slate-200 pl-4 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusPill status="info" label={item.contextBadge} />
                        <StatusPill
                          status={SESSION_PILL[item.session.status] ?? 'neutral'}
                          label={item.session.status}
                        />
                        <span className="text-sm font-bold text-slate-900">
                          {item.session.offeringTitle ?? 'Online session'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {item.session.participantCount} participant{item.session.participantCount === 1 ? '' : 's'}
                        {' • '}
                        {item.session.presentCount} present
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.session.joinUrl && (
                      <a
                        href={item.session.joinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Join link
                      </a>
                    )}
                    <Link
                      to={`/teaching/online/${item.session.id}`}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-xl bg-brand-teal text-white hover:opacity-90"
                    >
                      Open cockpit
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      )}

      {online.length === 0 && timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Video className="w-4 h-4 text-brand-teal" />
              No online sessions this day
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-500">
            Only physical periods are scheduled. Online sessions appear here once assigned.
          </CardContent>
        </Card>
      )}
    </div>
  );
};
