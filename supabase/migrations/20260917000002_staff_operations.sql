-- ==============================================================================
-- Migration: 20260917000002_staff_operations.sql
-- Module: SomaCampus Core School Operations — Slice 1 Task 4
--
-- Purpose:
--   1. Add exit_reason and notes to employees table for audit-proof staff offboarding.
--   2. Atomic RPC hire_staff_member: Leadership hires a staff member, creating
--      person, employee record, and initial official subject appointments atomically.
--   3. Atomic RPC exit_staff_member: Leadership offboards a staff member, recording
--      exit date and exit reason without destroying historical payroll, lesson, or
--      attendance records.
--   4. Atomic RPC appoint_teacher_subject: Leadership officially appoints a teacher
--      to a curriculum subject.
--   5. Row-level security write policies for employees and people.
-- ==============================================================================

-- 1. ADD EXIT REASON TO EMPLOYEES
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS exit_reason TEXT
    CHECK (exit_reason IS NULL OR exit_reason IN ('resigned', 'contract_ended', 'retired', 'terminated', 'dismissed', 'other')),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ------------------------------------------------------------------------------
-- 2. RPC: hire_staff_member
-- Creates person, employee row, and optional official subjects in a single transaction.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hire_staff_member(
  p_school_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_date_of_birth DATE DEFAULT NULL,
  p_gender TEXT DEFAULT NULL,
  p_national_id TEXT DEFAULT NULL,
  p_nationality TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'teacher',
  p_department TEXT DEFAULT 'Academics',
  p_is_teacher BOOLEAN DEFAULT true,
  p_hire_date DATE DEFAULT CURRENT_DATE,
  p_contract_type TEXT DEFAULT 'permanent',
  p_qualification TEXT DEFAULT NULL,
  p_employee_number TEXT DEFAULT NULL,
  p_subject_ids UUID[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID;
  v_person_id UUID;
  v_employee_id UUID;
  v_emp_number TEXT;
  v_count INT;
  v_subject_id UUID;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Verify caller is school leadership (admin or principal)
  IF NOT public.is_leadership_in_school(p_school_id) THEN
    RAISE EXCEPTION 'Only school leadership can hire staff'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_first_name IS NULL OR trim(p_first_name) = '' OR p_last_name IS NULL OR trim(p_last_name) = '' THEN
    RAISE EXCEPTION 'First name and last name are required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Determine or generate unique employee number
  IF p_employee_number IS NOT NULL AND trim(p_employee_number) <> '' THEN
    v_emp_number := trim(p_employee_number);
    IF EXISTS (
      SELECT 1 FROM public.employees
      WHERE school_id = p_school_id AND employee_number = v_emp_number
    ) THEN
      RAISE EXCEPTION 'Employee number % already exists in this school', v_emp_number
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT count(*) + 1 INTO v_count
    FROM public.employees
    WHERE school_id = p_school_id;
    v_emp_number := 'EMP-' || to_char(COALESCE(p_hire_date, CURRENT_DATE), 'YYYY') || '-' || lpad(v_count::text, 4, '0');
    -- Ensure unique in case of existing collisions
    WHILE EXISTS (SELECT 1 FROM public.employees WHERE school_id = p_school_id AND employee_number = v_emp_number) LOOP
      v_count := v_count + 1;
      v_emp_number := 'EMP-' || to_char(COALESCE(p_hire_date, CURRENT_DATE), 'YYYY') || '-' || lpad(v_count::text, 4, '0');
    END LOOP;
  END IF;

  -- 1. Create person record
  INSERT INTO public.people (
    first_name,
    last_name,
    email,
    phone,
    date_of_birth,
    gender,
    national_id,
    nationality,
    address
  ) VALUES (
    trim(p_first_name),
    trim(p_last_name),
    nullif(trim(p_email), ''),
    nullif(trim(p_phone), ''),
    p_date_of_birth,
    nullif(trim(p_gender), ''),
    nullif(trim(p_national_id), ''),
    nullif(trim(p_nationality), ''),
    nullif(trim(p_address), '')
  ) RETURNING id INTO v_person_id;

  -- 2. Create employee record
  INSERT INTO public.employees (
    person_id,
    school_id,
    employee_number,
    role,
    department,
    is_teacher,
    status,
    hire_date,
    contract_type,
    qualification
  ) VALUES (
    v_person_id,
    p_school_id,
    v_emp_number,
    COALESCE(nullif(trim(p_role), ''), 'teacher'),
    COALESCE(nullif(trim(p_department), ''), 'Academics'),
    COALESCE(p_is_teacher, true),
    'active',
    COALESCE(p_hire_date, CURRENT_DATE),
    COALESCE(nullif(trim(p_contract_type), ''), 'permanent'),
    nullif(trim(p_qualification), '')
  ) RETURNING id INTO v_employee_id;

  -- 3. Appoint initial official teaching subjects if provided
  IF p_is_teacher AND p_subject_ids IS NOT NULL AND array_length(p_subject_ids, 1) > 0 THEN
    FOREACH v_subject_id IN ARRAY p_subject_ids LOOP
      IF EXISTS (SELECT 1 FROM public.subjects WHERE id = v_subject_id AND school_id = p_school_id) THEN
        INSERT INTO public.teacher_official_subjects (
          school_id,
          teacher_id,
          subject_id,
          appointed_at
        ) VALUES (
          p_school_id,
          v_employee_id,
          v_subject_id,
          COALESCE(p_hire_date, CURRENT_DATE)
        ) ON CONFLICT (school_id, teacher_id, subject_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN v_employee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hire_staff_member(UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, DATE, TEXT, TEXT, TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hire_staff_member(UUID, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, DATE, TEXT, TEXT, TEXT, UUID[]) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. RPC: exit_staff_member
-- Closes employment cleanly with exit date and reason; strictly preserves history.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exit_staff_member(
  p_employee_id UUID,
  p_exit_date DATE DEFAULT CURRENT_DATE,
  p_exit_reason TEXT DEFAULT 'other',
  p_status TEXT DEFAULT 'terminated'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID;
  v_school_id UUID;
  v_status TEXT;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT school_id INTO v_school_id
  FROM public.employees
  WHERE id = p_employee_id;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Employee not found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_leadership_in_school(v_school_id) THEN
    RAISE EXCEPTION 'Only school leadership can record staff exit'
      USING ERRCODE = 'P0001';
  END IF;

  v_status := COALESCE(p_status, 'terminated');
  IF v_status NOT IN ('terminated', 'on_leave') THEN
    v_status := 'terminated';
  END IF;

  UPDATE public.employees
  SET status = v_status,
      exit_date = COALESCE(p_exit_date, CURRENT_DATE),
      exit_reason = COALESCE(p_exit_reason, 'other')
  WHERE id = p_employee_id;

  RETURN p_employee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.exit_staff_member(UUID, DATE, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exit_staff_member(UUID, DATE, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. RPC: appoint_teacher_subject
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.appoint_teacher_subject(
  p_school_id UUID,
  p_teacher_id UUID,
  p_subject_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID;
  v_id UUID;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_leadership_in_school(p_school_id) THEN
    RAISE EXCEPTION 'Only school leadership can appoint official teaching subjects'
      USING ERRCODE = 'P0001';
  END IF;

  -- Verify teacher and subject belong to school
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_teacher_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'Teacher % does not belong to school %', p_teacher_id, p_school_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = p_subject_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'Subject % does not belong to school %', p_subject_id, p_school_id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.teacher_official_subjects (
    school_id,
    teacher_id,
    subject_id,
    appointed_at,
    notes
  ) VALUES (
    p_school_id,
    p_teacher_id,
    p_subject_id,
    CURRENT_DATE,
    nullif(trim(p_notes), '')
  )
  ON CONFLICT (school_id, teacher_id, subject_id)
  DO UPDATE SET
    notes = EXCLUDED.notes,
    appointed_at = CURRENT_DATE
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.appoint_teacher_subject(UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.appoint_teacher_subject(UUID, UUID, UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. RLS WRITE POLICIES FOR EMPLOYEES AND PEOPLE
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS employees_leadership_update ON public.employees;
CREATE POLICY employees_leadership_update ON public.employees
  FOR UPDATE TO authenticated
  USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

DROP POLICY IF EXISTS employees_leadership_insert ON public.employees;
CREATE POLICY employees_leadership_insert ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (public.is_leadership_in_school(school_id));

DROP POLICY IF EXISTS people_leadership_update ON public.people;
CREATE POLICY people_leadership_update ON public.people
  FOR UPDATE TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.person_id = people.id
        AND public.is_leadership_in_school(e.school_id)
    )
  )
  WITH CHECK (
    auth_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.person_id = people.id
        AND public.is_leadership_in_school(e.school_id)
    )
  );
