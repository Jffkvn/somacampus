/**
 * Digital Learning Spine P1 — Office hours / 1:1.
 *
 * Charter §13: reuse existing booking patterns (online_slot_templates +
 * online_bookings). NO second scheduler. This service only labels and
 * scopes those rows with slot_kind / booking_purpose = 'office_hours'.
 */
import { supabase } from '../../lib/supabase';
import { confirmBooking, type ConfirmedBooking } from './onlineBookingService';

export interface OfficeHoursSlot {
  id: string;
  schoolId: string;
  offeringId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  capacity: number;
  defaultTeacherId: string | null;
  active: boolean;
}

export interface OfficeHoursBooking {
  id: string;
  schoolId: string;
  offeringId: string;
  slotTemplateId: string | null;
  studentId: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: 'requested' | 'confirmed' | 'cancelled';
}

const isMockEnv = (): boolean =>
  process.env.NODE_ENV === 'test' ||
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('placeholder') ||
  import.meta.env.VITE_SUPABASE_URL.includes('mock');

function mapSlot(r: any): OfficeHoursSlot {
  return {
    id: r.id,
    schoolId: r.school_id,
    offeringId: r.offering_id,
    weekday: Number(r.weekday),
    startTime: r.start_time,
    endTime: r.end_time,
    capacity: Number(r.capacity ?? 1),
    defaultTeacherId: r.default_teacher_id ?? null,
    active: Boolean(r.active),
  };
}

function mapBooking(r: any): OfficeHoursBooking {
  return {
    id: r.id,
    schoolId: r.school_id,
    offeringId: r.offering_id,
    slotTemplateId: r.slot_template_id ?? null,
    studentId: r.student_id,
    scheduledDate: r.scheduled_date,
    startTime: r.start_time,
    endTime: r.end_time,
    status: r.status,
  };
}

export const officeHoursService = {
  /** Active office-hours templates for an offering (or whole school). */
  async listSlots(opts: { schoolId: string; offeringId?: string }): Promise<OfficeHoursSlot[]> {
    if (isMockEnv()) return [];
    let query = supabase
      .from('online_slot_templates')
      .select('*')
      .eq('school_id', opts.schoolId)
      .eq('slot_kind', 'office_hours')
      .eq('active', true)
      .order('weekday', { ascending: true })
      .order('start_time', { ascending: true });
    if (opts.offeringId) query = query.eq('offering_id', opts.offeringId);
    const { data, error } = await query;
    if (error) throw new Error(`officeHours.listSlots: ${error.message}`);
    return (data ?? []).map(mapSlot);
  },

  /**
   * Publish office hours on the existing template table. Capacity is forced
   * to 1 by DB trigger — 1:1 only.
   */
  async createSlot(input: {
    schoolId: string;
    offeringId: string;
    weekday: number;
    startTime: string;
    endTime: string;
    defaultTeacherId?: string | null;
  }): Promise<OfficeHoursSlot> {
    if (input.weekday < 1 || input.weekday > 7) {
      throw new Error('officeHours.createSlot: weekday must be 1 (Mon) … 7 (Sun)');
    }
    if (input.endTime <= input.startTime) {
      throw new Error('officeHours.createSlot: end time must be after start time');
    }
    if (isMockEnv()) throw new Error('officeHours.createSlot: unavailable without live database');
    const { data, error } = await supabase
      .from('online_slot_templates')
      .insert({
        school_id: input.schoolId,
        offering_id: input.offeringId,
        weekday: input.weekday,
        start_time: input.startTime,
        end_time: input.endTime,
        capacity: 1,
        default_teacher_id: input.defaultTeacherId ?? null,
        slot_kind: 'office_hours',
        active: true,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`officeHours.createSlot: ${error?.message ?? 'no row'}`);
    return mapSlot(data);
  },

  /** Student books a 1:1 office-hours slot (same online_bookings table). */
  async requestBooking(input: {
    schoolId: string;
    offeringId: string;
    studentId: string;
    scheduledDate: string;
    startTime: string;
    endTime: string;
    slotTemplateId?: string | null;
  }): Promise<OfficeHoursBooking> {
    if (input.endTime <= input.startTime) {
      throw new Error('officeHours.requestBooking: end time must be after start time');
    }
    if (isMockEnv()) throw new Error('officeHours.requestBooking: unavailable without live database');
    const { data, error } = await supabase
      .from('online_bookings')
      .insert({
        school_id: input.schoolId,
        offering_id: input.offeringId,
        slot_template_id: input.slotTemplateId ?? null,
        student_id: input.studentId,
        scheduled_date: input.scheduledDate,
        start_time: input.startTime,
        end_time: input.endTime,
        status: 'requested',
        booking_purpose: 'office_hours',
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`officeHours.requestBooking: ${error?.message ?? 'no row'}`);
    return mapBooking(data);
  },

  /** Confirm via the EXISTING atomic booking RPC — no parallel path. */
  async confirmBooking(bookingId: string, teacherId: string): Promise<ConfirmedBooking | null> {
    return confirmBooking(bookingId, teacherId);
  },

  async listBookingsForStudent(studentId: string): Promise<OfficeHoursBooking[]> {
    if (isMockEnv()) return [];
    const { data, error } = await supabase
      .from('online_bookings')
      .select('*')
      .eq('student_id', studentId)
      .eq('booking_purpose', 'office_hours')
      .order('scheduled_date', { ascending: true });
    if (error) throw new Error(`officeHours.listBookingsForStudent: ${error.message}`);
    return (data ?? []).map(mapBooking);
  },
};
