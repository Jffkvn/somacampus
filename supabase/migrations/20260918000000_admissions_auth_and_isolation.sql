-- ==============================================================================
-- Migration: 20260918000000_admissions_auth_and_isolation.sql
-- Module: Core School Operations — Admissions Auth & Tenant Isolation Hardening
--
-- Security guarantees:
-- 1. Introduces is_admin_or_principal_in_school(p_school_id UUID) helper.
-- 2. Redefines approve_admission_application(UUID) to strictly require
--    admin or principal role (bursar is strictly prohibited from approving).
-- 3. Opens admission application intake (INSERT/SELECT) to school staff
--    (receptionists, secretaries, teachers) while restricting status updates/
--    decisions strictly to admin & principal.
-- ==============================================================================

-- 1. Helper function: check if caller has admin or principal role in school
CREATE OR REPLACE FUNCTION public.is_admin_or_principal_in_school(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.school_id = p_school_id
      AND ur.role_id IN ('admin', 'principal')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_or_principal_in_school(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_principal_in_school(UUID) TO authenticated;

-- 2. Update RLS policies on admission_applications
DROP POLICY IF EXISTS admission_applications_leadership_all ON public.admission_applications;
DROP POLICY IF EXISTS admission_applications_staff_select ON public.admission_applications;
DROP POLICY IF EXISTS admission_applications_staff_insert ON public.admission_applications;
DROP POLICY IF EXISTS admission_applications_admin_update ON public.admission_applications;
DROP POLICY IF EXISTS admission_applications_admin_delete ON public.admission_applications;

-- Staff and leadership can view applications for their school
CREATE POLICY admission_applications_staff_select ON public.admission_applications
  FOR SELECT TO authenticated
  USING (
    public.is_staff_in_school(school_id)
    OR public.is_leadership_in_school(school_id)
  );

-- Staff (reception, teachers) and leadership can submit new applications
CREATE POLICY admission_applications_staff_insert ON public.admission_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff_in_school(school_id)
    OR public.is_admin_or_principal_in_school(school_id)
  );

-- Only Admin & Principal can update applications (e.g. mark rejected, change class/stream)
CREATE POLICY admission_applications_admin_update ON public.admission_applications
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_principal_in_school(school_id))
  WITH CHECK (public.is_admin_or_principal_in_school(school_id));

-- Only Admin can delete applications
CREATE POLICY admission_applications_admin_delete ON public.admission_applications
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = admission_applications.school_id
        AND ur.role_id = 'admin'
    )
  );

-- 3. Update RLS policies on admission_application_guardians
DROP POLICY IF EXISTS admission_application_guardians_leadership_all ON public.admission_application_guardians;
DROP POLICY IF EXISTS admission_application_guardians_select ON public.admission_application_guardians;
DROP POLICY IF EXISTS admission_application_guardians_insert ON public.admission_application_guardians;
DROP POLICY IF EXISTS admission_application_guardians_update ON public.admission_application_guardians;
DROP POLICY IF EXISTS admission_application_guardians_delete ON public.admission_application_guardians;

CREATE POLICY admission_application_guardians_select ON public.admission_application_guardians
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admission_applications aa
      WHERE aa.id = admission_application_guardians.application_id
        AND (public.is_staff_in_school(aa.school_id) OR public.is_leadership_in_school(aa.school_id))
    )
  );

CREATE POLICY admission_application_guardians_insert ON public.admission_application_guardians
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admission_applications aa
      WHERE aa.id = admission_application_guardians.application_id
        AND (public.is_staff_in_school(aa.school_id) OR public.is_admin_or_principal_in_school(aa.school_id))
    )
  );

CREATE POLICY admission_application_guardians_update ON public.admission_application_guardians
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admission_applications aa
      WHERE aa.id = admission_application_guardians.application_id
        AND public.is_admin_or_principal_in_school(aa.school_id)
    )
  );

CREATE POLICY admission_application_guardians_delete ON public.admission_application_guardians
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admission_applications aa
      WHERE aa.id = admission_application_guardians.application_id
        AND public.is_admin_or_principal_in_school(aa.school_id)
    )
  );

-- 4. Update RLS policies on admission_application_documents
DROP POLICY IF EXISTS admission_application_documents_leadership_all ON public.admission_application_documents;
DROP POLICY IF EXISTS admission_application_documents_select ON public.admission_application_documents;
DROP POLICY IF EXISTS admission_application_documents_insert ON public.admission_application_documents;
DROP POLICY IF EXISTS admission_application_documents_update ON public.admission_application_documents;
DROP POLICY IF EXISTS admission_application_documents_delete ON public.admission_application_documents;

CREATE POLICY admission_application_documents_select ON public.admission_application_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admission_applications aa
      WHERE aa.id = admission_application_documents.application_id
        AND (public.is_staff_in_school(aa.school_id) OR public.is_leadership_in_school(aa.school_id))
    )
  );

CREATE POLICY admission_application_documents_insert ON public.admission_application_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admission_applications aa
      WHERE aa.id = admission_application_documents.application_id
        AND (public.is_staff_in_school(aa.school_id) OR public.is_admin_or_principal_in_school(aa.school_id))
    )
  );

CREATE POLICY admission_application_documents_update ON public.admission_application_documents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admission_applications aa
      WHERE aa.id = admission_application_documents.application_id
        AND public.is_admin_or_principal_in_school(aa.school_id)
    )
  );

CREATE POLICY admission_application_documents_delete ON public.admission_application_documents
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admission_applications aa
      WHERE aa.id = admission_application_documents.application_id
        AND public.is_admin_or_principal_in_school(aa.school_id)
    )
  );

-- 5. Redefine approve_admission_application to strictly require admin or principal
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

  INSERT INTO public.people (
    school_id, first_name, last_name, gender, date_of_birth
  ) VALUES (
    v_app.school_id,
    v_app.student_first_name,
    v_app.student_last_name,
    v_app.gender,
    v_app.dob
  )
  RETURNING id INTO v_person_id;

  INSERT INTO public.students (
    school_id, person_id, admission_number, status
  ) VALUES (
    v_app.school_id, v_person_id, v_adm_no, 'active'
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
      school_id, first_name, last_name, phone, email
    ) VALUES (
      v_app.school_id, v_g_first, v_g_rest, g.phone, g.email
    )
    RETURNING id INTO v_g_person_id;

    INSERT INTO public.student_guardians (
      student_id, person_id, relationship,
      is_emergency_contact, is_primary_contact, can_pickup
    ) VALUES (
      v_student_id,
      v_g_person_id,
      g.relationship,
      coalesce(g.is_emergency, false),
      coalesce(g.is_primary, false),
      true
    );
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
