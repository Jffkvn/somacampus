-- ==============================================================================
-- SOMACAMPUS MIGRATION: CALENDAR EVENT AUDIENCE RLS
-- ==============================================================================
-- calendar_events_auth_read was USING(true): any authenticated user (incl.
-- parents) could read staff-only events via direct API. Audience filtering
-- existed only in app code. This replaces it with audience-scoped access
-- mirroring the service matrix in calendarService.ts.
CREATE OR REPLACE FUNCTION public.can_view_calendar_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.calendar_events e
    JOIN public.school_calendars c ON c.id = e.school_calendar_id
    WHERE e.id = p_event_id AND (
      -- school: anyone related to the school (staff, enrolled student, guardian)
      (e.target_audience = 'school' AND (
        EXISTS (SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.school_id = c.school_id)
        OR EXISTS (SELECT 1 FROM public.students s
          JOIN public.people p ON p.id = s.person_id
          JOIN public.student_enrolments se ON se.student_id = s.id
          WHERE p.auth_user_id = auth.uid() AND se.school_id = c.school_id AND se.status = 'active')
        OR EXISTS (SELECT 1 FROM public.student_guardians sg
          JOIN public.people p ON p.id = sg.guardian_person_id
          JOIN public.student_enrolments se ON se.student_id = sg.student_id
          WHERE p.auth_user_id = auth.uid() AND se.school_id = c.school_id AND se.status = 'active')
      ))
      -- teachers: active teaching staff of the school
      OR (e.target_audience = 'teachers' AND EXISTS (
        SELECT 1 FROM public.employees emp
        JOIN public.people p ON p.id = emp.person_id
        WHERE p.auth_user_id = auth.uid() AND emp.school_id = c.school_id
          AND emp.status = 'active' AND emp.is_teacher
      ))
      -- parents: guardians of actively enrolled children in the school
      OR (e.target_audience = 'parents' AND EXISTS (
        SELECT 1 FROM public.student_guardians sg
        JOIN public.people p ON p.id = sg.guardian_person_id
        JOIN public.student_enrolments se ON se.student_id = sg.student_id
        WHERE p.auth_user_id = auth.uid() AND se.school_id = c.school_id AND se.status = 'active'
      ))
      -- students: actively enrolled students (+ guardians acting on pupil events)
      OR (e.target_audience = 'students' AND (
        EXISTS (SELECT 1 FROM public.students s
          JOIN public.people p ON p.id = s.person_id
          JOIN public.student_enrolments se ON se.student_id = s.id
          WHERE p.auth_user_id = auth.uid() AND se.school_id = c.school_id AND se.status = 'active')
        OR EXISTS (SELECT 1 FROM public.student_guardians sg
          JOIN public.people p ON p.id = sg.guardian_person_id
          JOIN public.student_enrolments se ON se.student_id = sg.student_id
          WHERE p.auth_user_id = auth.uid() AND se.school_id = c.school_id AND se.status = 'active')
      ))
      -- class: staff of the school (family needs target_class_id, which does
      -- not exist yet — fail closed, mirroring the service matrix)
      OR (e.target_audience = 'class' AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.school_id = c.school_id
          AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
      ))
    )
  );
$$;

DROP POLICY IF EXISTS calendar_events_auth_read ON public.calendar_events;
CREATE POLICY calendar_events_audience_read ON public.calendar_events
  FOR SELECT TO authenticated
  USING (public.can_view_calendar_event(id));
