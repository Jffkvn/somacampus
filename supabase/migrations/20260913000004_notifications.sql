-- ==============================================================================
-- SOMACAMPUS MIGRATION: NOTIFICATION ENGINE
-- Migration ID: 20260913000004
-- ==============================================================================
-- Phase 8C Task 1 (schema): notification_events + notification_deliveries +
-- notification_preferences, plus a student-attendance trigger that creates
-- EVENTS ONLY (no delivery/provider logic in the database).
-- Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS / DROP TRIGGER IF EXISTS /
-- CREATE OR REPLACE. No USING(true) on school data: every policy is
-- school-scoped or self-scoped.
--
-- PAYLOAD CONTRACT (load-bearing for RLS): every student-scoped event MUST
-- carry payload.studentId as TEXT holding public.students.id (e.g.
-- NEW.student_id::text). The guardian event-read policy matches
-- (payload->>'studentId') as TEXT against the caller's child student IDs, so
-- a missing or non-studentId payload is simply invisible to guardians (never
-- an error, never a leak). TEXT comparison (not ::uuid cast) is deliberate:
-- a malformed studentId value can never raise inside an RLS policy.
--
-- SIMPLIFICATIONS (deliberate, documented):
-- 1. Staff = user_roles rows with role_id IN ('admin', 'principal', 'teacher',
--    'bursar') for the event's school. Parent/student accounts also hold
--    user_roles rows (see 20260913000002), so a bare ANY-role match would leak
--    events to them; the role list mirrors the guardian staff-scope fix.
-- 2. The attendance trigger fires AFTER INSERT WHEN status IN
--    ('absent','late') only. Corrections (UPDATE present->absent, deletes) do
--    NOT emit events; backfill/correction events are the worker's job.
-- 3. Deliveries are created by a future edge worker running as service_role
--    (bypasses RLS, so no policy is needed for it). The deliveries INSERT
--    policy for admin/principal exists for manual resends/backfills only.
-- 4. Recipients may UPDATE their own delivery rows (read receipts: status ->
--    'read', read_at). Column-level enforcement is app-level; RLS scopes the
--    row to self (or admin/principal of the school).
-- 5. notification_preferences.category is a fixed 7-value set:
--    attendance | assignments | observations | announcements | fees |
--    calendar | messages. acknowledgement_required and intervention_update
--    events fall under announcements; activity_clearance_updated falls under
--    fees; fee_* events fall under fees.
-- 6. UNIQUE (event_id, recipient_person_id, channel) on deliveries dedupes
--    worker retries per channel; not in the contract but required so a
--    retried fan-out cannot double-send.
-- 7. Expiry/cleanup is app-level: events remain readable history; RLS does
--    not filter on created_at.

-- ------------------------------------------------------------------------------
-- notification_events
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'attendance_absent',
    'attendance_late',
    'assignment_posted',
    'assignment_due',
    'observation_shared',
    'announcement_published',
    'fee_assessed',
    'fee_payment_received',
    'fee_overdue',
    'calendar_reminder',
    'message_received',
    'acknowledgement_required',
    'activity_clearance_updated',
    'intervention_update'
  )),
  source_entity_type TEXT,
  source_entity_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- notification_deliveries
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.notification_events(id) ON DELETE CASCADE,
  recipient_person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'whatsapp')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, recipient_person_id, channel)
);

-- ------------------------------------------------------------------------------
-- notification_preferences
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'attendance',
    'assignments',
    'observations',
    'announcements',
    'fees',
    'calendar',
    'messages'
  )),
  in_app BOOLEAN NOT NULL DEFAULT true,
  email BOOLEAN NOT NULL DEFAULT true,
  sms BOOLEAN NOT NULL DEFAULT false,
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (person_id, school_id, category)
);

CREATE INDEX IF NOT EXISTS idx_notification_events_school ON public.notification_events(school_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_type ON public.notification_events(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_events_source ON public.notification_events(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_event ON public.notification_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_recipient ON public.notification_deliveries(recipient_person_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_person_school ON public.notification_preferences(person_id, school_id);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- notification_events: staff of the event's school can read
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS notification_events_staff_read ON public.notification_events;
CREATE POLICY notification_events_staff_read ON public.notification_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = notification_events.school_id
        AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
    )
  );

-- ------------------------------------------------------------------------------
-- notification_events: guardians read events whose payload.studentId is their
-- child (active enrolment in the event's school). TEXT comparison per the
-- payload contract above; events without studentId are invisible here.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS notification_events_guardian_read ON public.notification_events;
CREATE POLICY notification_events_guardian_read ON public.notification_events
  FOR SELECT TO authenticated
  USING (
    (notification_events.payload ? 'studentId')
    AND (notification_events.payload ->> 'studentId') IN (
      SELECT g.student_id::text
      FROM public.current_guardian_student_ids_for_school(notification_events.school_id) AS g(student_id)
    )
  );

-- ------------------------------------------------------------------------------
-- notification_events: admin/principal insert (trigger writes via the
-- SECURITY DEFINER function below; service_role bypasses RLS)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS notification_events_admin_insert ON public.notification_events;
CREATE POLICY notification_events_admin_insert ON public.notification_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = notification_events.school_id
        AND ur.role_id IN ('admin', 'principal')
    )
  );

-- ------------------------------------------------------------------------------
-- notification_deliveries: recipient reads own rows
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS notification_deliveries_own_read ON public.notification_deliveries;
CREATE POLICY notification_deliveries_own_read ON public.notification_deliveries
  FOR SELECT TO authenticated
  USING (
    recipient_person_id IN (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- notification_deliveries: staff of the event's school can read
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS notification_deliveries_staff_read ON public.notification_deliveries;
CREATE POLICY notification_deliveries_staff_read ON public.notification_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.notification_events e
      JOIN public.user_roles ur ON ur.school_id = e.school_id
      WHERE e.id = notification_deliveries.event_id
        AND ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
    )
  );

-- ------------------------------------------------------------------------------
-- notification_deliveries: admin/principal insert (manual resends/backfills;
-- the future worker runs as service_role and bypasses RLS)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS notification_deliveries_admin_insert ON public.notification_deliveries;
CREATE POLICY notification_deliveries_admin_insert ON public.notification_deliveries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.notification_events e
      JOIN public.user_roles ur ON ur.school_id = e.school_id
      WHERE e.id = notification_deliveries.event_id
        AND ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal')
    )
  );

-- ------------------------------------------------------------------------------
-- notification_deliveries: recipient updates own rows (read receipts) +
-- admin/principal manage (retries, failure annotation)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS notification_deliveries_update ON public.notification_deliveries;
CREATE POLICY notification_deliveries_update ON public.notification_deliveries
  FOR UPDATE TO authenticated
  USING (
    recipient_person_id IN (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.notification_events e
      JOIN public.user_roles ur ON ur.school_id = e.school_id
      WHERE e.id = notification_deliveries.event_id
        AND ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal')
    )
  )
  WITH CHECK (
    recipient_person_id IN (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.notification_events e
      JOIN public.user_roles ur ON ur.school_id = e.school_id
      WHERE e.id = notification_deliveries.event_id
        AND ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal')
    )
  );

-- ------------------------------------------------------------------------------
-- notification_preferences: self-manage (SELECT/INSERT/UPDATE/DELETE own rows)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS notification_preferences_self_manage ON public.notification_preferences;
CREATE POLICY notification_preferences_self_manage ON public.notification_preferences
  FOR ALL TO authenticated
  USING (
    person_id IN (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    person_id IN (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- notification_preferences: admin/principal manage all rows of their school
-- (FOR ALL includes SELECT)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS notification_preferences_admin_manage ON public.notification_preferences;
CREATE POLICY notification_preferences_admin_manage ON public.notification_preferences
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = notification_preferences.school_id
        AND ur.role_id IN ('admin', 'principal')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = notification_preferences.school_id
        AND ur.role_id IN ('admin', 'principal')
    )
  );

-- ------------------------------------------------------------------------------
-- Attendance trigger: AFTER INSERT on student_attendance_records creates an
-- EVENT ONLY. No delivery, fan-out, or provider logic in the database.
-- Attendance must succeed independently of the notification engine, so the
-- body is wrapped in an exception handler that logs (RAISE WARNING) and
-- returns NEW -- a notification failure can never fail the attendance write.
-- SECURITY DEFINER + pinned search_path (repo convention): the trigger runs
-- as the function owner so the event insert is not subject to the caller's
-- RLS, and SET search_path blocks schema-shadowing.
-- Payload follows the contract above: studentId (students.id as TEXT),
-- studentName (nullable), date, status, sessionId.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_attendance_notification_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
BEGIN
  BEGIN
    v_event_type := CASE NEW.status
      WHEN 'absent' THEN 'attendance_absent'
      ELSE 'attendance_late'
    END;

    SELECT p.first_name, p.last_name
      INTO v_first_name, v_last_name
      FROM public.students s
      JOIN public.people p ON p.id = s.person_id
      WHERE s.id = NEW.student_id;

    INSERT INTO public.notification_events (
      school_id, event_type, source_entity_type, source_entity_id, payload
    ) VALUES (
      NEW.school_id,
      v_event_type,
      'student_attendance_record',
      NEW.id,
      jsonb_build_object(
        'studentId', NEW.student_id::text,
        'studentName', CASE
          WHEN v_first_name IS NULL THEN NULL
          ELSE TRIM(v_first_name || ' ' || COALESCE(v_last_name, ''))
        END,
        'date', NEW.date::text,
        'status', NEW.status,
        'sessionId', NEW.session_id::text
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Independence over visibility: attendance INSERT must succeed even if
    -- event creation fails. WARNING (not silent) so failures are observable
    -- in Postgres logs without breaking the write.
    RAISE WARNING 'create_attendance_notification_event failed for record %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_attendance_notify ON public.student_attendance_records;
CREATE TRIGGER trg_student_attendance_notify
  AFTER INSERT ON public.student_attendance_records
  FOR EACH ROW
  WHEN (NEW.status IN ('absent', 'late'))
  EXECUTE FUNCTION public.create_attendance_notification_event();
