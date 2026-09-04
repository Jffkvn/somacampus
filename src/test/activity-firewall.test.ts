/**
 * SomaCampus Phase 7: Activity Clearance & Teacher Financial Privacy Firewall Test Suite
 *
 * Verifies:
 * - Decoupled operational clearance (Payment != Participation)
 * - "Cleared • Promise to Pay" clearance basis without requiring upfront payment
 * - Teacher Financial Privacy Firewall: getRosterForTeacher() exposes zero monetary figures
 */

import { describe, it, expect } from 'vitest';
import { activityService } from '../modules/activities/activityService';

describe('Activity Clearance & Teacher Privacy Firewall Suite', () => {
  it('allows student clearance on a Promise to Pay basis', async () => {
    const clearance = await activityService.setOperationalClearance({
      schoolId: 'school-default',
      activityId: 'act-swimming',
      studentId: 'stud-brian',
      status: 'cleared',
      basis: 'promise_to_pay',
      validUntil: '2026-09-30',
      operationalNote: 'Parent commitment letter received',
    });

    expect(clearance.status).toBe('cleared');
    expect(clearance.basis).toBe('promise_to_pay');
    expect(clearance.validUntil).toBe('2026-09-30');
  });

  it('guarantees that Teacher Activity Projection contains strictly zero monetary amounts', async () => {
    const roster = await activityService.getRosterForTeacher('act-swimming');
    expect(roster.length).toBeGreaterThan(0);

    for (const participant of roster) {
      expect(participant).toHaveProperty('studentId');
      expect(participant).toHaveProperty('studentName');
      expect(participant).toHaveProperty('className');
      expect(participant).toHaveProperty('clearanceStatus');
      expect(participant).toHaveProperty('clearanceLabel');

      // Strict Firewall Assertions: zero monetary or balance keys allowed in projection
      expect((participant as any).amount).toBeUndefined();
      expect((participant as any).feeAmount).toBeUndefined();
      expect((participant as any).balance).toBeUndefined();
      expect((participant as any).arrears).toBeUndefined();
      expect((participant as any).unpaid).toBeUndefined();
      expect((participant as any).paidAmount).toBeUndefined();
    }

    const aurora = roster.find((p) => p.studentId === 'stud-aurora');
    expect(aurora?.clearanceLabel).toBe('✓ Cleared • Promise to Pay');

    const amari = roster.find((p) => p.studentId === 'stud-amari');
    expect(amari?.clearanceLabel).toBe('✓ Cleared • Paid');
  });
});
