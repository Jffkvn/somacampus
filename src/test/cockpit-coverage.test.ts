import { describe, it, expect } from 'vitest';
import { resolveCockpitAttendanceStrip } from '../modules/teaching/cockpitAttendance';

const VIEWER_DAVID = 'teacher-david-id';
const SARAH_ID = 'teacher-sarah-id';

describe('cockpit attendance strip (class-date coverage)', () => {
  it('covered session recorded by Sarah -> recorded strip, not by viewer', () => {
    const strip = resolveCockpitAttendanceStrip(VIEWER_DAVID, 'Sarah Namukasa', {
      covered: true,
      session: {
        id: 'sess-daily-1',
        recorded_by_teacher_id: SARAH_ID,
        recorded_at: '2026-09-03T07:55:00+03:00',
      },
    });
    expect(strip).toEqual({
      state: 'recorded',
      recorderName: 'Sarah Namukasa',
      recordedAt: '2026-09-03T07:55:00+03:00',
      sessionId: 'sess-daily-1',
      isByViewer: false,
    });
  });

  it('no session -> pending strip', () => {
    expect(
      resolveCockpitAttendanceStrip(VIEWER_DAVID, 'Sarah Namukasa', { covered: false, session: null }),
    ).toEqual({ state: 'pending' });
    expect(resolveCockpitAttendanceStrip(VIEWER_DAVID, undefined, { covered: false })).toEqual({
      state: 'pending',
    });
  });
});
