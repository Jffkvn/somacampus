-- ==============================================================================
-- SOMACAMPUS SEED DATA
-- Grace's Cambridge Centre (Pilot Deployment)
-- ==============================================================================

-- 1. Organisation & School
INSERT INTO organisations (id, name, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'Grace Educational Foundation', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schools (id, organisation_id, name, code, brand_color, country, timezone)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Grace''s Cambridge Centre',
  'GCC',
  '#006c8b',
  'UG',
  'Africa/Kampala'
)
ON CONFLICT (code) DO NOTHING;

-- 2. Roles
INSERT INTO roles (id, name, description)
VALUES
  ('admin', 'Administrator', 'Full institutional and technical configuration'),
  ('principal', 'Principal / Director', 'Executive academic and operational oversight'),
  ('teacher', 'Teacher', 'Classroom instruction, attendance, and lesson records'),
  ('bursar', 'Finance / Bursar', 'Fee collection, payment reconciliation, and student accounts'),
  ('parent', 'Parent / Guardian', 'Family dashboard for children progress and fees'),
  ('student', 'Student', 'Learning materials, assignments, and diagnostic quizzes')
ON CONFLICT (id) DO NOTHING;

-- 3. Academic Year & Term
INSERT INTO academic_years (id, school_id, name, start_date, end_date, is_current)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'Academic Year 2026-2027',
  '2026-09-01',
  '2027-07-15',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO terms (id, academic_year_id, name, term_number, start_date, end_date, is_current)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  '33333333-3333-3333-3333-333333333333',
  'Term 1',
  1,
  '2026-09-01',
  '2026-12-18',
  true
)
ON CONFLICT (id) DO NOTHING;

-- 4. Classes & Streams
INSERT INTO classes (id, school_id, name, stage_level)
VALUES
  ('55555555-5555-5555-5555-555555555551', '22222222-2222-2222-2222-222222222222', 'Stage 5', 'Stage 5'),
  ('55555555-5555-5555-5555-555555555552', '22222222-2222-2222-2222-222222222222', 'Stage 6', 'Stage 6')
ON CONFLICT (id) DO NOTHING;

INSERT INTO streams (id, class_id, name, default_room)
VALUES
  ('66666666-6666-6666-6666-666666666661', '55555555-5555-5555-5555-555555555551', 'Blue', 'Classroom 5B'),
  ('66666666-6666-6666-6666-666666666662', '55555555-5555-5555-5555-555555555552', 'Red', 'Classroom 6A')
ON CONFLICT (id) DO NOTHING;

-- 5. Subjects
INSERT INTO subjects (id, school_id, name, code)
VALUES
  ('77777777-7777-7777-7777-777777777771', '22222222-2222-2222-2222-222222222222', 'Mathematics', 'MATH'),
  ('77777777-7777-7777-7777-777777777772', '22222222-2222-2222-2222-222222222222', 'English', 'ENG'),
  ('77777777-7777-7777-7777-777777777773', '22222222-2222-2222-2222-222222222222', 'Science', 'SCI')
ON CONFLICT (id) DO NOTHING;

-- 6. Teacher People & Employees
INSERT INTO people (id, first_name, last_name, email, phone)
VALUES
  ('88888888-8888-8888-8888-888888888881', 'Sarah', 'Namukasa', 'teacher@somacampus.ug', '+256770123456'),
  ('88888888-8888-8888-8888-888888888882', 'David', 'Musoke', 'david.m@graceschool.ac.ug', '+256770123457'),
  ('88888888-8888-8888-8888-888888888883', 'Mary', 'Nabatanzi', 'mary.n@graceschool.ac.ug', '+256770123458'),
  ('88888888-8888-8888-8888-888888888884', 'James', 'Kato', 'james.k@graceschool.ac.ug', '+256770123459'),
  ('88888888-8888-8888-8888-888888888885', 'Paul', 'Mukasa', 'paul.m@graceschool.ac.ug', '+256770123460')
ON CONFLICT (id) DO NOTHING;

INSERT INTO employees (id, person_id, school_id, employee_number, role, department, is_teacher, status)
VALUES
  ('99999999-9999-9999-9999-999999999991', '88888888-8888-8888-8888-888888888881', '22222222-2222-2222-2222-222222222222', 'TCH-001', 'teacher', 'Academics', true, 'active'),
  ('99999999-9999-9999-9999-999999999992', '88888888-8888-8888-8888-888888888882', '22222222-2222-2222-2222-222222222222', 'TCH-002', 'teacher', 'Academics', true, 'active'),
  ('99999999-9999-9999-9999-999999999993', '88888888-8888-8888-8888-888888888883', '22222222-2222-2222-2222-222222222222', 'TCH-003', 'teacher', 'Academics', true, 'active'),
  ('99999999-9999-9999-9999-999999999994', '88888888-8888-8888-8888-888888888884', '22222222-2222-2222-2222-222222222222', 'TCH-004', 'teacher', 'Academics', true, 'active'),
  ('99999999-9999-9999-9999-999999999995', '88888888-8888-8888-8888-888888888885', '22222222-2222-2222-2222-222222222222', 'TCH-005', 'teacher', 'Academics', true, 'active')
ON CONFLICT (school_id, employee_number) DO NOTHING;

-- 7. Class Teachers (Canonical Class / Form Teacher Responsibility)
-- P5 Blue: Sarah Namukasa (Active 2026)
-- P6 Red: James Kato (Active 2026)
-- P5 Blue Historical: Paul Mukasa (Ended 2025-12-31)
INSERT INTO class_teachers (id, school_id, class_id, stream_id, teacher_id, effective_from, effective_to)
VALUES
  ('aaaaaaaa-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', '99999999-9999-9999-9999-999999999991', '2026-01-01', NULL),
  ('aaaaaaaa-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555552', '66666666-6666-6666-6666-666666666662', '99999999-9999-9999-9999-999999999994', '2026-01-01', NULL),
  ('aaaaaaaa-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', '99999999-9999-9999-9999-999999999995', '2025-01-01', '2025-12-31')
ON CONFLICT (id) DO NOTHING;

-- 8. Subject Teachers (Subject Assignments with Date Ranges)
-- P5 Blue:
-- Mathematics = David Musoke
-- English = Mary Nabatanzi
-- Science = James Kato
INSERT INTO subject_teachers (id, school_id, class_id, stream_id, subject_id, teacher_id, effective_from, effective_to)
VALUES
  ('bbbbbbbb-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', '77777777-7777-7777-7777-777777777771', '99999999-9999-9999-9999-999999999992', '2026-01-01', NULL),
  ('bbbbbbbb-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', '77777777-7777-7777-7777-777777777772', '99999999-9999-9999-9999-999999999993', '2026-01-01', NULL),
  ('bbbbbbbb-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', '77777777-7777-7777-7777-777777777773', '99999999-9999-9999-9999-999999999994', '2026-01-01', NULL)
ON CONFLICT (id) DO NOTHING;

-- 9. Timetable & Entries
INSERT INTO timetables (id, school_id, term_id, name, is_active)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444444',
  'Primary Timetable Term 1',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Timetable Entries: each lesson has its actual instructional teacher
-- 08:00 Math -> David Musoke
-- 09:00 English -> Mary Nabatanzi
-- 11:00 Science -> James Kato
INSERT INTO timetable_entries (id, timetable_id, class_id, stream_id, subject_id, teacher_id, room_name, day_of_week, start_time, end_time)
VALUES
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '55555555-5555-5555-5555-555555555551',
    '66666666-6666-6666-6666-666666666661',
    '77777777-7777-7777-7777-777777777771',
    '99999999-9999-9999-9999-999999999992',
    'Lab Block Room 3',
    2,
    '08:00',
    '09:00'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '55555555-5555-5555-5555-555555555551',
    '66666666-6666-6666-6666-666666666661',
    '77777777-7777-7777-7777-777777777772',
    '99999999-9999-9999-9999-999999999993',
    'Classroom 5B',
    2,
    '09:00',
    '10:00'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '55555555-5555-5555-5555-555555555551',
    '66666666-6666-6666-6666-666666666661',
    '77777777-7777-7777-7777-777777777773',
    '99999999-9999-9999-9999-999999999994',
    'Science Lab 1',
    2,
    '11:00',
    '12:00'
  )
ON CONFLICT (id) DO NOTHING;

-- 8. School Calendar Events
INSERT INTO school_calendars (id, school_id, academic_year_id, name)
VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  'School Official Calendar 2026'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO calendar_events (id, school_calendar_id, title, description, event_type, start_datetime, end_datetime, location)
VALUES
  (
    'dddddddd-dddd-dddd-dddd-ddddddddddd1',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Cambridge Primary Staff Briefing',
    'Weekly teacher alignment and curriculum tracking briefing',
    'meeting',
    '2026-09-03 07:45:00+03',
    '2026-09-03 08:00:00+03',
    'Staff Common Room'
  ),
  (
    'dddddddd-dddd-dddd-dddd-ddddddddddd2',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Parents'' Consultation Evening',
    'Term 1 academic and pastoral consultations',
    'assembly',
    '2026-09-03 15:30:00+03',
    '2026-09-03 18:00:00+03',
    'Main Assembly Hall'
  )
ON CONFLICT (id) DO NOTHING;

-- 9. Stage 5 Blue Students & Enrolments
INSERT INTO people (id, first_name, last_name, email)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'John', 'Okello', 'john.o@student.somacampus.ug'),
  ('11111111-0000-0000-0000-000000000002', 'Grace', 'Achieng', 'grace.a@student.somacampus.ug'),
  ('11111111-0000-0000-0000-000000000003', 'Brian', 'Kigozi', 'brian.k@student.somacampus.ug'),
  ('11111111-0000-0000-0000-000000000004', 'Doreen', 'Nalubega', 'doreen.n@student.somacampus.ug'),
  ('11111111-0000-0000-0000-000000000005', 'Emmanuel', 'Sserwadda', 'emmanuel.s@student.somacampus.ug'),
  ('11111111-0000-0000-0000-000000000006', 'Faith', 'Nakato', 'faith.n@student.somacampus.ug'),
  ('11111111-0000-0000-0000-000000000007', 'George William', 'Mukasa', 'george.m@student.somacampus.ug'),
  ('11111111-0000-0000-0000-000000000008', 'Harriet', 'Namatovu', 'harriet.n@student.somacampus.ug')
ON CONFLICT (id) DO NOTHING;

INSERT INTO students (id, person_id, admission_number, status)
VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'GCC-2024-001', 'active'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', 'GCC-2024-002', 'active'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003', 'GCC-2024-003', 'active'),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000004', 'GCC-2024-004', 'active'),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000005', 'GCC-2024-005', 'active'),
  ('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000006', 'GCC-2024-006', 'active'),
  ('22222222-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000007', 'GCC-2024-007', 'active'),
  ('22222222-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000008', 'GCC-2024-008', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO student_enrolments (id, student_id, school_id, academic_year_id, class_id, stream_id, status)
VALUES
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', 'active'),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', 'active'),
  ('33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', 'active'),
  ('33333333-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', 'active'),
  ('33333333-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', 'active'),
  ('33333333-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', 'active'),
  ('33333333-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', 'active'),
  ('33333333-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555551', '66666666-6666-6666-6666-666666666661', 'active')
ON CONFLICT (id) DO NOTHING;

