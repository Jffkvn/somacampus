import React, { useEffect, useMemo, useState } from 'react';
import { getLiveLessonsMonitor, LiveLessonsMonitorResult } from './leadershipService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { StatusPill } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { toLocalYYYYMMDD } from '../teacher/scheduleUtils';

const PILOT_SCHOOL_ID = '22222222-2222-2222-2222-222222222222';

type StatusFilter = 'all' | 'submitted' | 'pending' | 'missing-attendance';

export const LiveLessonsMonitorPage: React.FC = () => {
  const today = useMemo(() => toLocalYYYYMMDD(new Date()), []);
  const [data, setData] = useState<LiveLessonsMonitorResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [classFilter, setClassFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setIsLoading(true);
        setLoadError(null);
        const res = await getLiveLessonsMonitor(PILOT_SCHOOL_ID, today);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load live lessons.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [today]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = classFilter.trim().toLowerCase();
    return data.periods.filter((p) => {
      if (statusFilter === 'submitted' && p.periodState !== 'submitted') return false;
      if (statusFilter === 'pending' && p.periodState !== 'pending') return false;
      if (statusFilter === 'missing-attendance' && !(p.periodState === 'submitted' && !p.hasAttendanceRecorded)) return false;
      if (q && !p.className.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, statusFilter, classFilter]);

  if (isLoading || !data) {
    if (loadError) {
      return (
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="pb-6 border-b border-slate-200/80">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
              Academics • Live Monitor
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
              Live Lessons Monitor
            </h1>
            <p className="text-sm text-slate-500 mt-1">{today} • Scheduled vs submitted periods</p>
          </div>
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900">Could not load today&apos;s periods.</p>
              <p className="text-xs text-slate-500">{loadError}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-xs font-semibold text-brand-teal hover:underline"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return <LoadingState label="Loading live lessons monitor..." />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">
            Academics • Live Monitor
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Live Lessons Monitor
          </h1>
          <p className="text-sm text-slate-500 mt-1">{today} • Scheduled vs submitted periods</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status="neutral" label={`Expected ${data.expected}`} />
          <StatusPill status="success" label={`Submitted ${data.submitted}`} />
          <StatusPill status="pending" label={`Pending ${data.pending}`} />
          <StatusPill status="warning" label={`Missing attendance ${data.missingAttendance}`} />
        </div>
      </div>

      {data.extraSubmissions > 0 && (
        <p className="text-xs text-slate-500">
          Includes {data.extraSubmissions} extra submission{data.extraSubmissions === 1 ? '' : 's'} outside the
          scheduled timetable.
        </p>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Today&apos;s periods</CardTitle>
            <CardDescription>Filter by status or class. Select a period to read its visible note.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <span>Status</span>
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
              >
                <option value="all">All</option>
                <option value="submitted">Submitted</option>
                <option value="pending">Pending</option>
                <option value="missing-attendance">Missing attendance</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <span>Class</span>
              <input
                aria-label="Filter by class"
                type="text"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                placeholder="e.g. Stage 5"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400"
              />
            </label>
          </div>

          {data.periods.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No periods scheduled today.</p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No periods match these filters.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((p) => {
                const isPending = p.periodState === 'pending';
                const isOpen = expanded.has(p.lessonId);
                return (
                  <div
                    key={p.lessonId}
                    className={isPending ? 'py-4 space-y-2 rounded-xl bg-slate-50/60 px-3' : 'py-4 space-y-2'}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpanded(p.lessonId)}
                      aria-expanded={isOpen}
                      className="w-full text-left"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs font-semibold text-slate-500">{p.scheduledTime}</span>
                          <span className="text-slate-300">•</span>
                          <span className={`text-sm font-bold ${isPending ? 'text-slate-500' : 'text-slate-900'}`}>
                            {p.className}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-xs font-medium text-slate-600">{p.subjectName}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-xs text-slate-500">{p.teacherName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.periodState === 'submitted' && !p.hasAttendanceRecorded && (
                            <StatusPill status="warning" label="No attendance" />
                          )}
                          {isPending ? (
                            <StatusPill status="pending" label="Pending" />
                          ) : (
                            <StatusPill status="success" label="Submitted" />
                          )}
                        </div>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="p-3 rounded-xl bg-slate-50 text-xs text-slate-700 leading-relaxed border border-slate-100">
                        <span className="font-semibold text-slate-900">Topic: {p.curriculumTopic} — </span>
                        {p.visibleLessonNote}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
