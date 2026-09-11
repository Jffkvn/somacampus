-- ==============================================================================
-- SOMACAMPUS MIGRATION: TIMETABLE PUBLISH RPC + PEOPLE EMAIL DEDUPE
-- Migration ID: 20260922000008
-- ==============================================================================
-- Fixes two live incidents documented in the 2026-09-11 P0 review:
--
-- 1. F4 - Timetable Wizard publish blocked. `timetables`/`timetable_entries`
--    are RLS-enabled with SELECT-only policies (deny-by-default by design),
--    so the wizard's direct inserts always failed with
--    "new row violates row-level security policy". The codebase already
--    routes privileged timetable transitions through SECURITY DEFINER RPCs
--    with in-function leadership checks (approve_timetable_atomic,
--    publish_timetable_atomic). This migration completes that architecture:
--    `create_timetable_with_entries` creates the timetable AND its entries
--    atomically, keeping RLS deny-by-default (no new INSERT/UPDATE policies).
--
-- 2. F3 - Duplicate `people` rows. seed-auth-users.ts created a second person
--    for an email that supabase/seed.sql had already seeded, so
--    people.eq('email', ...).maybeSingle() returned two rows and PostgREST
--    raised PGRST116 ("JSON object requested, multiple (or no) rows
--    returned") on the student portal. This dedupes deterministically:
--    keep the canonical row (the one referenced by students / employees /
--    student_guardians; tie-break lowest id), delete duplicates only when
--    they have zero references, otherwise detach their email/auth_user_id.
--
-- Idempotent: CREATE OR REPLACE, guarded dedupe. No DELETE of operational
-- records (Archive-Never-Delete respected: duplicate person rows are seed
-- artifacts removed only when completely unreferenced).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ATOMIC RPC: create_timetable_with_entries
-- Leadership-only. Creates a 'reviewed' timetable plus all week entries in one
-- transaction. Callers then approve/publish via the existing atomic RPCs.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_timetable_with_entries(
  p_school_id UUID,
  p_term_id UUID,
  p_name TEXT,
  p_entries JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timetable_id UUID;
  v_entry JSONB;
BEGIN
  -- 1. Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'create_timetable_with_entries: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Leadership check (same gate as approve/publish RPCs)
  IF NOT public.is_leadership_in_school(p_school_id) THEN
    RAISE EXCEPTION 'create_timetable_with_entries: caller is not authorized leadership for school %',
      p_school_id USING ERRCODE = '42501';
  END IF;

  -- 3. School must exist
  IF NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = p_school_id) THEN
    RAISE EXCEPTION 'create_timetable_with_entries: school % not found', p_school_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Validate entries payload shape before inserting anything
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'create_timetable_with_entries: p_entries must be a JSON array'
      USING ERRCODE = '22023';
  END IF;
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    IF (v_entry->>'class_id') IS NULL OR (v_entry->>'subject_id') IS NULL
       OR (v_entry->>'teacher_id') IS NULL OR (v_entry->>'day_of_week') IS NULL
       OR (v_entry->>'start_time') IS NULL OR (v_entry->>'end_time') IS NULL THEN
      RAISE EXCEPTION 'create_timetable_with_entries: entry missing required field: %', v_entry
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = (v_entry->>'class_id')::uuid)
       OR NOT EXISTS (SELECT 1 FROM public.subjects sub WHERE sub.id = (v_entry->>'subject_id')::uuid)
       OR NOT EXISTS (
         SELECT 1 FROM public.employees e
         WHERE e.id = (v_entry->>'teacher_id')::uuid AND e.school_id = p_school_id
       ) THEN
      RAISE EXCEPTION 'create_timetable_with_entries: entry references unknown class/subject/teacher: %',
        v_entry USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- 5. Create the timetable + entries atomically
  INSERT INTO public.timetables (school_id, term_id, name, status, is_active)
  VALUES (p_school_id, p_term_id, p_name, 'reviewed', true)
  RETURNING id INTO v_timetable_id;

  INSERT INTO public.timetable_entries (
    timetable_id, class_id, stream_id, subject_id, teacher_id, room_name,
    day_of_week, start_time, end_time
  )
  SELECT
    v_timetable_id,
    (e->>'class_id')::uuid,
    (e->>'stream_id')::uuid,
    (e->>'subject_id')::uuid,
    (e->>'teacher_id')::uuid,
    e->>'room_name',
    (e->>'day_of_week')::int,
    (e->>'start_time')::time,
    (e->>'end_time')::time
  FROM jsonb_array_elements(p_entries) AS e;

  RETURN v_timetable_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_timetable_with_entries(UUID, UUID, TEXT, JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. PEOPLE EMAIL DEDUPE
-- For each email with more than one people row: keep the canonical row (the one
-- referenced by students/employees/student_guardians; tie-break lowest id).
-- Unreferenced duplicates are removed; referenced duplicates are detached
-- (email + auth_user_id nulled) so lookups stay single-row everywhere.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_email TEXT;
  v_dup_id UUID;
  v_keep_id UUID;
BEGIN
  FOR v_dup_email IN
    SELECT email
    FROM public.people
    WHERE email IS NOT NULL
    GROUP BY email
    HAVING count(*) > 1
  LOOP
    -- Canonical: a row referenced by an identity-bearing table, else lowest id.
    SELECT p.id INTO v_keep_id
    FROM public.people p
    WHERE p.email = v_dup_email
    ORDER BY
      EXISTS (SELECT 1 FROM public.students s WHERE s.person_id = p.id) DESC,
      EXISTS (SELECT 1 FROM public.employees e WHERE e.person_id = p.id) DESC,
      EXISTS (SELECT 1 FROM public.student_guardians g WHERE g.guardian_person_id = p.id) DESC,
      p.id ASC
    LIMIT 1;

    FOR v_dup_id IN
      SELECT id
      FROM public.people
      WHERE email = v_dup_email AND id <> v_keep_id
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.students s WHERE s.person_id = v_dup_id)
         AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.person_id = v_dup_id)
         AND NOT EXISTS (SELECT 1 FROM public.student_guardians g WHERE g.guardian_person_id = v_dup_id)
         AND NOT EXISTS (SELECT 1 FROM public.communication_participants cp WHERE cp.person_id = v_dup_id)
         AND NOT EXISTS (SELECT 1 FROM public.notification_preferences np WHERE np.person_id = v_dup_id)
         AND NOT EXISTS (SELECT 1 FROM public.announcement_acknowledgements aa WHERE aa.person_id = v_dup_id) THEN
        DELETE FROM public.people WHERE id = v_dup_id;
      ELSE
        UPDATE public.people
        SET email = NULL, auth_user_id = NULL
        WHERE id = v_dup_id;
      END IF;
    END LOOP;

    RAISE NOTICE 'deduped people rows for email % (kept %)', v_dup_email, v_keep_id;
  END LOOP;
END;
$$;
