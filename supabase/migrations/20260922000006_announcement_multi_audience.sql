-- ============================================================================
-- Announcements: multi-audience targeting.
-- Adds school_announcements.additional_audiences TEXT[] (empty = none extra)
-- with a CHECK constraining values to the six known audiences, and redefines
-- can_view_school_announcement so each audience branch also matches when the
-- audience appears in additional_audiences. Primary target_audience semantics
-- unchanged (incl. class requiring target_class_id).
-- Idempotent. No data changes.
-- ============================================================================

ALTER TABLE public.school_announcements
  ADD COLUMN IF NOT EXISTS additional_audiences TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_announcements_additional_audiences_check'
  ) THEN
    ALTER TABLE public.school_announcements
      ADD CONSTRAINT school_announcements_additional_audiences_check
      CHECK (additional_audiences <@ ARRAY['school','staff','teachers','parents','students','class']);
  END IF;
END $$;

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
          (a.target_audience = 'school' OR 'school' = ANY (a.additional_audiences))
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
          (a.target_audience = 'staff' OR 'staff' = ANY (a.additional_audiences))
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
          (a.target_audience = 'teachers' OR 'teachers' = ANY (a.additional_audiences))
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
          (a.target_audience = 'parents' OR 'parents' = ANY (a.additional_audiences))
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
          (a.target_audience = 'students' OR 'students' = ANY (a.additional_audiences))
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
          (a.target_audience = 'class' OR 'class' = ANY (a.additional_audiences))
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
