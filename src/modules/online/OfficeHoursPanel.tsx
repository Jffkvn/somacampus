/**
 * P1 Office hours / 1:1 panel — books through the existing online_bookings
 * spine (slot_kind / booking_purpose = office_hours). No second scheduler.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusPill, type StatusVariant } from '../../components/ui/StatusPill';
import { AlertCircle, CalendarClock } from 'lucide-react';
import {
  officeHoursService,
  type OfficeHoursBooking,
  type OfficeHoursSlot,
} from './officeHoursService';

const DAY_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const BOOKING_PILL: Record<string, StatusVariant> = {
  requested: 'pending',
  confirmed: 'success',
  cancelled: 'neutral',
};

function nextDateForWeekday(weekday: number): string {
  const now = new Date();
  const current = now.getDay() === 0 ? 7 : now.getDay();
  let delta = weekday - current;
  if (delta < 0) delta += 7;
  const d = new Date(now);
  d.setDate(now.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export interface OfficeHoursPanelProps {
  schoolId: string;
  studentId: string;
  /** Optional offering filter; omit to show every office-hours template. */
  offeringId?: string | null;
}

export const OfficeHoursPanel: React.FC<OfficeHoursPanelProps> = ({
  schoolId,
  studentId,
  offeringId,
}) => {
  const [slots, setSlots] = useState<OfficeHoursSlot[]>([]);
  const [bookings, setBookings] = useState<OfficeHoursBooking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBooking, setIsBooking] = useState<string | null>(null);

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [s, b] = await Promise.all([
        officeHoursService.listSlots({ schoolId, offeringId: offeringId ?? undefined }),
        officeHoursService.listBookingsForStudent(studentId),
      ]);
      setSlots(s);
      setBookings(b);
    } catch (err: any) {
      console.error('Office hours panel failed:', err);
      setError('We could not load office hours right now. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, studentId, offeringId]);

  const openSlots = useMemo(() => slots.filter((s) => s.active), [slots]);

  const request = async (slot: OfficeHoursSlot) => {
    setIsBooking(slot.id);
    setError(null);
    try {
      await officeHoursService.requestBooking({
        schoolId,
        offeringId: slot.offeringId,
        studentId,
        scheduledDate: nextDateForWeekday(slot.weekday),
        startTime: slot.startTime,
        endTime: slot.endTime,
        slotTemplateId: slot.id,
      });
      await load();
    } catch (err: any) {
      console.error('Office hours request failed:', err);
      const raw = String(err?.message ?? '');
      setError(
        /PGRST|permission|violates|conflict/i.test(raw)
          ? 'Could not book that slot. It may already be taken — pick another time.'
          : raw || 'Could not book office hours.',
      );
    } finally {
      setIsBooking(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-brand-teal" /> Office hours
            </span>
          </CardTitle>
          <CardDescription>
            Book a 1:1 with your teacher. Same booking system as class slots — one scheduler only.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-400">Loading office hours…</p>
        ) : openSlots.length === 0 ? (
          <p className="text-sm text-slate-400">No office hours published yet. Check back soon.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {openSlots.map((slot) => (
              <li key={slot.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {DAY_LABELS[slot.weekday] ?? slot.weekday} {slot.startTime.slice(0, 5)}–
                    {slot.endTime.slice(0, 5)}
                  </p>
                  <p className="text-xs text-slate-400">1:1 · next {nextDateForWeekday(slot.weekday)}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isBooking === slot.id}
                  onClick={() => void request(slot)}
                >
                  {isBooking === slot.id ? 'Booking…' : 'Book'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {bookings.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Your bookings
            </p>
            <ul className="divide-y divide-slate-100">
              {bookings.slice(0, 5).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <p className="text-sm text-slate-700">
                    {b.scheduledDate} · {b.startTime.slice(0, 5)}–{b.endTime.slice(0, 5)}
                  </p>
                  <StatusPill status={BOOKING_PILL[b.status] ?? 'neutral'} label={b.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
