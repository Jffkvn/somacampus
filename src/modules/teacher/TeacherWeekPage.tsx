import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherService } from './teacherService';
import { TimetableEntry } from '../../types/domain';
import { Card, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { useAuth } from '../../lib/authContext';
import { Calendar, MapPin } from 'lucide-react';

const DAYS = [
  { dow: 1, label: 'Monday' },
  { dow: 2, label: 'Tuesday' },
  { dow: 3, label: 'Wednesday' },
  { dow: 4, label: 'Thursday' },
  { dow: 5, label: 'Friday' },
];

/**
 * My Week — the signed-in teacher's own Monday-Friday lessons from the
 * ACTIVE published timetable. Read-only by design: the master timetable
 * builder (allocations, solver, publish) is a leadership tool.
 */
export const TeacherWeekPage: React.FC = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.email) return;
    try {
      setIsLoading(true);
      setLoadError(null);
      setEntries(await teacherService.getTeacherWeek(user.email));
    } catch (err) {
      console.error('Failed to load my week', err);
      setLoadError(err instanceof Error ? err.message : 'Could not load your week.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<number, TimetableEntry[]>();
    for (const e of entries) {
      const list = map.get(e.dayOfWeek) ?? [];
      list.push(e);
      map.set(e.dayOfWeek, list);
    }
    return map;
  }, [entries]);

  if (isLoading) {
    return <LoadingState label="Loading your week..." />;
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      <div className="pb-6 border-b border-slate-200/80">
        <span className="text-xs font-semibold uppercase tracking-wider text-brand-teal">My Teaching</span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">My Week</h1>
        <p className="text-sm text-slate-500 mt-1">
          Your lessons from the school's active timetable, Monday to Friday. Read-only — timetable changes are made by
          school leadership.
        </p>
      </div>

      {loadError ? (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">{loadError}</div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-slate-500">
            You have no lessons on the active timetable this week.
            <span className="block text-xs text-slate-400 mt-1">
              Timetable allocations are managed by school leadership.
            </span>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {DAYS.map(({ dow, label }) => {
            const dayEntries: TimetableEntry[] = byDay.get(dow) ?? [];
            return (
              <div key={dow} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">{label}</span>
                  <span className="text-[11px] text-slate-400">
                    {dayEntries.length === 0 ? 'Free' : `${dayEntries.length} lesson${dayEntries.length === 1 ? '' : 's'}`}
                  </span>
                </div>
                <div className="p-2.5 space-y-2 min-h-[120px]">
                  {dayEntries.map((e) => (
                    <div key={e.id} className="rounded-xl border border-teal-100 bg-teal-50/40 p-2.5">
                      <p className="text-xs font-bold text-slate-500 font-mono">
                        {e.startTime} – {e.endTime}
                      </p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">{e.subjectName}</p>
                      <p className="text-xs text-slate-600">{e.className}</p>
                      {e.roomName && (
                        <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" /> {e.roomName}
                        </p>
                      )}
                    </div>
                  ))}
                  {dayEntries.length === 0 && (
                    <p className="text-xs text-slate-300 text-center pt-6">No lessons</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5" />
        Need a change? Timetable allocations and the master schedule are managed by school leadership under Academics.
      </p>
    </div>
  );
};
