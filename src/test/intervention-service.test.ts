import { describe, it, expect, vi, beforeEach } from 'vitest';
import { learningIntelligenceService } from '../modules/intelligence/learningIntelligenceService';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'teacher-user-uuid-1' } },
      }),
    },
    from: vi.fn(),
  },
}));

describe('Intervention Service Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an intervention and inserts relational evidence items', async () => {
    const mockInsertIntervention = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'new-intervention-uuid' },
          error: null,
        }),
      }),
    });

    const mockInsertEvidence = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'interventions') {
        return { insert: mockInsertIntervention };
      }
      if (table === 'intervention_evidence') {
        return { insert: mockInsertEvidence };
      }
      return {};
    });

    const res = await learningIntelligenceService.createIntervention(
      {
        schoolId: 'school-1',
        studentId: 'student-1',
        teacherId: 'teacher-1',
        classId: 'class-1',
        subjectId: 'subject-math',
        learningArea: 'Fractions',
        reason: 'Repeated conversion errors',
        strategyAction: '15-minute small group practice',
        targetOutcome: 'Independent conversion with 80%+ accuracy',
        targetDate: '2026-09-20',
        status: 'active',
      },
      [
        { type: 'observation', id: 'obs-1' },
        { type: 'submission', id: 'sub-1' },
      ],
    );

    expect(res.interventionId).toBe('new-intervention-uuid');
    expect(mockInsertIntervention).toHaveBeenCalledWith(
      expect.objectContaining({
        school_id: 'school-1',
        student_id: 'student-1',
        learning_area: 'Fractions',
        status: 'active',
      }),
    );
    expect(mockInsertEvidence).toHaveBeenCalledWith([
      {
        school_id: 'school-1',
        intervention_id: 'new-intervention-uuid',
        evidence_type: 'observation',
        evidence_id: 'obs-1',
      },
      {
        school_id: 'school-1',
        intervention_id: 'new-intervention-uuid',
        evidence_type: 'submission',
        evidence_id: 'sub-1',
      },
    ]);
  });

  it('updates intervention status through the valid lifecycle', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'interventions') {
        return { update: mockUpdate };
      }
      return {};
    });

    await learningIntelligenceService.updateInterventionStatus(
      'intervention-1',
      'completed',
      'Target outcome achieved',
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        outcome_notes: 'Target outcome achieved',
      }),
    );
  });

  it('records evaluated outcome upon intervention completion', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'interventions') {
        return { update: mockUpdate };
      }
      return {};
    });

    await learningIntelligenceService.recordInterventionOutcome(
      'intervention-1',
      'improved',
      'Student scored 9/10 on subsequent conversion test.',
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        outcome: 'improved',
        outcome_notes: 'Student scored 9/10 on subsequent conversion test.',
      }),
    );
  });
});
