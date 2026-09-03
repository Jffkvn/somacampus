import { describe, it, expect } from 'vitest';
import { teacherService } from '../modules/teacher/teacherService';

describe('Teacher clock-in (teacher_attendance)', () => {
  it('clockIn with a non-UUID placeholder id does not throw and returns a clocked-in stub (mock-fallback)', async () => {
    let result: Awaited<ReturnType<typeof teacherService.clockIn>> | undefined;
    expect(async () => {
      result = await teacherService.clockIn('teacher-sarah-01');
    }).not.toThrow();
    result = await teacherService.clockIn('teacher-sarah-01');
    expect(result.isClockedIn).toBe(true);
    expect(result.clockedInAt).toMatch(/^\d{2}:\d{2}$/);
    expect(['verified_gps', 'verified_manual', 'flagged']).toContain(
      result.verificationMethod
    );
  });

  it("getTeacherToday returns a clockInStatus object with boolean isClockedIn (shape contract)", async () => {
    const vm = await teacherService.getTeacherToday(
      'teacher-sarah-01',
      '2026-09-03'
    );
    expect(vm.clockInStatus).toBeDefined();
    expect(typeof vm.clockInStatus.isClockedIn).toBe('boolean');
  });
});
