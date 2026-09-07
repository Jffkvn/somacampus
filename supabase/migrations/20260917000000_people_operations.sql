-- ==============================================================================
-- Migration: 20260917000000_people_operations.sql
-- Description:
--   Slice 1 Task 1 (people operations schema): extends people/employees,
--   student medical + emergency contacts, per-school admission counters and a
--   reception admissions pipeline (applications -> approve RPC), reusable
--   student/staff document tables, and private document storage buckets.
--
--   Verified against 20260903000000_somacampus_core_schema.sql:
--     people(id, auth_user_id NULL, first_name, last_name, email, phone,
--       photo_url); students(id, person_id CASCADE, admission_number GLOBAL
--       UNIQUE, admission_date, status); employees(id, person_id CASCADE,
--       school_id CASCADE, employee_number, role, department, is_teacher,
--       status, UNIQUE(school_id, employee_number));
--     student_guardians(id, student_id CASCADE, guardian_person_id CASCADE,
--       relationship free text, is_primary, UNIQUE(student, guardian));
--     student_enrolments(student, school, class, stream NULL, academic_year,
--       status, UNIQUE(student, academic_year)).
--   RLS helpers reused (not redefined): public.is_staff_in_school(UUID),
--     public.is_leadership_in_school(UUID) (role_id admin/principal/bursar,
--     see 20260916000001), public.current_employee_id_for_school(UUID),
--     public.current_guardian_student_ids_for_school(UUID).
--   Storage: daemon enabled, ZERO buckets and ZERO storage.objects policies
--     in the repo (verified by grep); config.toml carries only the commented
--     [storage.buckets.images] example, so buckets are seeded here via
--     INSERT INTO storage.buckets ... ON CONFLICT DO NOTHING.
--
--   Idempotent: ALTER ... ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT
--     EXISTS / DROP POLICY IF EXISTS before each CREATE / CREATE OR REPLACE
--     for functions and view (view is dropped first so column changes apply).
--
--   DELIBERATE DEVIATIONS / DECISIONS (documented):
--   D1. No 'reception' role exists (seed roles: admin, principal, teacher,
--       bursar, parent, student). Admission pipeline read/insert uses the
--       leadership predicate (admin/principal/bursar) instead.
--   D2. No 'matron' role exists. Full student_medical access is
--       admin/principal ONLY (bursar excluded via an inline role check
--       rather than is_leadership_in_school); teachers read allergy alerts
--       only via the student_medical_alerts view.
--   D3. The task references a doc_type CHECK "per spec list" but no list is
--       given; chosen lists are documented on each table below.
--   D4. Postgres does not support RLS policies on plain views, so the
--       "alerts view SELECT policy" is implemented as an authorization
--       predicate embedded in the view (security_invoker=false, owner
--       bypasses base RLS) + GRANT SELECT TO authenticated only.
--   D5. approve_admission_application(p_id) resolves the enrolment academic
--       year from the school's is_current year (raises if none) and requires
--       class_id to be set on the application at approve time.
--   D6. admission_counters prefix defaults to schools.code, fallback 'ADM'.
--   D7. Storage path convention '<school_id>/<owner_id>/<file>'; school
--       comparison is done as TEXT (school_id::text vs foldername[1]) so a
--       malformed path denies instead of raising a uuid cast error.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. people += demographics (NO medical/emergency columns on people)
-- ------------------------------------------------------------------------------
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female', 'other')),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS national_id TEXT;

-- ------------------------------------------------------------------------------
-- 2. employees += employment details
-- ------------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS hire_date DATE,
  ADD COLUMN IF NOT EXISTS exit_date DATE,
  ADD COLUMN IF NOT EXISTS contract_type TEXT,
  ADD COLUMN IF NOT EXISTS qualification TEXT;

-- ------------------------------------------------------------------------------
-- 3. student_medical (one row per student) + student_emergency_contacts
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_medical (
  student_id UUID PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  allergies TEXT,
  conditions TEXT,
  medication TEXT,
  blood_group TEXT,
  restrictions TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 1,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_emergency_contacts_student_idx
  ON public.student_emergency_contacts (student_id);

ALTER TABLE public.student_medical ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_emergency_contacts ENABLE ROW LEVEL SECURITY;

-- -- student_medical: FULL access admin/principal only (bursar excluded, D2) --
DROP POLICY IF EXISTS student_medical_admin_principal_all ON public.student_medical;
CREATE POLICY student_medical_admin_principal_all ON public.student_medical
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_enrolments se
      JOIN public.user_roles ur ON ur.school_id = se.school_id
      WHERE se.student_id = student_medical.student_id
        AND ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.student_enrolments se
      JOIN public.user_roles ur ON ur.school_id = se.school_id
      WHERE se.student_id = student_medical.student_id
        AND ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal')
    )
  );

-- -- emergency contacts: leadership writes; staff + guardians read --
DROP POLICY IF EXISTS student_emergency_contacts_write ON public.student_emergency_contacts;
CREATE POLICY student_emergency_contacts_write ON public.student_emergency_contacts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_enrolments se
      WHERE se.student_id = student_emergency_contacts.student_id
        AND public.is_leadership_in_school(se.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.student_enrolments se
      WHERE se.student_id = student_emergency_contacts.student_id
        AND public.is_leadership_in_school(se.school_id)
    )
  );

DROP POLICY IF EXISTS student_emergency_contacts_staff_read ON public.student_emergency_contacts;
CREATE POLICY student_emergency_contacts_staff_read ON public.student_emergency_contacts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_enrolments se
      WHERE se.student_id = student_emergency_contacts.student_id
        AND public.is_staff_in_school(se.school_id)
    )
  );

DROP POLICY IF EXISTS student_emergency_contacts_guardian_read ON public.student_emergency_contacts;
CREATE POLICY student_emergency_contacts_guardian_read ON public.student_emergency_contacts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_enrolments se
      WHERE se.student_id = student_emergency_contacts.student_id
        AND student_emergency_contacts.student_id IN (
          SELECT public.current_guardian_student_ids_for_school(se.school_id)
        )
    )
  );

-- ------------------------------------------------------------------------------
-- 4. student_medical_alerts VIEW (allergies only; teachers included via
--    is_staff_in_school; see D4 for why the predicate lives in the view)
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.student_medical_alerts;
CREATE VIEW public.student_medical_alerts WITH (security_invoker = false) AS
SELECT DISTINCT
  sm.student_id AS student_id,
  se.school_id AS school_id,
  sm.allergies AS allergies
FROM public.student_medical sm
JOIN public.student_enrolments se
  ON se.student_id = sm.student_id
  AND se.status = 'active'
WHERE public.is_staff_in_school(se.school_id);

COMMENT ON VIEW public.student_medical_alerts IS
  'Alert-level medical exposure (allergies only) for school staff incl. teachers. '
  'Plain views cannot carry RLS policies, so authorization is the embedded '
  'is_staff_in_school predicate; full detail stays in student_medical '
  '(admin/principal only). Storage path convention: n/a.';

REVOKE ALL ON TABLE public.student_medical_alerts FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.student_medical_alerts TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. admission_counters + generate_admission_number(prefix-year-NNNN)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admission_counters (
  school_id UUID PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  prefix TEXT,
  last_number INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admission_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admission_counters_leadership_read ON public.admission_counters;
CREATE POLICY admission_counters_leadership_read ON public.admission_counters
  FOR SELECT TO authenticated
  USING (public.is_leadership_in_school(school_id));
-- No write policies: rows advance only via generate_admission_number (DEFINER).

CREATE OR REPLACE FUNCTION public.generate_admission_number(p_school_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_next INT;
  v_year INT;
BEGIN
  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'generate_admission_number: p_school_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT prefix, last_number INTO v_prefix, v_next
  FROM public.admission_counters
  WHERE school_id = p_school_id
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT code INTO v_prefix FROM public.schools WHERE id = p_school_id;
    IF v_prefix IS NULL OR btrim(v_prefix) = '' THEN
      v_prefix := 'ADM';
    END IF;
    INSERT INTO public.admission_counters (school_id, prefix, last_number)
    VALUES (p_school_id, v_prefix, 1)
    ON CONFLICT (school_id) DO UPDATE SET last_number = public.admission_counters.last_number + 1
    RETURNING last_number INTO v_next;
  ELSE
    IF v_prefix IS NULL OR btrim(v_prefix) = '' THEN
      SELECT code INTO v_prefix FROM public.schools WHERE id = p_school_id;
      IF v_prefix IS NULL OR btrim(v_prefix) = '' THEN
        v_prefix := 'ADM';
      END IF;
    END IF;
    UPDATE public.admission_counters
    SET last_number = last_number + 1, updated_at = now()
    WHERE school_id = p_school_id
    RETURNING last_number INTO v_next;
  END IF;

  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  RETURN v_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_admission_number(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_admission_number(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. admission_applications + guardians + documents + approve RPC
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admission_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_first_name TEXT NOT NULL,
  student_last_name TEXT NOT NULL,
  dob DATE,
  gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female', 'other')),
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  stream_id UUID REFERENCES public.streams(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  approved_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admission_application_guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.admission_applications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  is_emergency BOOLEAN NOT NULL DEFAULT false,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- doc_type list (D3): birth_certificate, report_card, transfer_letter, photo, other
CREATE TABLE IF NOT EXISTS public.admission_application_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.admission_applications(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL
    CHECK (doc_type IN ('birth_certificate', 'report_card', 'transfer_letter', 'photo', 'other')),
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admission_applications_school_status_idx
  ON public.admission_applications (school_id, status);
CREATE INDEX IF NOT EXISTS admission_application_guardians_app_idx
  ON public.admission_application_guardians (application_id);
CREATE INDEX IF NOT EXISTS admission_application_documents_app_idx
  ON public.admission_application_documents (application_id);

ALTER TABLE public.admission_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_application_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_application_documents ENABLE ROW LEVEL SECURITY;

-- -- applications: leadership (admin/principal/bursar) full; transitions via RPC --
DROP POLICY IF EXISTS admission_applications_leadership_all ON public.admission_applications;
CREATE POLICY admission_applications_leadership_all ON public.admission_applications
  FOR ALL TO authenticated
  USING (public.is_leadership_in_school(school_id))
  WITH CHECK (public.is_leadership_in_school(school_id));

DROP POLICY IF EXISTS admission_application_guardians_leadership_all ON public.admission_application_guardians;
CREATE POLICY admission_application_guardians_leadership_all ON public.admission_application_guardians
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admission_applications aa
      WHERE aa.id = admission_application_guardians.application_id
        AND public.is_leadership_in_school(aa.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admission_applications aa
      WHERE aa.id = admission_application_guardians.application_id
        AND public.is_leadership_in_school(aa.school_id)
    )
  );

DROP POLICY IF EXISTS admission_application_documents_leadership_all ON public.admission_application_documents;
CREATE POLICY admission_application_documents_leadership_all ON public.admission_application_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admission_applications aa
      WHERE aa.id = admission_application_documents.application_id
        AND public.is_leadership_in_school(aa.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admission_applications aa
      WHERE aa.id = admission_application_documents.application_id
        AND public.is_leadership_in_school(aa.school_id)
    )
  );

-- -- approve RPC: validates pending, mints the number, creates
-- -- people + students + enrolment + guardians in ONE transaction --
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

  IF NOT public.is_leadership_in_school(v_app.school_id) THEN
    RAISE EXCEPTION 'approve_admission_application: caller is not authorized leadership for school %', v_app.school_id
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
    RAISE EXCEPTION 'School % has no current academic year', v_app.school_id
      USING ERRCODE = 'P0001';
  END IF;

  v_adm_no := public.generate_admission_number(v_app.school_id);

  INSERT INTO public.people (first_name, last_name, date_of_birth, gender)
  VALUES (v_app.student_first_name, v_app.student_last_name, v_app.dob, v_app.gender)
  RETURNING id INTO v_person_id;

  INSERT INTO public.students (person_id, admission_number, admission_date, status)
  VALUES (v_person_id, v_adm_no, CURRENT_DATE, 'active')
  RETURNING id INTO v_student_id;

  INSERT INTO public.student_enrolments
    (student_id, school_id, class_id, stream_id, academic_year_id, status)
  VALUES
    (v_student_id, v_app.school_id, v_app.class_id, v_app.stream_id, v_year_id, 'active');

  FOR g IN
    SELECT * FROM public.admission_application_guardians
    WHERE application_id = v_app.id
  LOOP
    v_g_name := btrim(g.name);
    v_g_first := NULLIF(split_part(v_g_name, ' ', 1), '');
    v_g_rest := NULLIF(btrim(substr(v_g_name, length(v_g_first) + 1)), '');
    INSERT INTO public.people (first_name, last_name, email, phone)
    VALUES (COALESCE(v_g_first, v_g_name), COALESCE(v_g_rest, ''), g.email, g.phone)
    RETURNING id INTO v_g_person_id;

    INSERT INTO public.student_guardians
      (student_id, guardian_person_id, relationship, is_primary)
    VALUES
      (v_student_id, v_g_person_id, g.relationship, COALESCE(g.is_primary, false))
    ON CONFLICT (student_id, guardian_person_id) DO NOTHING;
  END LOOP;

  SELECT p.id INTO v_caller_person_id
  FROM public.people p
  WHERE p.auth_user_id = auth.uid()
  ORDER BY p.id
  LIMIT 1;

  UPDATE public.admission_applications
  SET status = 'approved',
      reviewed_by = v_caller_person_id,
      reviewed_at = now(),
      approved_student_id = v_student_id
  WHERE id = v_app.id;

  RETURN v_student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_admission_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_admission_application(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. student_documents + staff_documents (reusable pattern, two thin tables)
--     student doc_type list (D3): birth_certificate, report_card,
--       transfer_letter, medical_form, photo, passport, other
--     staff doc_type list (D3): cv, national_id, qualification_certificate,
--       contract, photo, other
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL
    CHECK (doc_type IN ('birth_certificate', 'report_card', 'transfer_letter', 'medical_form', 'photo', 'passport', 'other')),
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL
    CHECK (doc_type IN ('cv', 'national_id', 'qualification_certificate', 'contract', 'photo', 'other')),
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_documents_student_idx
  ON public.student_documents (student_id);
CREATE INDEX IF NOT EXISTS staff_documents_employee_idx
  ON public.staff_documents (employee_id);

ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;

-- -- student_documents: leadership writes; staff read --
DROP POLICY IF EXISTS student_documents_write ON public.student_documents;
CREATE POLICY student_documents_write ON public.student_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_enrolments se
      WHERE se.student_id = student_documents.student_id
        AND public.is_leadership_in_school(se.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.student_enrolments se
      WHERE se.student_id = student_documents.student_id
        AND public.is_leadership_in_school(se.school_id)
    )
  );

DROP POLICY IF EXISTS student_documents_staff_read ON public.student_documents;
CREATE POLICY student_documents_staff_read ON public.student_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_enrolments se
      WHERE se.student_id = student_documents.student_id
        AND public.is_staff_in_school(se.school_id)
    )
  );

-- -- staff_documents: leadership writes; staff of the owning school read --
DROP POLICY IF EXISTS staff_documents_write ON public.staff_documents;
CREATE POLICY staff_documents_write ON public.staff_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = staff_documents.employee_id
        AND public.is_leadership_in_school(e.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = staff_documents.employee_id
        AND public.is_leadership_in_school(e.school_id)
    )
  );

DROP POLICY IF EXISTS staff_documents_staff_read ON public.staff_documents;
CREATE POLICY staff_documents_staff_read ON public.staff_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = staff_documents.employee_id
        AND public.is_staff_in_school(e.school_id)
    )
  );

-- ------------------------------------------------------------------------------
-- 8. Storage buckets student_docs + staff_docs + school-scoped object policies
--    Path convention (D7): '<school_id>/<owner_id>/<file>'
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('student_docs', 'student_docs', false),
       ('staff_docs', 'staff_docs', false)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE storage.buckets IS
  'people-ops doc buckets (20260917000000): student_docs + staff_docs are '
  'private; object paths follow <school_id>/<owner_id>/<file> and policies '
  'below gate on foldername(name)[1] = caller school (text compare, D7).';

DROP POLICY IF EXISTS people_docs_staff_select ON storage.objects;
CREATE POLICY people_docs_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('student_docs', 'staff_docs')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid()
        AND e.school_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS people_docs_staff_insert ON storage.objects;
CREATE POLICY people_docs_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('student_docs', 'staff_docs')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid()
        AND e.school_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS people_docs_staff_update ON storage.objects;
CREATE POLICY people_docs_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('student_docs', 'staff_docs')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid()
        AND e.school_id::text = (storage.foldername(name))[1]
    )
  )
  WITH CHECK (
    bucket_id IN ('student_docs', 'staff_docs')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid()
        AND e.school_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS people_docs_staff_delete ON storage.objects;
CREATE POLICY people_docs_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('student_docs', 'staff_docs')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.people p ON p.id = e.person_id
      WHERE p.auth_user_id = auth.uid()
        AND e.school_id::text = (storage.foldername(name))[1]
    )
  );
