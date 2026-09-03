import { describe, it, expect } from 'vitest';
import { toDayOfWeek, toHHMM } from '../modules/teacher/scheduleUtils';
import { teacherService } from '../modules/teacher/teacherService';

describe('teacher live schedule helpers (Task 3 RED)', () => {
  it('maps ISO dates to Mon1..Sun7 day_of_week', () => {
    // 2026-09-03 is a Thursday -> 4
    expect(toDayOfWeek('2026-09-03')).toBe(4);
    // 2026-09-07 is a Monday -> 1
    expect(toDayOfWeek('2026-09-07')).toBe(1);
    // 2026-09-06 is a Sunday -> 7
    expect(toDayOfWeek('2026-09-06')).toBe(7);
    // 2026-09-05 is a Saturday -> 6
    expect(toDayOfWeek('2026-09-05')).toBe(6);
  });

  it('extracts HH:MM from TIME columns', () => {
    expect(toHHMM('08:00:00')).toBe('08:00');
    expect(toHHMM('13:05:00')).toBe('13:05');
    expect(toHHMM('09:00')).toBe('09:00');
  });
});

describe('teacher mock-branch schedule characterization (Task 3)', () => {
  it('mock branch still serves the Mathematics period owned by David', async () => {
    const vm = await teacherService.getTeacherToday('teacher-sarah-01', '2026-09-03');
    expect(vm.schedule.length).toBeGreaterThanOrEqual(1);
    const mathPeriod = vm.schedule.find((s) => s.subjectName === 'Mathematics');
    expect(mathPeriod).toBeDefined();
    expect(mathPeriod?.teacherName).toBe('Mr. David Musoke');
    // Schedule entries carry no daily-attendance props (those live on classResponsibilities)
    vm.schedule.forEach((entry) => {
      expect(entry).not.toHaveProperty('todayDailyAttendance');
      expect(entry).not.toHaveProperty('attendanceSessionId');
    });
  });
});
