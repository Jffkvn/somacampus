import { describe, it, expect } from 'vitest';
import { teacherService } from '../modules/teacher/teacherService';

describe('Teacher clock-in (teacher_attendance)', () => {
  it('clockIn with a non-UUID placeholder id resolves a clocked-in stub (mock-fallback)', async () => {
    await expect(teacherService.clockIn('teacher-sarah-01')).resolves.toMatchObject(
      { isClockedIn: true }
    );
    const res = await teacherService.clockIn('teacher-sarah-01');
    expect(res.clockedInAt).toMatch(/^\d{2}:\d{2}$/);
    expect(['verified_gps', 'verified_manual', 'flagged']).toContain(
      res.verificationMethod
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
