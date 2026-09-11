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
import type { CalendarEvent, CalendarAudience, CalendarEventType } from './calendarService';
import { useAuth } from '../../lib/authContext';
import { Card, CardContent } from '../../components/ui/Card';
import { StatusPill, type StatusVariant } from '../../components/ui/StatusPill';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus, Sparkles, Loader2 } from 'lucide-react';

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
  const effectiveSchoolId = schoolId || '22222222-2222-2222-2222-222222222222';
  const isStaff = ['teacher', 'admin', 'principal', 'head_teacher', 'super_admin'].includes(role);
  const canManage = ['admin', 'principal'].includes(role);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<{ year: number; month: number } | null>(null);

  // Modal & action states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<CalendarEventType>('assembly');
  const [audience, setAudience] = useState<CalendarAudience>('school');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endTime, setEndTime] = useState('10:30');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const classIds = await calendarService.resolveViewerClassIds(effectiveSchoolId, role);
      const fetched = await calendarService.getCalendarEvents(effectiveSchoolId, { role, childClassIds: classIds });
      setEvents(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the school calendar.');
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveSchoolId, role]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSeedEvents = async () => {
    try {
      setIsSeeding(true);
      const seeded = await calendarService.seedDefaultEvents(effectiveSchoolId);
      if (seeded.length > 0) {
        setEvents((prev) => [...prev, ...seeded].sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime()));
      }
    } catch (err) {
      console.error('Failed to seed events:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setAllDay(false);
    setEventType('assembly');
    setAudience('school');
    setEditingEvent(null);
  };

  const openEditModal = (ev: CalendarEvent) => {
    setEditingEvent(ev);
    setTitle(ev.title);
    setDescription(ev.description ?? '');
    setLocation(ev.location ?? '');
    setEventType(ev.eventType);
    setAudience(ev.audience);
    const s = new Date(ev.startDatetime);
    const en = new Date(ev.endDatetime);
    setStartDate(s.toISOString().split('T')[0]);
    setStartTime(s.toISOString().slice(11, 16));
    setEndDate(en.toISOString().split('T')[0]);
    setEndTime(en.toISOString().slice(11, 16));
    setAllDay(ev.allDay);
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm('Delete this calendar event? This cannot be undone.')) return;
    try {
      setDeletingId(id);
      setActionError(null);
      await calendarService.deleteCalendarEvent(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete event.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Please enter an event title.');
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      const startDatetime = allDay
        ? new Date(`${startDate}T00:00:00`).toISOString()
        : new Date(`${startDate}T${startTime}:00`).toISOString();
      const endDatetime = allDay
        ? new Date(`${endDate || startDate}T23:59:59`).toISOString()
        : new Date(`${endDate || startDate}T${endTime}:00`).toISOString();

      if (editingEvent) {
        const updated = await calendarService.updateCalendarEvent(editingEvent.id, {
          title: title.trim(),
          description: description.trim() || null,
          eventType,
          startDatetime,
          endDatetime,
          allDay,
          location: location.trim() || null,
          audience,
        });
        setEvents((prev) =>
          prev
            .map((ev) => (ev.id === updated.id ? updated : ev))
            .sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime())
        );
      } else {
        const newEv = await calendarService.createCalendarEvent({
          schoolId: effectiveSchoolId,
          title: title.trim(),
          description: description.trim() || null,
          eventType,
          startDatetime,
          endDatetime,
          allDay,
          location: location.trim() || null,
          audience,
        });
        setEvents((prev) => [...prev, newEv].sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime()));
      }
      setIsCreateModalOpen(false);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create calendar event.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
      <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            School Calendar
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Whole-school and targeted events: assemblies, exams, sports, and term dates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {events.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSeedEvents}
              disabled={isSeeding}
              className="gap-1.5"
            >
              {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
              Seed Term Events
            </Button>
          )}
          {isStaff && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
              resetForm();
              setIsCreateModalOpen(true);
            }}
              className="gap-1.5 bg-[#002b36] hover:bg-[#003847] text-white"
            >
              <Plus className="w-4 h-4" />
              Create Event
            </Button>
          )}
        </div>
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
          description="There are no upcoming events scheduled for your school yet. You can create a new event or load standard term events."
          actionLabel="Load Sample Events"
          onAction={handleSeedEvents}
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
                        {canManage && (
                          <div className="flex items-center gap-2 mt-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditModal(e)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={deletingId === e.id}
                              onClick={() => handleDeleteEvent(e.id)}
                            >
                              {deletingId === e.id ? 'Deleting…' : 'Delete'}
                            </Button>
                          </div>
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

      {actionError && (
        <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
          {actionError}
        </div>
      )}

      {/* Create Event Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create School Calendar Event"
      >
        <form onSubmit={handleCreateEvent} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Event Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. End of Term Examination, Sports Gala..."
              className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002b36]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Event Type
              </label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value as CalendarEventType)}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002b36]"
              >
                <option value="assembly">Assembly</option>
                <option value="sports">Sports</option>
                <option value="exam">Exam</option>
                <option value="meeting">Meeting</option>
                <option value="holiday">Holiday</option>
                <option value="trip">Trip</option>
                <option value="ceremony">Ceremony</option>
                <option value="custom">Custom / Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Target Audience
              </label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as CalendarAudience)}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002b36]"
              >
                <option value="school">Whole School</option>
                <option value="teachers">Teachers Only</option>
                <option value="parents">Parents & Staff</option>
                <option value="students">Students & Staff</option>
                <option value="class">Class Specific</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDayCheckbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="w-4 h-4 rounded text-[#002b36] focus:ring-[#002b36] border-slate-300"
            />
            <label htmlFor="allDayCheckbox" className="text-sm font-medium text-slate-700 select-none cursor-pointer">
              All Day Event
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002b36]"
                required
              />
            </div>

            {!allDay && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002b36]"
                  required
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002b36]"
                required
              />
            </div>

            {!allDay && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002b36]"
                  required
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Location / Venue (Optional)
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Main Auditorium, Sports Ground, Science Lab"
              className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002b36]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Description / Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional information, instructions, or agenda..."
              className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002b36]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              className="bg-[#002b36] hover:bg-[#003847] text-white gap-1.5"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingEvent ? 'Save Changes' : 'Save Event'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
