/**
 * School Calendar Page — SomaCampus Phase 8E Task 1 (read-only VIEW).
 *
 * Audience-filtered upcoming events grouped by date with a month pager.
 * No event creation UI (locked): staff manage events via a future admin
 * surface; this page only reads through calendarService (RLS + audience
 * filter are the arbiters). No AI.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { calendarService } from './calendarService';
import type { CalendarEvent, CalendarAudience } from './calendarService';
import { useAuth } from '../../lib/authContext';
import { Card, CardContent } from '../../components/ui/Card';
import { StatusPill, type StatusVariant } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';

function audiencePill(audience: CalendarAudience): { status: StatusVariant; label: string } {
  switch (audience) {
    case 'school':
      return { status: 'info', label: 'Whole school' };
    case 'teachers':
      return { status: 'neutral', label: 'Teachers' };
    case 'parents':
      return { status: 'success', label: 'Parents' };
    case 'students':
      return { status: 'warning', label: 'Students' };
    case 'class':
      return { status: 'pending', label: 'Class' };
    default:
      return { status: 'neutral', label: audience };
  }
}

function dateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA');
}

function formatDayHeader(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTimeRange(event: CalendarEvent): string {
  if (event.allDay) return 'All day';
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const start = new Date(event.startDatetime).toLocaleTimeString([], opts);
  const end = new Date(event.endDatetime).toLocaleTimeString([], opts);
  return `${start} – ${end}`;
}

function formatMonthLabel(month: { year: number; month: number }): string {
  return new Date(month.year, month.month, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

export const SchoolCalendarPage: React.FC = () => {
  const { schoolId, role } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<{ year: number; month: number } | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) {
      setError('No school context for this session.');
      setEvents([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const classIds = await calendarService.resolveViewerClassIds(schoolId, role);
      setEvents(await calendarService.getCalendarEvents(schoolId, { role, childClassIds: classIds }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the school calendar.');
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, role]);

  useEffect(() => {
    load();
  }, [load]);

  const shiftMonth = useCallback(
    (delta: number) => {
      const base = month ?? { year: new Date().getFullYear(), month: new Date().getMonth() };
      const shifted = new Date(base.year, base.month + delta, 1);
      setMonth({ year: shifted.getFullYear(), month: shifted.getMonth() });
    },
    [month]
  );

  const visible = useMemo(() => {
    if (!month) return events;
    return events.filter((e) => {
      const d = new Date(e.startDatetime);
      return d.getFullYear() === month.year && d.getMonth() === month.month;
    });
  }, [events, month]);

  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of visible) {
      const key = dateKey(e.startDatetime);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }, [visible]);

  if (isLoading) {
    return (
      <div className="p-8">
        <LoadingState label="Loading school calendar..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 sm:p-8 space-y-6 max-w-4xl mx-auto">
        <div className="border-b border-slate-200 pb-5">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            School Calendar
          </h1>
        </div>
        <EmptyState
          icon={CalendarDays}
          title="Could not load the calendar"
          description={error}
          actionLabel="Retry"
          onAction={load}
        />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-4xl mx-auto animate-in fade-in">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          School Calendar
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Whole-school and targeted events: assemblies, exams, sports, and term dates. Read-only —
          managed by school staff.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-semibold text-slate-800">
            {month ? formatMonthLabel(month) : 'All upcoming'}
          </span>
          <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {month && (
          <Button variant="secondary" size="sm" onClick={() => setMonth(null)}>
            Show all upcoming
          </Button>
        )}
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming events"
          description="There are no upcoming events for your audience right now. Staff-published events will appear here."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={`No events in ${month ? formatMonthLabel(month) : 'this view'}`}
          description="Try another month or return to the full upcoming list."
          actionLabel="Show all upcoming"
          onAction={() => setMonth(null)}
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([key, dayEvents]) => (
            <section key={key} aria-label={formatDayHeader(key)}>
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">
                {formatDayHeader(key)}
              </h2>
              <div className="space-y-3">
                {dayEvents.map((e) => {
                  const pill = audiencePill(e.audience);
                  return (
                    <Card key={e.id}>
                      <CardContent>
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <h3 className="font-bold text-slate-900">{e.title}</h3>
                          <div className="flex items-center gap-2 shrink-0">
                            <StatusPill status={pill.status} label={pill.label} />
                            <StatusPill status="neutral" label={e.eventType} />
                          </div>
                        </div>
                        <p className="text-xs font-semibold text-slate-500">
                          {formatTimeRange(e)}
                          {e.location && (
                            <span className="inline-flex items-center gap-1 ml-2 font-normal">
                              <MapPin className="w-3 h-3" />
                              {e.location}
                            </span>
                          )}
                        </p>
                        {e.description && (
                          <p className="text-sm text-slate-600 whitespace-pre-wrap mt-2">
                            {e.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
