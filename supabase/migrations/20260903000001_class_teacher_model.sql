-- ==============================================================================
-- SOMACAMPUS MIGRATION: CLASS TEACHER & DAILY ATTENDANCE MODEL
-- Migration ID: 20260903000001
-- ==============================================================================

-- 1. Ensure btree_gist extension for date range exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. CLASS TEACHERS TABLE (Canonical Form / Class Teacher Responsibility)
-- Enforces: Every active class/stream has designated Class Teacher responsible for daily attendance.
-- Strict exclusion constraint guarantees non-overlapping date ranges for the same class/stream.
CREATE TABLE IF NOT EXISTS class_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  stream_id UUID REFERENCES streams(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  -- Exclusion constraint preventing overlapping active date ranges for the same stream
  CONSTRAINT no_overlapping_stream_class_teachers
    EXCLUDE USING gist (
      stream_id WITH =,
      daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    ) WHERE (stream_id IS NOT NULL),
  -- Exclusion constraint for unstreamed classes
  CONSTRAINT no_overlapping_class_class_teachers
    EXCLUDE USING gist (
      class_id WITH =,
      daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    ) WHERE (stream_id IS NULL)
);

-- 3. SUBJECT TEACHERS TABLE (Subject Assignment with Date Ranges)
-- Separate from Class Teacher responsibility and timetable occurrences.
CREATE TABLE IF NOT EXISTS subject_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  stream_id UUID REFERENCES streams(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT no_overlapping_stream_subject_teachers
    EXCLUDE USING gist (
      stream_id WITH =,
      subject_id WITH =,
      daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    ) WHERE (stream_id IS NOT NULL)
);

-- 4. REFACTOR STUDENT ATTENDANCE SESSIONS & RECORDS FOR DAILY ATTENDANCE MODEL
-- Crucial rule: ATTENDANCE != LESSON ATTENDANCE
-- Exactly ONE daily attendance record per class/stream per date.
ALTER TABLE student_attendance_sessions
  ALTER COLUMN teacher_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS class_teacher_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS recorded_by_teacher_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS contextual_timetable_entry_id UUID REFERENCES timetable_entries(id);

-- Also ensure stream_id exists on student_attendance_records for direct stream queries
ALTER TABLE student_attendance_records
  ADD COLUMN IF NOT EXISTS stream_id UUID REFERENCES streams(id) ON DELETE SET NULL;

-- Backfill recorded_by_teacher_id if null
UPDATE student_attendance_sessions
SET recorded_by_teacher_id = teacher_id
WHERE recorded_by_teacher_id IS NULL;

-- Enforce exactly ONE daily attendance event per stream/date
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_daily_attendance_per_stream
  ON student_attendance_sessions (class_id, stream_id, date)
  WHERE stream_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_daily_attendance_per_class
  ON student_attendance_sessions (class_id, date)
  WHERE stream_id IS NULL;

-- 5. ATTENDANCE AUDIT LOG TABLE (Audit trail for status corrections)
CREATE TABLE IF NOT EXISTS student_attendance_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id UUID NOT NULL REFERENCES student_attendance_records(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES student_attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL CHECK (previous_status IN ('present', 'absent', 'late', 'excused')),
  new_status TEXT NOT NULL CHECK (new_status IN ('present', 'absent', 'late', 'excused')),
  changed_by_teacher_id UUID NOT NULL REFERENCES employees(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. ATTENDANCE CORRECTION TRIGGER
-- Automatically logs correction when a record's status changes
CREATE OR REPLACE FUNCTION log_attendance_record_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO student_attendance_audit_logs (
      attendance_record_id,
      session_id,
      student_id,
      previous_status,
      new_status,
      changed_by_teacher_id,
      changed_at,
      reason
    ) VALUES (
      NEW.id,
      NEW.session_id,
      NEW.student_id,
      OLD.status,
      NEW.status,
      COALESCE(NEW.corrected_by, NEW.recorded_by),
      COALESCE(NEW.corrected_at, now()),
      COALESCE(NEW.correction_reason, 'Status correction updated')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_attendance_correction ON student_attendance_records;
CREATE TRIGGER trg_log_attendance_correction
  AFTER UPDATE OF status ON student_attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION log_attendance_record_correction();

-- 7. SECURITY / RLS AUTHORIZATION FUNCTIONS
-- Checks whether an authenticated user is authorised to record/update daily attendance:
-- 1) Admin / Principal
-- 2) Active Class Teacher on attendance date
-- 3) Assigned Subject Teacher for this class/stream on attendance date
-- 4) Teacher scheduled for this class/stream on this day
CREATE OR REPLACE FUNCTION is_authorised_daily_attendance_recorder(
  p_school_id UUID,
  p_class_id UUID,
  p_stream_id UUID,
  p_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_employee_id UUID;
  v_role TEXT;
  v_is_class_teacher BOOLEAN := false;
  v_is_subject_teacher BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Leadership bypass (Admin / Principal)
  SELECT r.id INTO v_role
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_user_id AND r.id IN ('admin', 'principal')
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    RETURN true;
  END IF;

  -- 2. Find employee ID for authenticated user
  SELECT e.id INTO v_employee_id
  FROM employees e
  JOIN people p ON p.id = e.person_id
  WHERE p.auth_user_id = v_user_id AND e.school_id = p_school_id AND e.status = 'active'
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN false;
  END IF;

  -- 3. Check if active Class Teacher on p_date
  SELECT true INTO v_is_class_teacher
  FROM class_teachers ct
  WHERE ct.school_id = p_school_id
    AND ct.class_id = p_class_id
    AND (p_stream_id IS NULL OR ct.stream_id IS NULL OR ct.stream_id = p_stream_id)
    AND ct.teacher_id = v_employee_id
    AND ct.effective_from <= p_date
    AND (ct.effective_to IS NULL OR ct.effective_to >= p_date)
  LIMIT 1;

  IF v_is_class_teacher THEN
    RETURN true;
  END IF;

  -- 4. Check if assigned Subject Teacher for this class/stream active on p_date
  SELECT true INTO v_is_subject_teacher
  FROM subject_teachers st
  WHERE st.school_id = p_school_id
    AND st.class_id = p_class_id
    AND (p_stream_id IS NULL OR st.stream_id IS NULL OR st.stream_id = p_stream_id)
    AND st.teacher_id = v_employee_id
    AND st.effective_from <= p_date
    AND (st.effective_to IS NULL OR st.effective_to >= p_date)
  LIMIT 1;

  IF v_is_subject_teacher THEN
    RETURN true;
  END IF;

  -- 5. Check if scheduled teacher on active timetable for this class/stream
  IF EXISTS (
    SELECT 1 FROM timetable_entries te
    JOIN timetables t ON t.id = te.timetable_id
    WHERE t.school_id = p_school_id
      AND t.is_active = true
      AND te.class_id = p_class_id
      AND (p_stream_id IS NULL OR te.stream_id IS NULL OR te.stream_id = p_stream_id)
      AND te.teacher_id = v_employee_id
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE class_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_attendance_audit_logs ENABLE ROW LEVEL SECURITY;

-- Read policies
CREATE POLICY class_teachers_auth_read ON class_teachers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY subject_teachers_auth_read ON subject_teachers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY student_attendance_audit_logs_read ON student_attendance_audit_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY student_attendance_sessions_auth_read ON student_attendance_sessions
  FOR SELECT TO authenticated USING (true);

-- Base read policies for supporting tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'streams_auth_read') THEN
    CREATE POLICY streams_auth_read ON streams FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'people_auth_read') THEN
    CREATE POLICY people_auth_read ON people FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'employees_auth_read') THEN
    CREATE POLICY employees_auth_read ON employees FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_roles_auth_read') THEN
    CREATE POLICY user_roles_auth_read ON user_roles FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Drop old broad attendance policies
DROP POLICY IF EXISTS student_attendance_records_insert ON student_attendance_records;
DROP POLICY IF EXISTS student_attendance_records_update ON student_attendance_records;

-- New strict RLS on student_attendance_sessions
CREATE POLICY student_attendance_sessions_auth_insert ON student_attendance_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_authorised_daily_attendance_recorder(school_id, class_id, stream_id, date)
  );

CREATE POLICY student_attendance_sessions_auth_update ON student_attendance_sessions
  FOR UPDATE TO authenticated
  USING (
    is_authorised_daily_attendance_recorder(school_id, class_id, stream_id, date)
  )
  WITH CHECK (
    is_authorised_daily_attendance_recorder(school_id, class_id, stream_id, date)
  );

-- New strict RLS on student_attendance_records
CREATE POLICY student_attendance_records_auth_insert ON student_attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (
    is_authorised_daily_attendance_recorder(school_id, class_id, stream_id, date)
  );

CREATE POLICY student_attendance_records_auth_update ON student_attendance_records
  FOR UPDATE TO authenticated
  USING (
    is_authorised_daily_attendance_recorder(school_id, class_id, stream_id, date)
  )
  WITH CHECK (
    is_authorised_daily_attendance_recorder(school_id, class_id, stream_id, date)
  );

-- Strict Lesson Ownership Policy:
-- Actual lesson teacher owns their lesson; Class Teacher does NOT automatically own other teachers' lessons.
DROP POLICY IF EXISTS lessons_insert_policy ON lessons;
CREATE POLICY lessons_insert_policy ON lessons
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid() AND e.id = teacher_id
    ) OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.id IN ('admin', 'principal')
    )
  );
