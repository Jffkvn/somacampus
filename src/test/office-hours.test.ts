import { describe, it, expect, vi, beforeEach } from 'vitest';

// Force mock-env branch so services return honest empties / throw without DB.
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
  },
}));

import { officeHoursService } from '../modules/online/officeHoursService';

describe('Digital Learning Spine — office hours reuse booking (P1)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('mock env returns honest empty slots (never fake bookings)', async () => {
    const slots = await officeHoursService.listSlots({ schoolId: 's1' });
    expect(slots).toEqual([]);
  });

  it('rejects inverted times and bad weekdays without a second scheduler', async () => {
    await expect(
      officeHoursService.createSlot({
        schoolId: 's1',
        offeringId: 'o1',
        weekday: 2,
        startTime: '14:00',
        endTime: '13:00',
      }),
    ).rejects.toThrow(/end time/i);

    await expect(
      officeHoursService.createSlot({
        schoolId: 's1',
        offeringId: 'o1',
        weekday: 9,
        startTime: '14:00',
        endTime: '15:00',
      }),
    ).rejects.toThrow(/weekday/i);
  });

  it('requestBooking also fails closed on inverted times', async () => {
    await expect(
      officeHoursService.requestBooking({
        schoolId: 's1',
        offeringId: 'o1',
        studentId: 'stu-1',
        scheduledDate: '2026-09-28',
        startTime: '15:00',
        endTime: '15:00',
      }),
    ).rejects.toThrow(/end time/i);
  });
});
