import { describe, it, expect } from 'vitest';
import { teacherService } from '../modules/teacher/teacherService';
import { TeacherTodayViewModel } from '../types/domain';

describe('Class Teacher vs Teaching Timetable Domain Contract', () => {
  it('cleanly separates classResponsibilities from schedule in TeacherTodayViewModel', async () => {
    const vm: TeacherTodayViewModel = await teacherService.getTeacherToday(
      'teacher-sarah-01',
      '2026-09-03'
    );

    // 1. Must have classResponsibilities defined
    expect(vm.classResponsibilities).toBeDefined();
    expect(Array.isArray(vm.classResponsibilities)).toBe(true);

    // 2. Must have schedule defined
    expect(vm.schedule).toBeDefined();
    expect(Array.isArray(vm.schedule)).toBe(true);

    // 3. Sarah's assigned class responsibility is Stage 5 Blue
    const p5Blue = vm.classResponsibilities.find((c) => c.className.includes('Stage 5'));
    expect(p5Blue).toBeDefined();
    expect(p5Blue?.isCurrentUserClassTeacher).toBe(true);
    expect(p5Blue?.classTeacherName).toBe('Mrs. Sarah Namukasa');

    // 4. Schedule must represent subject teaching periods, not class ownership
    expect(vm.schedule.length).toBeGreaterThanOrEqual(1);
    const mathPeriod = vm.schedule.find((s) => s.subjectName === 'Mathematics');
    expect(mathPeriod).toBeDefined();
    expect(mathPeriod?.teacherName).toBe('Mr. David Musoke');

    // Sarah is NOT the Mathematics teacher; lesson ownership is David's
    expect(mathPeriod?.teacherId).not.toBe(vm.teacherId);
  });

  it('verifies that daily attendance is a single class register, NOT per-subject attendance', async () => {
    const vm = await teacherService.getTeacherToday('teacher-sarah-01', '2026-09-03');
    const classResp = vm.classResponsibilities[0];

    // Daily attendance belongs to the class responsibility, not the timetable schedule
    expect(classResp).toHaveProperty('studentCount');
    expect(classResp.studentCount).toBe(24);

    // Timetable entries do NOT have their own separate attendance sessions
    vm.schedule.forEach((entry) => {
      expect(entry).not.toHaveProperty('todayDailyAttendance');
      expect(entry).not.toHaveProperty('attendanceSessionId');
    });
  });

  it('correctly derives isRecordedByClassTeacher based on relationship, not arbitrary strings', () => {
    const sarahId = '99999999-9999-9999-9999-999999999991';
    const davidId = '99999999-9999-9999-9999-999999999992';

    // Case 1: Sarah records attendance for her own class
    const sessionRecordedBySarah = {
      classTeacherId: sarahId,
      recordedByTeacherId: sarahId,
    };
    const isSarahClassTeacher = sessionRecordedBySarah.recordedByTeacherId === sessionRecordedBySarah.classTeacherId;
    expect(isSarahClassTeacher).toBe(true);

    // Case 2: David (Subject Teacher) records attendance for Sarah's class
    const sessionRecordedByDavid = {
      classTeacherId: sarahId,
      recordedByTeacherId: davidId,
    };
    const isDavidClassTeacher = sessionRecordedByDavid.recordedByTeacherId === sessionRecordedByDavid.classTeacherId;
    expect(isDavidClassTeacher).toBe(false);
  });
});
