-- ============================================================================
-- Fix: approve_admission_application wrote to columns that do not exist.
-- Migration: 20260922000000_fix_approve_admission_schema.sql
-- ============================================================================
-- The 20260918000000 redefinition of approve_admission_application inserted:
--   people (school_id, ...)                -> people has NO school_id column
--   students (school_id, ...)              -> students has NO school_id column
--   student_guardians (person_id,
--     is_emergency_contact, is_primary_contact, can_pickup)
--     -> real columns are (guardian_person_id, relationship, is_primary, ...)
-- The older 20260917000000 body used the correct columns. This migration keeps
-- the stricter 18000000 auth gate + class/stream validation verbatim and fixes
-- only the three inserts to match the real schema. Idempotent
-- (CREATE OR REPLACE). No data migration: no approval could ever succeed
-- through the broken body, so no partial rows from this path can exist
-- (placement pre-step lives in admission_applications, unaffected).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_admission_application(p_application_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.admission_applications%ROWTYPE;
  v_year_id UUID;
  v_person_id UUID;
  v_student_id UUID;
  v_adm_no TEXT;
  v_caller_person_id UUID;
  g RECORD;
  v_g_person_id UUID;
  v_g_name TEXT;
  v_g_first TEXT;
  v_g_rest TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'approve_admission_application: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_app
  FROM public.admission_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application % not found', p_application_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'Application % is %, must be pending', p_application_id, v_app.status
      USING ERRCODE = 'P0001';
  END IF;

  -- CRITICAL SECURITY GATE: Bursar is strictly forbidden. Only Admin and Principal can approve admissions.
  IF NOT public.is_admin_or_principal_in_school(v_app.school_id) THEN
    RAISE EXCEPTION 'approve_admission_application: caller is not authorized (admin or principal role required for school %)', v_app.school_id
      USING ERRCODE = '42501';
  END IF;

  IF v_app.class_id IS NULL THEN
    RAISE EXCEPTION 'Application % has no class_id; set a class before approval', p_application_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = v_app.class_id AND c.school_id = v_app.school_id
  ) THEN
    RAISE EXCEPTION 'Application % class % does not belong to school %',
      p_application_id, v_app.class_id, v_app.school_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_app.stream_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.streams s
    JOIN public.classes c ON c.id = s.class_id
    WHERE s.id = v_app.stream_id
      AND c.school_id = v_app.school_id
      AND s.class_id = v_app.class_id
  ) THEN
    RAISE EXCEPTION 'Application % stream % does not belong to class %',
      p_application_id, v_app.stream_id, v_app.class_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT ay.id INTO v_year_id
  FROM public.academic_years ay
  WHERE ay.school_id = v_app.school_id AND ay.is_current = true
  ORDER BY ay.id
  LIMIT 1;

  IF v_year_id IS NULL THEN
    RAISE EXCEPTION 'School % has no active academic year', v_app.school_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT p.id INTO v_caller_person_id
  FROM public.people p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  v_adm_no := public.generate_admission_number(v_app.school_id);

  -- people has NO school_id column: pupil identity only.
  INSERT INTO public.people (
    first_name, last_name, gender, date_of_birth
  ) VALUES (
    v_app.student_first_name,
    v_app.student_last_name,
    v_app.gender,
    v_app.dob
  )
  RETURNING id INTO v_person_id;

  -- students has NO school_id column: school scoping lives on enrolments.
  INSERT INTO public.students (
    person_id, admission_number, admission_date, status
  ) VALUES (
    v_person_id, v_adm_no, CURRENT_DATE, 'active'
  )
  RETURNING id INTO v_student_id;

  INSERT INTO public.student_enrolments (
    student_id, school_id, class_id, stream_id, academic_year_id, status
  ) VALUES (
    v_student_id,
    v_app.school_id,
    v_app.class_id,
    v_app.stream_id,
    v_year_id,
    'active'
  );

  FOR g IN
    SELECT name, relationship, phone, email, is_emergency, is_primary
    FROM public.admission_application_guardians
    WHERE application_id = p_application_id
  LOOP
    v_g_name := trim(g.name);
    IF position(' ' in v_g_name) > 0 THEN
      v_g_first := split_part(v_g_name, ' ', 1);
      v_g_rest  := trim(substr(v_g_name, length(v_g_first) + 1));
    ELSE
      v_g_first := v_g_name;
      v_g_rest  := 'Guardian';
    END IF;

    INSERT INTO public.people (
      first_name, last_name, phone, email
    ) VALUES (
      v_g_first, v_g_rest, g.phone, g.email
    )
    RETURNING id INTO v_g_person_id;

    -- Real columns: guardian_person_id / is_primary (not person_id /
    -- is_emergency_contact / is_primary_contact / can_pickup).
    INSERT INTO public.student_guardians (
      student_id, guardian_person_id, relationship, is_primary
    ) VALUES (
      v_student_id,
      v_g_person_id,
      g.relationship,
      coalesce(g.is_primary, false)
    )
    ON CONFLICT (student_id, guardian_person_id) DO NOTHING;
  END LOOP;

  UPDATE public.admission_applications
  SET status = 'approved',
      reviewed_by = v_caller_person_id,
      reviewed_at = now(),
      approved_student_id = v_student_id
  WHERE id = p_application_id;

  RETURN v_student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_admission_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_admission_application(UUID) TO authenticated;
