-- ==============================================================================
-- Migration: 20260917000005_guardian_contact_gate.sql
-- Module: SomaCampus Core School Operations — Slice 1 (Batch A Task 2 follow-up)
--
-- Purpose:
--   Gate guardian contact PII server-side. The client previously SELECTed
--   people.phone/email/address for EVERY caller role and redacted in JS, so a
--   tampered client (or raw network read) saw guardian PII, and the page role
--   came from client state. This RPC resolves the caller's role server-side
--   via auth.uid() + user_roles for the student's school and NEVER selects
--   PII columns for unauthorized roles.
--
-- Behavior table (guardian_contact_for_viewer(p_student_id)):
--   - admin / principal of the student's school → full contact columns
--     (phone, email, address populated).
--   - parent (guardian_person linked to the student) → full contact for their
--     own children (existing behavior preserved).
--   - teacher / bursar / any other role → identity + relationship ONLY;
--     phone/email/address return NULL without ever referencing the PII
--     columns in that branch.
--   - unknown student (no enrolment) → zero rows.
--   - student_emergency_contacts table: untouched, always visible by design
--     (teachers need emergency reach; gated at the JS projection as before).
--
-- Idempotent: CREATE OR REPLACE for the function; REVOKE/GRANT and COMMENT
--   are re-runnable. No table changes, no RLS policy changes.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- RPC: guardian_contact_for_viewer
-- Returns guardian identity for a student; contact PII only for office roles
-- (admin/principal) or the child's own parent. SECURITY DEFINER so the role
-- check and the PII read both execute with the owner's rights; callers only
-- ever receive what this function returns.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guardian_contact_for_viewer(p_student_id UUID)
RETURNS TABLE (
  id UUID,
  relationship TEXT,
  is_primary BOOLEAN,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_is_office BOOLEAN := FALSE;
  v_is_own_parent BOOLEAN := FALSE;
BEGIN
  -- Caller must be authenticated.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Derive the school from the student's enrolment (active preferred).
  SELECT se.school_id
    INTO v_school_id
    FROM public.student_enrolments se
   WHERE se.student_id = p_student_id
   ORDER BY (se.status = 'active') DESC, se.start_date DESC NULLS LAST
   LIMIT 1;

  -- Unknown student (no enrolment row): return zero rows, leak nothing.
  IF v_school_id IS NULL THEN
    RETURN;
  END IF;

  -- Office role resolved server-side (inline user_roles check so this
  -- migration has no ordering dependency on later helper functions).
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.school_id = v_school_id
       AND ur.role_id IN ('admin', 'principal')
  ) INTO v_is_office;

  -- Own-child parent resolved server-side via the guardian link.
  SELECT EXISTS (
    SELECT 1
      FROM public.student_guardians sg
      JOIN public.people p ON p.id = sg.guardian_person_id
     WHERE sg.student_id = p_student_id
       AND p.auth_user_id = auth.uid()
  ) INTO v_is_own_parent;

  IF v_is_office OR v_is_own_parent THEN
    -- Full contact: the ONLY branch that reads people.phone/email/address.
    RETURN QUERY
    SELECT sg.id,
           sg.relationship,
           sg.is_primary,
           p.first_name,
           p.last_name,
           p.phone,
           p.email,
           p.address
      FROM public.student_guardians sg
      JOIN public.people p ON p.id = sg.guardian_person_id
     WHERE sg.student_id = p_student_id;
  ELSE
    -- Redacted: identity + relationship only. PII columns are never
    -- referenced here — NULLs are cast literals, so phone/email/address
    -- cannot cross the network for teacher/bursar/other roles.
    RETURN QUERY
    SELECT sg.id,
           sg.relationship,
           sg.is_primary,
           p.first_name,
           p.last_name,
           NULL::TEXT,
           NULL::TEXT,
           NULL::TEXT
      FROM public.student_guardians sg
      JOIN public.people p ON p.id = sg.guardian_person_id
     WHERE sg.student_id = p_student_id;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.guardian_contact_for_viewer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardian_contact_for_viewer(UUID) TO authenticated;

COMMENT ON FUNCTION public.guardian_contact_for_viewer(UUID) IS
  'Batch A Task 2: server-side guardian contact gate. Returns full guardian phone/email/address only to admin/principal of the student''s school or the child''s own parent; all other roles get identity + relationship with NULL contact fields. Emergency contacts are intentionally out of scope (always visible).';
