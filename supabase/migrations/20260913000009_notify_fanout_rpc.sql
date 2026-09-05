-- ==============================================================================
-- SOMACAMPUS MIGRATION: SERVER-SIDE NOTIFICATION FAN-OUT RPC
-- Migration ID: 20260913000009
-- ==============================================================================
-- Phase 8C (notify fan-out review C1): the client must never insert
-- notification_events / notification_deliveries rows directly — direct
-- inserts are spoofable (a caller could fan out to arbitrary recipients)
-- and RLS-fragile (events/deliveries INSERT policies allow admin/principal
-- only, so teacher/parent-triggered fan-out was denied with 42501).
--
-- Single mechanism: public.create_event_and_fan_out() runs SECURITY DEFINER
-- (pinned search_path, repo convention) so it can write events + deliveries
-- for any legitimate caller, while VALIDATING server-side and DERIVING
-- recipients itself. The caller supplies (school, type, source, payload)
-- and NEVER a recipient list.
--
-- Rules:
-- 1. Caller check: auth.uid() must resolve to a person row AND hold a
--    user_roles row, an active guardian link, or an active enrolment
--    (as the student) in p_school_id — else RAISE EXCEPTION (client treats
--    this as best-effort warn; the primary write is unaffected).
-- 2. Event-type allowlist mirrors the notification_events CHECK (14 values);
--    unknown types RAISE EXCEPTION.
-- 3. Recipient derivation (server-side only):
--    - attendance_absent/late -> guardians of payload studentId, restricted
--      to ACTIVE enrolments in the school (unenrolled/unknown student ->
--      zero recipients, never an error).
--    - announcement_published / acknowledgement_required -> payload audience:
--      parents -> guardians of active enrolments; students -> enrolled
--      students' person ids; teachers -> active employees with
--      COALESCE(is_teacher,true); staff -> all active employees;
--      class -> guardians + students of the payload classId enrolments;
--      school -> guardians + all active employees; UNKNOWN or class-without-
--      classId audience -> staff only (fail-closed default, documented).
--    - message_received -> other participants of the payload threadId; the
--      caller MUST be a participant, else zero recipients (never an error).
--    - all other allowlisted types -> zero recipients for now (no client
--      producer yet; the event row is still recorded).
-- 4. Find-or-create (idempotent replay): attendance matches the newest event
--    with the same school + studentId + sessionId (covers both the
--    attendance trigger's row and earlier client-driven rows); message
--    matches payload messageId, else newest same threadId + senderId;
--    announcement matches payload announcementId. A payload existingEventId
--    hint is honoured only when it names an event in the same school of a
--    compatible type. Otherwise the event row is inserted.
-- 5. Deliveries honour notification_preferences per recipient (category map
--    per migration 20260913000004 note 5): no row -> deliver (default true);
--    in_app=false skipped unless is_mandatory. Insert uses ON CONFLICT
--    (event_id, recipient_person_id, channel) DO NOTHING; duplicates are
--    counted, never errors.
-- Returns JSONB: {event_id, attempted, inserted, duplicates,
--   skipped_by_preference, failed} (failed is always 0: the function either
--   completes or raises, and the client never throws on raise).
--
-- Idempotent: CREATE OR REPLACE + GRANT (re-runnable). No RLS changes:
-- the function executes as owner. Least privilege: EXECUTE granted to
-- authenticated only (anon callers fail the caller check by construction,
-- but are denied at the grant layer too).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_event_and_fan_out(
  p_school_id UUID,
  p_event_type TEXT,
  p_source_entity_type TEXT,
  p_source_entity_id UUID,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_person_id UUID;
  v_payload JSONB := COALESCE(p_payload, '{}'::jsonb);
  v_category TEXT;
  v_event_id UUID;
  v_student_key TEXT;
  v_session_key TEXT;
  v_audience TEXT;
  v_class_key TEXT;
  v_thread_id UUID;
  v_message_key TEXT;
  v_announcement_key TEXT;
  v_hint_id UUID;
  v_attempted INT := 0;
  v_eligible INT := 0;
  v_inserted INT := 0;
BEGIN
  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'notify fan-out: school id is required';
  END IF;

  -- 1. Caller check: person row + school relationship (role, guardianship,
  --    or own active enrolment). No relationship -> RAISE (anti-spoof).
  SELECT p.id INTO v_caller_person_id
    FROM public.people p
    WHERE p.auth_user_id = auth.uid()
    LIMIT 1;
  IF v_caller_person_id IS NULL THEN
    RAISE EXCEPTION 'notify fan-out: no person record for caller';
  END IF;
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.school_id = p_school_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.student_guardians g
      JOIN public.student_enrolments e ON e.student_id = g.student_id
      WHERE g.guardian_person_id = v_caller_person_id
        AND e.school_id = p_school_id
        AND e.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.student_enrolments e ON e.student_id = s.id
      WHERE s.person_id = v_caller_person_id
        AND e.school_id = p_school_id
        AND e.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'notify fan-out: caller has no relationship to school %', p_school_id;
  END IF;

  -- 2. Event-type allowlist (mirrors the notification_events CHECK).
  IF p_event_type NOT IN (
    'attendance_absent', 'attendance_late',
    'assignment_posted', 'assignment_due',
    'observation_shared',
    'announcement_published',
    'fee_assessed', 'fee_payment_received', 'fee_overdue',
    'calendar_reminder',
    'message_received',
    'acknowledgement_required',
    'activity_clearance_updated',
    'intervention_update'
  ) THEN
    RAISE EXCEPTION 'notify fan-out: unsupported event type %', p_event_type;
  END IF;

  -- Category map (per 20260913000004 note 5).
  v_category := CASE
    WHEN p_event_type IN ('attendance_absent', 'attendance_late') THEN 'attendance'
    WHEN p_event_type IN ('announcement_published', 'acknowledgement_required', 'intervention_update') THEN 'announcements'
    WHEN p_event_type = 'message_received' THEN 'messages'
    WHEN p_event_type LIKE 'fee_%' OR p_event_type = 'activity_clearance_updated' THEN 'fees'
    WHEN p_event_type LIKE 'assignment_%' THEN 'assignments'
    WHEN p_event_type = 'observation_shared' THEN 'observations'
    WHEN p_event_type = 'calendar_reminder' THEN 'calendar'
    ELSE 'announcements'
  END;

  -- 4. Find-or-create, per-type dedupe keys (all matches school-scoped).
  IF p_event_type IN ('attendance_absent', 'attendance_late') THEN
    v_student_key := COALESCE(v_payload->>'studentId', v_payload->>'student_id');
    v_session_key := COALESCE(v_payload->>'sessionId', v_payload->>'session_id', '');
    BEGIN
      v_hint_id := NULLIF(COALESCE(v_payload->>'existingEventId', ''), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_hint_id := NULL;
    END;
    IF v_hint_id IS NOT NULL THEN
      SELECT ne.id INTO v_event_id
        FROM public.notification_events ne
        WHERE ne.id = v_hint_id
          AND ne.school_id = p_school_id
          AND ne.event_type IN ('attendance_absent', 'attendance_late');
    END IF;
    IF v_event_id IS NULL AND v_student_key IS NOT NULL THEN
      SELECT ne.id INTO v_event_id
        FROM public.notification_events ne
        WHERE ne.school_id = p_school_id
          AND ne.event_type IN ('attendance_absent', 'attendance_late')
          AND COALESCE(ne.payload->>'studentId', ne.payload->>'student_id') = v_student_key
          AND COALESCE(ne.payload->>'sessionId', ne.payload->>'session_id', '') = v_session_key
        ORDER BY ne.created_at DESC
        LIMIT 1;
    END IF;
  ELSIF p_event_type = 'message_received' THEN
    v_message_key := COALESCE(v_payload->>'messageId', v_payload->>'message_id');
    BEGIN
      v_thread_id := NULLIF(COALESCE(v_payload->>'threadId', v_payload->>'thread_id', ''), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_thread_id := NULL;
    END;
    IF v_message_key IS NOT NULL THEN
      SELECT ne.id INTO v_event_id
        FROM public.notification_events ne
        WHERE ne.school_id = p_school_id
          AND ne.event_type = 'message_received'
          AND COALESCE(ne.payload->>'messageId', ne.payload->>'message_id') = v_message_key
        ORDER BY ne.created_at DESC
        LIMIT 1;
    ELSIF v_thread_id IS NOT NULL THEN
      -- TEXT comparison (never cast row payloads: a malformed stored value
      -- must not raise inside the lookup).
      SELECT ne.id INTO v_event_id
        FROM public.notification_events ne
        WHERE ne.school_id = p_school_id
          AND ne.event_type = 'message_received'
          AND COALESCE(ne.payload->>'threadId', ne.payload->>'thread_id', '') = v_thread_id::text
          AND COALESCE(ne.payload->>'senderId', ne.payload->>'sender_id', '') =
              COALESCE(v_payload->>'senderId', v_payload->>'sender_id', '')
        ORDER BY ne.created_at DESC
        LIMIT 1;
    END IF;
  ELSIF p_event_type IN ('announcement_published', 'acknowledgement_required') THEN
    v_announcement_key := COALESCE(v_payload->>'announcementId', v_payload->>'announcement_id');
    IF v_announcement_key IS NOT NULL THEN
      SELECT ne.id INTO v_event_id
        FROM public.notification_events ne
        WHERE ne.school_id = p_school_id
          AND ne.event_type IN ('announcement_published', 'acknowledgement_required')
          AND COALESCE(ne.payload->>'announcementId', ne.payload->>'announcement_id') = v_announcement_key
        ORDER BY ne.created_at DESC
        LIMIT 1;
    END IF;
  END IF;

  IF v_event_id IS NULL THEN
    INSERT INTO public.notification_events (
      school_id, event_type, source_entity_type, source_entity_id, payload
    ) VALUES (
      p_school_id, p_event_type, p_source_entity_type, p_source_entity_id, v_payload
    ) RETURNING id INTO v_event_id;
  END IF;

  -- 3. Recipient derivation into a transaction-scoped set (UNIQUE holder
  --    dedupes overlaps, e.g. a guardian who is also staff).
  DROP TABLE IF EXISTS tmp_notify_recips;
  CREATE TEMPORARY TABLE tmp_notify_recips (pid UUID PRIMARY KEY) ON COMMIT DROP;

  IF p_event_type IN ('attendance_absent', 'attendance_late') THEN
    IF v_student_key IS NOT NULL THEN
      INSERT INTO tmp_notify_recips (pid)
      SELECT DISTINCT g.guardian_person_id
        FROM public.student_guardians g
        JOIN public.student_enrolments e ON e.student_id = g.student_id
        WHERE g.student_id::text = v_student_key
          AND e.school_id = p_school_id
          AND e.status = 'active'
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF p_event_type IN ('announcement_published', 'acknowledgement_required') THEN
    v_audience := COALESCE(v_payload->>'audience', 'school');
    v_class_key := COALESCE(v_payload->>'classId', v_payload->>'class_id');
    IF v_audience = 'parents' THEN
      INSERT INTO tmp_notify_recips (pid)
      SELECT DISTINCT g.guardian_person_id
        FROM public.student_guardians g
        JOIN public.student_enrolments e ON e.student_id = g.student_id
        WHERE e.school_id = p_school_id AND e.status = 'active'
      ON CONFLICT DO NOTHING;
    ELSIF v_audience = 'students' THEN
      INSERT INTO tmp_notify_recips (pid)
      SELECT DISTINCT s.person_id
        FROM public.students s
        JOIN public.student_enrolments e ON e.student_id = s.id
        WHERE e.school_id = p_school_id AND e.status = 'active'
      ON CONFLICT DO NOTHING;
    ELSIF v_audience = 'teachers' THEN
      INSERT INTO tmp_notify_recips (pid)
      SELECT DISTINCT emp.person_id
        FROM public.employees emp
        WHERE emp.school_id = p_school_id
          AND emp.status = 'active'
          AND COALESCE(emp.is_teacher, true) = true
      ON CONFLICT DO NOTHING;
    ELSIF v_audience = 'class' AND v_class_key IS NOT NULL THEN
      INSERT INTO tmp_notify_recips (pid)
      SELECT DISTINCT g.guardian_person_id
        FROM public.student_guardians g
        JOIN public.student_enrolments e ON e.student_id = g.student_id
        WHERE e.school_id = p_school_id AND e.status = 'active'
          AND e.class_id::text = v_class_key
      ON CONFLICT DO NOTHING;
      INSERT INTO tmp_notify_recips (pid)
      SELECT DISTINCT s.person_id
        FROM public.students s
        JOIN public.student_enrolments e ON e.student_id = s.id
        WHERE e.school_id = p_school_id AND e.status = 'active'
          AND e.class_id::text = v_class_key
      ON CONFLICT DO NOTHING;
    ELSIF v_audience = 'school' THEN
      INSERT INTO tmp_notify_recips (pid)
      SELECT DISTINCT g.guardian_person_id
        FROM public.student_guardians g
        JOIN public.student_enrolments e ON e.student_id = g.student_id
        WHERE e.school_id = p_school_id AND e.status = 'active'
      ON CONFLICT DO NOTHING;
      INSERT INTO tmp_notify_recips (pid)
      SELECT DISTINCT emp.person_id
        FROM public.employees emp
        WHERE emp.school_id = p_school_id AND emp.status = 'active'
      ON CONFLICT DO NOTHING;
    ELSE
      -- Unknown audience, or class without classId: staff only (fail-closed).
      INSERT INTO tmp_notify_recips (pid)
      SELECT DISTINCT emp.person_id
        FROM public.employees emp
        WHERE emp.school_id = p_school_id AND emp.status = 'active'
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF p_event_type = 'message_received' THEN
    IF v_thread_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.communication_participants cp
        WHERE cp.thread_id = v_thread_id AND cp.person_id = v_caller_person_id
      )
    THEN
      INSERT INTO tmp_notify_recips (pid)
      SELECT DISTINCT cp.person_id
        FROM public.communication_participants cp
        WHERE cp.thread_id = v_thread_id
          AND cp.person_id <> v_caller_person_id
      ON CONFLICT DO NOTHING;
    END IF;
    -- Non-participant caller or unresolvable thread -> zero recipients.
  END IF;
  -- Other allowlisted types: no client producer yet -> zero recipients; the
  -- event row above is still recorded.

  SELECT COUNT(*) INTO v_attempted FROM tmp_notify_recips;

  -- 5. Deliveries with preference honoring + idempotent insert.
  INSERT INTO public.notification_deliveries (
    event_id, recipient_person_id, channel, status
  )
  SELECT v_event_id, r.pid, 'in_app', 'pending'
    FROM tmp_notify_recips r
    LEFT JOIN public.notification_preferences p
      ON p.person_id = r.pid
      AND p.school_id = p_school_id
      AND p.category = v_category
    WHERE COALESCE(p.in_app, true) OR COALESCE(p.is_mandatory, false)
  ON CONFLICT (event_id, recipient_person_id, channel) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT COUNT(*) INTO v_eligible
    FROM tmp_notify_recips r
    LEFT JOIN public.notification_preferences p
      ON p.person_id = r.pid
      AND p.school_id = p_school_id
      AND p.category = v_category
    WHERE COALESCE(p.in_app, true) OR COALESCE(p.is_mandatory, false);

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'attempted', v_attempted,
    'inserted', v_inserted,
    'duplicates', GREATEST(v_eligible - v_inserted, 0),
    'skipped_by_preference', v_attempted - v_eligible,
    'failed', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_event_and_fan_out(UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_event_and_fan_out(UUID, TEXT, TEXT, UUID, JSONB) TO authenticated;
