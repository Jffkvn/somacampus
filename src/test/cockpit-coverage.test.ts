import { describe, it, expect } from 'vitest';
import { resolveCockpitAttendanceStrip, formatCockpitStripMessage } from '../modules/teaching/cockpitAttendance';

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

describe('cockpit strip recorder-name preference', () => {
  it('explicit session recordedByName wins over the classTeacherName param', () => {
    const strip = resolveCockpitAttendanceStrip(VIEWER_DAVID, 'Someone Else', {
      covered: true,
      session: {
        id: 'sess-daily-1',
        recorded_by_teacher_id: SARAH_ID,
        recorded_at: '2026-09-03T07:55:00+03:00',
        recordedByName: 'Sarah Namukasa',
      },
    });
    expect(strip.state === 'recorded' && strip.recorderName).toBe('Sarah Namukasa');
  });

  it('classTeacherName param is used when the session carries no name', () => {
    const strip = resolveCockpitAttendanceStrip(VIEWER_DAVID, 'Sarah Namukasa', {
      covered: true,
      session: {
        id: 'sess-daily-1',
        recorded_by_teacher_id: SARAH_ID,
        recorded_at: '2026-09-03T07:55:00+03:00',
      },
    });
    expect(strip.state === 'recorded' && strip.recorderName).toBe('Sarah Namukasa');
  });

  it("falls back to 'the class teacher' when no name is known", () => {
    const strip = resolveCockpitAttendanceStrip(VIEWER_DAVID, undefined, {
      covered: true,
      session: {
        id: 'sess-daily-1',
        recorded_by_teacher_id: SARAH_ID,
        recorded_at: '2026-09-03T07:55:00+03:00',
        recordedByName: null,
      },
    });
    expect(strip.state === 'recorded' && strip.recorderName).toBe('the class teacher');
  });
});

describe('cockpit strip message', () => {
  it('names the viewer "you" with the HH:MM time', () => {
    expect(
      formatCockpitStripMessage({
        state: 'recorded',
        recorderName: 'David Musoke',
        recordedAt: '2026-09-03T08:05:00+03:00',
        sessionId: 'sess-daily-1',
        isByViewer: true,
      }),
    ).toBe('Daily morning attendance recorded by you at 08:05.');
  });

  it('names another recorder with the HH:MM time', () => {
    expect(
      formatCockpitStripMessage({
        state: 'recorded',
        recorderName: 'Sarah Namukasa',
        recordedAt: '2026-09-03T07:55:00+03:00',
        sessionId: 'sess-daily-1',
        isByViewer: false,
      }),
    ).toBe('Daily morning attendance recorded by Sarah Namukasa at 07:55.');
  });

  it('omits the time when recorded_at is missing (no trailing "at .")', () => {
    const strip = resolveCockpitAttendanceStrip(VIEWER_DAVID, 'Sarah Namukasa', {
      covered: true,
      session: { id: 'sess-daily-1', recorded_by_teacher_id: SARAH_ID },
    });
    expect(strip.state === 'recorded' && strip.recordedAt).toBe('');
    const message = formatCockpitStripMessage(strip);
    expect(message).toBe('Daily morning attendance recorded by Sarah Namukasa.');
    expect(message).not.toContain('at ');
  });

  it('pending strip keeps the not-recorded message', () => {
    expect(formatCockpitStripMessage({ state: 'pending' })).toBe(
      'Daily morning attendance has not been recorded yet.',
    );
  });
});
