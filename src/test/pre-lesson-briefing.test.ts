import { describe, it, expect, vi, beforeEach } from 'vitest';
import { learningIntelligenceService } from '../modules/intelligence/learningIntelligenceService';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// learningIntelligenceService takes its isMockEnv demo path when no
// VITE_SUPABASE_URL is configured; gate on URL presence like the RLS suites.
const hasUrl = Boolean(process.env.VITE_SUPABASE_URL || (import.meta as any).env?.VITE_SUPABASE_URL);

describe.skipIf(!hasUrl)('Pre-Lesson Teacher Briefing ("Before You Teach")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes class briefing strictly to the requested class and subject', async () => {
    const classId = 'class-stage-5';
    const subjectId = 'subj-math';

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'classes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'Stage 5 Blue' } }),
            }),
          }),
        };
      }
      if (table === 'subjects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { name: 'Mathematics' } }),
            }),
          }),
        };
      }
      if (table === 'lessons') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          completed_at: '2026-09-02T10:00:00Z',
                          curriculum_topic: 'Fractions Intro',
                          visible_lesson_note: 'Covered numerator and denominator.',
                          lesson_status: 'completed',
                        },
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'interventions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'iv-1',
                      student_id: 'student-john',
                      reason: 'Struggles with equivalent fractions',
                      learning_area: 'Fractions',
                      students: { people: { first_name: 'John', last_name: 'Okello' } },
                    },
                  ],
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'teacher_observations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'obs-1',
                        student_id: 'student-john',
                        observation_type: 'misconception',
                        observation_text: 'Confusion between 3/4 and 6/8',
                        observed_at: '2026-09-02T10:30:00Z',
                        students: { people: { first_name: 'John', last_name: 'Okello' } },
                      },
                    ],
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'assignments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'asg-1',
                      evidence_track: 'formal_graded',
                      max_score: 100,
                      student_submissions: [{ score: 75, submission_status: 'submitted' }],
                    },
                  ],
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const briefing = await learningIntelligenceService.getPreLessonBriefing(
      classId,
      subjectId,
      'Equivalent Fractions',
    );

    expect(briefing.className).toBe('Stage 5 Blue');
    expect(briefing.subjectName).toBe('Mathematics');
    expect(briefing.curriculumTopic).toBe('Equivalent Fractions');
    expect(briefing.previousLesson?.visibleLessonNote).toBe('Covered numerator and denominator.');
    expect(briefing.studentsNeedingAttention.length).toBe(1);
    expect(briefing.studentsNeedingAttention[0].studentName).toBe('John Okello');
    expect(briefing.suggestedRetrievalFocus.length).toBeGreaterThan(0);
    expect(briefing.suggestedRetrievalFocus[0].evidenceBasis).toContain('observation');
  });
});
