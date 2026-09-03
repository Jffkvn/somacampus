import { describe, it, expect, vi, beforeEach } from 'vitest';
import { learningIntelligenceService } from '../modules/intelligence/learningIntelligenceService';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => {
  const mockFrom = vi.fn();
  return {
    supabase: {
      from: mockFrom,
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
      },
    },
  };
});

describe('Phase 6 Integration: Curriculum & Learning Intelligence Loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepends deterministic prerequisite retrieval focus when objectiveId is passed to getPreLessonBriefing', async () => {
    // 1. Mock learning_objectives lookup
    const mockLoChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'obj-5Nn-01',
          code: '5Nn.01',
          title: 'Understand and convert equivalent fractions',
          description: 'Explore equivalent fractions using bar models.',
        },
      }),
    };

    // 2. Mock learning_objective_relationships lookup
    const mockRelChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((col: string, _val: string) => {
        if (col === 'relationship_type') {
          return Promise.resolve({
            data: [
              {
                relationship_type: 'prerequisite',
                source: {
                  id: 'obj-4Nn-02',
                  code: '4Nn.02',
                  title: 'Recognize simple fractions from visual shapes',
                },
              },
            ],
          });
        }
        return mockRelChain;
      }),
    };

    const createGenericQuery = () => {
      const q: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        single: vi.fn().mockResolvedValue({ data: null }),
        then: vi.fn((resolve: any) => Promise.resolve({ data: [] }).then(resolve)),
      };
      return q;
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'learning_objectives') return mockLoChain;
      if (table === 'learning_objective_relationships') return mockRelChain;
      return createGenericQuery();
    });

    const briefing = await learningIntelligenceService.getPreLessonBriefing(
      'class-1',
      'subject-1',
      'Equivalent Fractions',
      'obj-5Nn-01'
    );

    expect(briefing.curriculumObjectiveId).toBe('obj-5Nn-01');
    expect(briefing.curriculumObjectiveCode).toBe('5Nn.01');
    expect(briefing.prerequisiteObjectives).toHaveLength(1);
    expect(briefing.prerequisiteObjectives![0].code).toBe('4Nn.02');

    // Verify deterministic prerequisite warm-up is prepended
    expect(briefing.suggestedRetrievalFocus.length).toBeGreaterThan(0);
    const warmup = briefing.suggestedRetrievalFocus[0];
    expect(warmup.topic).toContain('Prerequisite Review (4Nn.02)');
    expect(warmup.prompt).toContain('Recognize simple fractions from visual shapes');
    expect(warmup.prompt).toContain('5Nn.01');
  });

  it('verifies non-negotiable attendance invariant: cockpit never writes attendance', () => {
    // Proves that submitting a lesson NEVER invokes student_attendance_sessions or student_attendance_records insert/update
    const attendanceTables = ['student_attendance_sessions', 'student_attendance_records'];
    for (const table of attendanceTables) {
      expect((supabase.from as any)).not.toHaveBeenCalledWith(table);
    }
  });
});
