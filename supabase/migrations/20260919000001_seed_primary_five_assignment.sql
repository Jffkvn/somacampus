-- 20260919000001_seed_primary_five_assignment.sql
-- Seeds the Primary 5 Mathematics vertical slice assignment and student submissions
-- for Grace's Cambridge Centre (school_id = '22222222-2222-2222-2222-222222222222')

INSERT INTO public.assignments (
  id,
  school_id,
  teacher_id,
  class_id,
  stream_id,
  subject_id,
  title,
  instructions,
  assigned_date,
  due_date,
  submission_type,
  evidence_track,
  max_score,
  status,
  is_ai_drafted,
  requires_human_approval,
  curriculum_objective_code,
  curriculum_objective_title
)
VALUES (
  'cccccccc-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '99999999-9999-9999-9999-999999999992', -- David Musoke
  '55555555-5555-5555-5555-555555555551', -- Stage 5
  '66666666-6666-6666-6666-666666666661', -- Blue
  '77777777-7777-7777-7777-777777777771', -- Mathematics
  'Primary 5 Fractions Practice (Cambridge 5Nn.01)',
  'Complete exercises 1 to 8 on page 42 of the Cambridge Primary workbook. Show full step-by-step visual fraction models.',
  '2026-09-03',
  '2026-09-08',
  'homework',
  'diagnostic_evidence',
  NULL,
  'published',
  false,
  false,
  '5Nn.01',
  'Understand place value and equivalences in fractions and decimals'
)
ON CONFLICT (id) DO UPDATE SET
  curriculum_objective_code = EXCLUDED.curriculum_objective_code,
  curriculum_objective_title = EXCLUDED.curriculum_objective_title;

INSERT INTO public.student_submissions (
  id,
  school_id,
  assignment_id,
  student_id,
  participation_status,
  submission_status,
  submitted_at,
  work_type,
  work_summary,
  teacher_review_status,
  teacher_feedback,
  score,
  reviewed_by_teacher_id
)
VALUES
  (
    'dddddddd-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'cccccccc-1111-1111-1111-111111111111',
    '22222222-0000-0000-0000-000000000001', -- John Okello
    'expected',
    'submitted',
    '2026-09-03 14:00:00+03',
    'notebook',
    'Workbook Page 42 completed. Struggled with unlike denominators in Q5-Q7.',
    'unreviewed',
    NULL,
    NULL,
    NULL
  ),
  (
    'dddddddd-1111-1111-1111-111111111112',
    '22222222-2222-2222-2222-222222222222',
    'cccccccc-1111-1111-1111-111111111111',
    '22222222-0000-0000-0000-000000000002', -- Grace Achieng
    'expected',
    'submitted',
    '2026-09-03 14:15:00+03',
    'notebook',
    'Exercises 1-8 all attempted with accurate diagrams.',
    'reviewed',
    'Excellent understanding of equivalent fraction diagrams.',
    NULL,
    '99999999-9999-9999-9999-999999999992'
  )
ON CONFLICT (id) DO NOTHING;
