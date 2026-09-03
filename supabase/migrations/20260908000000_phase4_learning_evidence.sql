-- ==============================================================================
-- SOMACAMPUS PHASE 4 MIGRATION: TEACHING LOOP & LEARNING EVIDENCE
-- ==============================================================================
-- Establishes the academic evidence loop:
-- Lesson -> Assignment -> Expected Participation & Submission -> Review & Score -> Observation -> Student Profile
-- Enforces:
-- 1. Single source of truth for evidence_track (assignments.evidence_track)
-- 2. Participation status (expected, excused, not_required) vs submission status (pending, submitted, late, missing)
-- 3. Strict subject teacher assignment authorization (Class Teacher != Subject Teacher)
-- 4. Extensible student work references (no hardcoded media pipeline)
-- 5. Durable contextual teacher observations with full provenance
-- 6. Audit logging for authoritative academic score changes

-- 1. ASSIGNMENTS TABLE
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  stream_id UUID REFERENCES streams(id) ON DELETE SET NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  submission_type TEXT NOT NULL CHECK (
    submission_type IN ('classwork', 'homework', 'worksheet', 'quiz', 'project', 'practical')
  ),
  evidence_track TEXT NOT NULL CHECK (
    evidence_track IN ('formal_graded', 'diagnostic_evidence')
  ),
  max_score NUMERIC CHECK (max_score IS NULL OR max_score > 0),
  status TEXT NOT NULL DEFAULT 'published' CHECK (
    status IN ('draft', 'published', 'closed', 'archived')
  ),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_school_class ON assignments(school_id, class_id, stream_id);
CREATE INDEX IF NOT EXISTS idx_assignments_lesson ON assignments(lesson_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON assignments(due_date);

-- 2. STUDENT SUBMISSIONS / PARTICIPATION TABLE
CREATE TABLE IF NOT EXISTS student_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  participation_status TEXT NOT NULL DEFAULT 'expected' CHECK (
    participation_status IN ('expected', 'excused', 'not_required')
  ),
  submission_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    submission_status IN ('pending', 'submitted', 'late', 'missing')
  ),
  submitted_at TIMESTAMPTZ,
  work_type TEXT NOT NULL DEFAULT 'notebook' CHECK (
    work_type IN ('notebook', 'written', 'oral', 'file_reference', 'photo_reference', 'captured_evidence')
  ),
  work_summary TEXT,
  work_reference_location TEXT,
  work_metadata JSONB DEFAULT '{}'::jsonb,
  teacher_review_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (
    teacher_review_status IN ('unreviewed', 'reviewed', 'revision_requested')
  ),
  teacher_feedback TEXT,
  score NUMERIC,
  reviewed_by_teacher_id UUID REFERENCES employees(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_student ON student_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON student_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_school_student ON student_submissions(school_id, student_id);

-- 3. TEACHER OBSERVATIONS TABLE
CREATE TABLE IF NOT EXISTS teacher_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  stream_id UUID REFERENCES streams(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
  observation_type TEXT NOT NULL CHECK (
    observation_type IN ('learning_progress', 'misconception', 'strength', 'support_need', 'participation', 'behaviour')
  ),
  observation_text TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'academic_team' CHECK (
    visibility IN ('academic_team', 'internal_only', 'parent_visible')
  ),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_observations_student ON teacher_observations(student_id);
CREATE INDEX IF NOT EXISTS idx_observations_teacher ON teacher_observations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_observations_lesson ON teacher_observations(lesson_id);

-- 4. ACADEMIC ASSESSMENT AUDIT LOGS
CREATE TABLE IF NOT EXISTS academic_assessment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES student_submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  previous_score NUMERIC,
  new_score NUMERIC,
  changed_by_teacher_id UUID NOT NULL REFERENCES employees(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_submission ON academic_assessment_audit_logs(submission_id);

-- 5. TRIGGER: AUDIT SCORE CORRECTIONS
CREATE OR REPLACE FUNCTION log_academic_score_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (OLD.score IS DISTINCT FROM NEW.score) AND (NEW.score IS NOT NULL) THEN
    INSERT INTO academic_assessment_audit_logs (
      school_id,
      submission_id,
      student_id,
      previous_score,
      new_score,
      changed_by_teacher_id,
      changed_at,
      reason
    ) VALUES (
      NEW.school_id,
      NEW.id,
      NEW.student_id,
      OLD.score,
      NEW.score,
      COALESCE(
        NEW.reviewed_by_teacher_id,
        (SELECT e.id FROM employees e JOIN people p ON p.id = e.person_id WHERE p.auth_user_id = auth.uid() LIMIT 1)
      ),
      now(),
      'Score adjusted by teacher'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_score_correction ON student_submissions;
CREATE TRIGGER trg_log_score_correction
  AFTER UPDATE OF score ON student_submissions
  FOR EACH ROW
  EXECUTE FUNCTION log_academic_score_correction();

-- 6. SECURITY / RLS AUTHORIZATION FUNCTION: ASSIGNMENT CREATION
-- CRITICAL PRODUCT RULE: Class Teacher alone DOES NOT grant assignment creation for unassigned subjects!
-- Creator must be:
--   a) Admin / Principal
--   b) Assigned Subject Teacher in subject_teachers table on assignment date
--   c) Scheduled Teacher for this class/stream/subject in active timetable
CREATE OR REPLACE FUNCTION is_authorised_assignment_creator(
  p_school_id UUID,
  p_class_id UUID,
  p_stream_id UUID,
  p_subject_id UUID,
  p_assigned_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_employee_id UUID;
  v_is_admin_or_principal BOOLEAN := false;
  v_is_subject_teacher BOOLEAN := false;
  v_is_scheduled_teacher BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Check Admin / Principal role (match role.id e.g. 'admin', 'principal')
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id
      AND ur.school_id = p_school_id
      AND (r.id IN ('admin', 'principal') OR r.name IN ('admin', 'principal'))
  ) INTO v_is_admin_or_principal;

  IF v_is_admin_or_principal THEN
    RETURN true;
  END IF;

  -- 2. Find Employee ID
  SELECT e.id INTO v_employee_id
  FROM employees e
  JOIN people p ON p.id = e.person_id
  WHERE p.auth_user_id = v_user_id
    AND e.school_id = p_school_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN false;
  END IF;

  -- 3. Check Subject Teacher assignment
  SELECT EXISTS (
    SELECT 1 FROM subject_teachers st
    WHERE st.school_id = p_school_id
      AND st.teacher_id = v_employee_id
      AND st.class_id = p_class_id
      AND (p_stream_id IS NULL OR st.stream_id IS NULL OR st.stream_id = p_stream_id)
      AND st.subject_id = p_subject_id
      AND st.effective_from <= p_assigned_date
      AND (st.effective_to IS NULL OR st.effective_to >= p_assigned_date)
  ) INTO v_is_subject_teacher;

  IF v_is_subject_teacher THEN
    RETURN true;
  END IF;

  -- 4. Check active timetable schedule
  SELECT EXISTS (
    SELECT 1 FROM timetable_entries te
    JOIN timetables t ON t.id = te.timetable_id
    WHERE te.teacher_id = v_employee_id
      AND te.class_id = p_class_id
      AND (p_stream_id IS NULL OR te.stream_id IS NULL OR te.stream_id = p_stream_id)
      AND te.subject_id = p_subject_id
      AND t.school_id = p_school_id
      AND t.is_active = true
  ) INTO v_is_scheduled_teacher;

  RETURN v_is_scheduled_teacher;
END;
$$;

-- 7. ENABLE ROW LEVEL SECURITY
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_assessment_audit_logs ENABLE ROW LEVEL SECURITY;

-- 8. POLICIES: ASSIGNMENTS
CREATE POLICY assignments_auth_read ON assignments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY assignments_auth_insert ON assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    is_authorised_assignment_creator(school_id, class_id, stream_id, subject_id, assigned_date)
  );

CREATE POLICY assignments_auth_update ON assignments
  FOR UPDATE TO authenticated
  USING (
    is_authorised_assignment_creator(school_id, class_id, stream_id, subject_id, assigned_date)
  )
  WITH CHECK (
    is_authorised_assignment_creator(school_id, class_id, stream_id, subject_id, assigned_date)
  );

-- 9. POLICIES: STUDENT SUBMISSIONS
CREATE POLICY student_submissions_auth_read ON student_submissions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY student_submissions_auth_insert ON student_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_id
        AND is_authorised_assignment_creator(a.school_id, a.class_id, a.stream_id, a.subject_id, a.assigned_date)
    )
  );

CREATE POLICY student_submissions_auth_update ON student_submissions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_id
        AND is_authorised_assignment_creator(a.school_id, a.class_id, a.stream_id, a.subject_id, a.assigned_date)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_id
        AND is_authorised_assignment_creator(a.school_id, a.class_id, a.stream_id, a.subject_id, a.assigned_date)
    )
  );

-- 10. POLICIES: TEACHER OBSERVATIONS
CREATE POLICY teacher_observations_auth_read ON teacher_observations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY teacher_observations_auth_insert ON teacher_observations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id
    ) OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'principal')
    )
  );

CREATE POLICY teacher_observations_auth_update ON teacher_observations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id
    ) OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'principal')
    )
  );

-- 11. POLICIES: AUDIT LOGS
CREATE POLICY academic_assessment_audit_logs_read ON academic_assessment_audit_logs
  FOR SELECT TO authenticated
  USING (true);
