-- ==============================================================================
-- SOMACAMPUS MIGRATION: SCHOOL ANNOUNCEMENTS
-- Migration ID: 20260913000003
-- ==============================================================================
-- Phase 8B Task 1 (schema): school_announcements + announcement_acknowledgements
-- per the architecture contract §4.2. Broadcast announcements with audience
-- targeting (school | staff | teachers | parents | students | class) and
-- optional acknowledgement tracking.
-- Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE.
-- No USING(true) on school data: every policy is school-scoped.
--
-- SIMPLIFICATIONS (deliberate, documented):
-- 1. "staff" audience = non-terminated employees row for the school OR a
--    staff user_roles row (admin / principal / teacher / bursar). A bare
--    ANY-user_roles match would leak to parent/student accounts, which hold
--    user_roles rows (see 20260913000002 guardian staff-scope fix).
-- 2. "teachers" audience = teaching roles (admin / principal / teacher) OR a
--    teaching-employee row (is_teacher); leadership keeps visibility into
--    teacher-targeted broadcasts.
-- 3. "class" audience ignores stream granularity and excludes subject
--    teachers: members = students actively enrolled in the class + guardians
--    of those students + current class_teachers assignees. Admin/principal
--    still read everything via the manage policy (FOR ALL includes SELECT).
-- 4. Acknowledgements are immutable: INSERT by self + SELECT only. No
--    UPDATE/DELETE policies, so a recorded response cannot be changed.
-- 5. Expiry is app-level: expired announcements remain readable (history);
--    RLS does not filter on expires_at.
-- 6. published_by is nullable with ON DELETE SET NULL, so AI-drafted or
--    system announcements need no human publisher and deleting a person
--    never deletes broadcast history.

-- ------------------------------------------------------------------------------
-- school_announcements
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'important', 'urgent', 'emergency')),
  target_audience TEXT NOT NULL DEFAULT 'school'
    CHECK (target_audience IN ('school', 'staff', 'teachers', 'parents', 'students', 'class')),
  -- Class-scoped broadcasts. CASCADE: deleting a class retires its
  -- class-targeted announcements (a NULL class would be visible to nobody).
  target_class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  requires_acknowledgement BOOLEAN NOT NULL DEFAULT false,
  published_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_ai_drafted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- announcement_acknowledgements
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcement_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.school_announcements(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  response TEXT NOT NULL DEFAULT 'acknowledged'
    CHECK (response IN ('acknowledged', 'yes', 'no')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_school_announcements_school ON public.school_announcements(school_id);
CREATE INDEX IF NOT EXISTS idx_school_announcements_class ON public.school_announcements(target_class_id);
CREATE INDEX IF NOT EXISTS idx_announcement_acknowledgements_announcement ON public.announcement_acknowledgements(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_acknowledgements_person ON public.announcement_acknowledgements(person_id);

ALTER TABLE public.school_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_acknowledgements ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Helper: can the caller view an announcement? (audience-aware, school-scoped)
-- SECURITY DEFINER so acknowledgement policies reuse the same audience check
-- without duplicating the CASE (same pattern as
-- public.current_guardian_student_ids_for_school from 20260913000000).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_school_announcement(p_announcement_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT p.id AS person_id FROM public.people p WHERE p.auth_user_id = auth.uid()
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.school_announcements a
    WHERE a.id = p_announcement_id
      AND (
        -- school: any relationship to the school (role, enrolment, guardianship)
        (
          a.target_audience = 'school'
          AND (
            EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid() AND ur.school_id = a.school_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.student_enrolments se
              JOIN public.students s ON s.id = se.student_id
              JOIN me ON me.person_id = s.person_id
              WHERE se.school_id = a.school_id AND se.status = 'active'
            )
            OR EXISTS (
              SELECT 1
              FROM public.student_enrolments se
              WHERE se.school_id = a.school_id
                AND se.status = 'active'
                AND se.student_id IN (
                  SELECT public.current_guardian_student_ids_for_school(a.school_id)
                )
            )
          )
        )
        -- staff: employees of the school or staff-role holders (simplification 1)
        OR (
          a.target_audience = 'staff'
          AND (
            EXISTS (
              SELECT 1
              FROM public.employees e
              JOIN me ON me.person_id = e.person_id
              WHERE e.school_id = a.school_id
                AND COALESCE(e.status, 'active') <> 'terminated'
            )
            OR EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid()
                AND ur.school_id = a.school_id
                AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
            )
          )
        )
        -- teachers: teaching roles or teaching employees (simplification 2)
        OR (
          a.target_audience = 'teachers'
          AND (
            EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid()
                AND ur.school_id = a.school_id
                AND ur.role_id IN ('admin', 'principal', 'teacher')
            )
            OR EXISTS (
              SELECT 1
              FROM public.employees e
              JOIN me ON me.person_id = e.person_id
              WHERE e.school_id = a.school_id
                AND COALESCE(e.status, 'active') <> 'terminated'
                AND COALESCE(e.is_teacher, false)
            )
          )
        )
        -- parents: guardian of a student actively enrolled in the school
        OR (
          a.target_audience = 'parents'
          AND EXISTS (
            SELECT 1
            FROM public.student_enrolments se
            WHERE se.school_id = a.school_id
              AND se.status = 'active'
              AND se.student_id IN (
                SELECT public.current_guardian_student_ids_for_school(a.school_id)
              )
          )
        )
        -- students: actively enrolled students of the school (via people)
        OR (
          a.target_audience = 'students'
          AND EXISTS (
            SELECT 1
            FROM public.student_enrolments se
            JOIN public.students s ON s.id = se.student_id
            JOIN me ON me.person_id = s.person_id
            WHERE se.school_id = a.school_id AND se.status = 'active'
          )
        )
        -- class: enrolled students + their guardians + current class teachers
        -- (simplification 3)
        OR (
          a.target_audience = 'class'
          AND a.target_class_id IS NOT NULL
          AND (
            EXISTS (
              SELECT 1
              FROM public.student_enrolments se
              JOIN public.students s ON s.id = se.student_id
              JOIN me ON me.person_id = s.person_id
              WHERE se.school_id = a.school_id
                AND se.class_id = a.target_class_id
                AND se.status = 'active'
            )
            OR EXISTS (
              SELECT 1
              FROM public.student_guardians sg
              JOIN public.student_enrolments se ON se.student_id = sg.student_id
              JOIN me ON me.person_id = sg.guardian_person_id
              WHERE se.school_id = a.school_id
                AND se.class_id = a.target_class_id
                AND se.status = 'active'
            )
            OR EXISTS (
              SELECT 1
              FROM public.class_teachers ct
              JOIN public.employees e ON e.id = ct.teacher_id
              JOIN me ON me.person_id = e.person_id
              WHERE ct.school_id = a.school_id
                AND ct.class_id = a.target_class_id
                AND (ct.effective_to IS NULL OR ct.effective_to >= CURRENT_DATE)
            )
          )
        )
      )
  );
$$;

-- ------------------------------------------------------------------------------
-- school_announcements: admin/principal manage (INSERT/UPDATE/DELETE + SELECT)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS school_announcements_manage ON public.school_announcements;
CREATE POLICY school_announcements_manage ON public.school_announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_announcements.school_id
        AND ur.role_id IN ('admin', 'principal')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = school_announcements.school_id
        AND ur.role_id IN ('admin', 'principal')
    )
  );

-- ------------------------------------------------------------------------------
-- school_announcements: audience-scoped read
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS school_announcements_read ON public.school_announcements;
CREATE POLICY school_announcements_read ON public.school_announcements
  FOR SELECT TO authenticated
  USING (public.can_view_school_announcement(school_announcements.id));

-- ------------------------------------------------------------------------------
-- announcement_acknowledgements: self-insert for visible announcements
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS announcement_acknowledgements_insert ON public.announcement_acknowledgements;
CREATE POLICY announcement_acknowledgements_insert ON public.announcement_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (
    person_id IN (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
    )
    AND public.can_view_school_announcement(announcement_id)
  );

-- ------------------------------------------------------------------------------
-- announcement_acknowledgements: read own + staff-role holders of the school
-- (staff = admin/principal/teacher/bursar roles; employees without a
-- user_roles row are not covered -- simplification, mirrors the guardian
-- staff-scope fix in 20260913000002)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS announcement_acknowledgements_read ON public.announcement_acknowledgements;
CREATE POLICY announcement_acknowledgements_read ON public.announcement_acknowledgements
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.school_announcements a
      JOIN public.user_roles ur ON ur.school_id = a.school_id
      WHERE a.id = announcement_acknowledgements.announcement_id
        AND ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
    )
  );
