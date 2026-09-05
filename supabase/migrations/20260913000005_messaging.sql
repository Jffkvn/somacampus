-- ==============================================================================
-- SOMACAMPUS MIGRATION: MESSAGING THREADS AND CONTACT AUTHORIZATION
-- Migration ID: 20260913000005
-- ==============================================================================
-- Phase 8D Task 1 (schema): communication_threads + communication_participants +
-- communication_messages + communication_reads, plus the
-- is_authorised_parent_teacher_contact() contact-rule function.
-- Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE.
-- No USING(true) on school data: every policy is participant-scoped,
-- self-scoped, or school-scoped (user_roles / enrolment / guardianship).
--
-- SIMPLIFICATIONS (deliberate, documented):
-- 1. Thread visibility = participants + admin/principal of the thread's
--    school (oversight). Staff-at-large are NOT included: a teacher who is
--    not a participant reads nothing.
-- 2. threads INSERT requires a school relationship (any user_roles row for
--    the school, an active self enrolment, or guardianship of an actively
--    enrolled child). Per-participant contact checks at INSERT time are
--    app-level via is_authorised_parent_teacher_contact(); the database
--    exposes the rule as a function rather than wiring it into RLS, because
--    INSERT-time "all initial participants are contactable" cannot be
--    expressed without write-amplifying triggers.
-- 3. communication_participants INSERT = thread creator, existing
--    participant, or admin/principal of the thread's school. There is no
--    UPDATE/DELETE policy (membership is append-only; removal is app-level).
-- 4. messages SELECT mirrors threads (participants + admin/principal);
--    messages INSERT requires sender = self AND thread participation. No
--    UPDATE/DELETE policies (messages are immutable history).
-- 5. communication_reads is strictly self-scoped (own INSERT/SELECT, no
--    staff read, no UPDATE/DELETE).
-- 6. threads UPDATE = participants + admin/principal (archiving path; the
--    app restricts payloads to the archived flag). No DELETE policy.
-- 7. communication_messages.sender_id and threads.created_by are nullable
--    ON DELETE SET NULL so deleting a person never deletes conversation
--    history; the messages INSERT policy still forces a non-null self
--    sender on write. ai_draft_approved_by approval semantics (e.g. only
--    staff may approve) are app-level.
-- 8. Contact function: teacher side requires an ACTIVE employees row in the
--    school; assignment legs are effective-date-aware against CURRENT_DATE
--    (class_teachers, subject_teachers) or status-aware (active activity
--    with enrolled enrolments). Stream matching is class-wide when either
--    side is unstreamed, mirroring is_authorised_daily_attendance_recorder.
--    Timetable entries are NOT a leg (kept to the three contract legs).

-- ------------------------------------------------------------------------------
-- communication_threads
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject TEXT,
  context_type TEXT NOT NULL DEFAULT 'general' CHECK (context_type IN (
    'general',
    'attendance',
    'assignment',
    'observation',
    'activity',
    'behaviour',
    'calendar_event',
    'finance'
  )),
  context_entity_id UUID,
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- communication_participants
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.communication_threads(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'recipient'
    CHECK (role IN ('sender', 'recipient', 'cc')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (thread_id, person_id)
);

-- ------------------------------------------------------------------------------
-- communication_messages
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.communication_threads(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_ai_drafted BOOLEAN NOT NULL DEFAULT false,
  ai_draft_approved_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- communication_reads
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.communication_messages(id) ON DELETE CASCADE,
  reader_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, reader_id)
);

CREATE INDEX IF NOT EXISTS idx_communication_threads_school
  ON public.communication_threads(school_id);
CREATE INDEX IF NOT EXISTS idx_communication_participants_thread
  ON public.communication_participants(thread_id);
CREATE INDEX IF NOT EXISTS idx_communication_participants_person
  ON public.communication_participants(person_id);
CREATE INDEX IF NOT EXISTS idx_communication_messages_thread
  ON public.communication_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_communication_reads_message
  ON public.communication_reads(message_id);

ALTER TABLE public.communication_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_reads ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Helper: caller's participation in a thread. SECURITY DEFINER + pinned
-- search_path (repo convention) so policies can test membership without
-- self-referencing the participants table (which would recurse in RLS).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_thread_participant(p_thread_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.communication_participants cp
    JOIN public.people p ON p.id = cp.person_id
    WHERE cp.thread_id = p_thread_id
      AND p.auth_user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------------------------
-- Contact rule: teacher -> parent ONLY via a shared class/subject/activity
-- assignment overlap with the parent's children. True iff the teacher holds
-- an active employees row in the school AND at least one guardian-linked
-- child of the parent is reachable through (a) a current class_teachers
-- assignment covering the child's active enrolment class, (b) a current
-- subject_teachers assignment covering it, or (c) an active activity the
-- teacher leads with the child enrolled. STABLE DEFINER SET search_path
-- per the repo DEFINER-helper convention.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_authorised_parent_teacher_contact(
  p_teacher_person_id UUID,
  p_parent_person_id UUID,
  p_school_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    -- Leg 1: class-teacher -> class students -> guardians
    SELECT 1
    FROM public.employees e
    JOIN public.class_teachers ct
      ON ct.teacher_id = e.id
     AND ct.school_id = p_school_id
     AND ct.effective_from <= CURRENT_DATE
     AND (ct.effective_to IS NULL OR ct.effective_to >= CURRENT_DATE)
    JOIN public.student_enrolments se
      ON se.school_id = p_school_id
     AND se.class_id = ct.class_id
     AND (ct.stream_id IS NULL OR se.stream_id IS NULL OR se.stream_id = ct.stream_id)
     AND se.status = 'active'
    JOIN public.student_guardians sg
      ON sg.student_id = se.student_id
     AND sg.guardian_person_id = p_parent_person_id
    WHERE e.person_id = p_teacher_person_id
      AND e.school_id = p_school_id
      AND e.status = 'active'
    UNION
    -- Leg 2: subject-teacher -> sections -> guardians
    SELECT 1
    FROM public.employees e
    JOIN public.subject_teachers st
      ON st.teacher_id = e.id
     AND st.school_id = p_school_id
     AND st.effective_from <= CURRENT_DATE
     AND (st.effective_to IS NULL OR st.effective_to >= CURRENT_DATE)
    JOIN public.student_enrolments se
      ON se.school_id = p_school_id
     AND se.class_id = st.class_id
     AND (st.stream_id IS NULL OR se.stream_id IS NULL OR se.stream_id = st.stream_id)
     AND se.status = 'active'
    JOIN public.student_guardians sg
      ON sg.student_id = se.student_id
     AND sg.guardian_person_id = p_parent_person_id
    WHERE e.person_id = p_teacher_person_id
      AND e.school_id = p_school_id
      AND e.status = 'active'
    UNION
    -- Leg 3: activity lead -> enrolled students -> guardians
    SELECT 1
    FROM public.employees e
    JOIN public.school_activities a
      ON a.lead_teacher_id = e.id
     AND a.school_id = p_school_id
     AND a.status = 'active'
    JOIN public.activity_enrolments ae
      ON ae.activity_id = a.id
     AND ae.school_id = p_school_id
     AND ae.status = 'enrolled'
    JOIN public.student_guardians sg
      ON sg.student_id = ae.student_id
     AND sg.guardian_person_id = p_parent_person_id
    WHERE e.person_id = p_teacher_person_id
      AND e.school_id = p_school_id
      AND e.status = 'active'
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- communication_threads: participants + admin/principal read
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS communication_threads_participant_read ON public.communication_threads;
CREATE POLICY communication_threads_participant_read ON public.communication_threads
  FOR SELECT TO authenticated
  USING (
    public.is_thread_participant(communication_threads.id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = communication_threads.school_id
        AND ur.role_id IN ('admin', 'principal')
    )
  );

-- ------------------------------------------------------------------------------
-- communication_threads: school-relationship INSERT (user_roles row, active
-- self enrolment, or guardianship of an actively enrolled child)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS communication_threads_school_insert ON public.communication_threads;
CREATE POLICY communication_threads_school_insert ON public.communication_threads
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = communication_threads.school_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.people p ON p.id = s.person_id
      JOIN public.student_enrolments se ON se.student_id = s.id
      WHERE p.auth_user_id = auth.uid()
        AND se.school_id = communication_threads.school_id
        AND se.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.student_guardians sg
      JOIN public.people p ON p.id = sg.guardian_person_id
      JOIN public.student_enrolments se ON se.student_id = sg.student_id
      WHERE p.auth_user_id = auth.uid()
        AND se.school_id = communication_threads.school_id
        AND se.status = 'active'
    )
  );

-- ------------------------------------------------------------------------------
-- communication_threads: participants + admin/principal update (archive path)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS communication_threads_participant_update ON public.communication_threads;
CREATE POLICY communication_threads_participant_update ON public.communication_threads
  FOR UPDATE TO authenticated
  USING (
    public.is_thread_participant(communication_threads.id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = communication_threads.school_id
        AND ur.role_id IN ('admin', 'principal')
    )
  )
  WITH CHECK (
    public.is_thread_participant(communication_threads.id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.school_id = communication_threads.school_id
        AND ur.role_id IN ('admin', 'principal')
    )
  );

-- ------------------------------------------------------------------------------
-- communication_participants: thread participants + admin/principal read
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS communication_participants_thread_read ON public.communication_participants;
CREATE POLICY communication_participants_thread_read ON public.communication_participants
  FOR SELECT TO authenticated
  USING (
    public.is_thread_participant(communication_participants.thread_id)
    OR EXISTS (
      SELECT 1
      FROM public.communication_threads t
      JOIN public.user_roles ur ON ur.school_id = t.school_id
      WHERE t.id = communication_participants.thread_id
        AND ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal')
    )
  );

-- ------------------------------------------------------------------------------
-- communication_participants: thread creator, existing participant, or
-- admin/principal of the thread's school may add members
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS communication_participants_thread_insert ON public.communication_participants;
CREATE POLICY communication_participants_thread_insert ON public.communication_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_thread_participant(communication_participants.thread_id)
    OR EXISTS (
      SELECT 1
      FROM public.communication_threads t
      JOIN public.people p ON p.id = t.created_by
      WHERE t.id = communication_participants.thread_id
        AND p.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.communication_threads t
      JOIN public.user_roles ur ON ur.school_id = t.school_id
      WHERE t.id = communication_participants.thread_id
        AND ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal')
    )
  );

-- ------------------------------------------------------------------------------
-- communication_messages: thread participants + admin/principal read
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS communication_messages_thread_read ON public.communication_messages;
CREATE POLICY communication_messages_thread_read ON public.communication_messages
  FOR SELECT TO authenticated
  USING (
    public.is_thread_participant(communication_messages.thread_id)
    OR EXISTS (
      SELECT 1
      FROM public.communication_threads t
      JOIN public.user_roles ur ON ur.school_id = t.school_id
      WHERE t.id = communication_messages.thread_id
        AND ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal')
    )
  );

-- ------------------------------------------------------------------------------
-- communication_messages: thread participants only, sender must be self
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS communication_messages_participant_insert ON public.communication_messages;
CREATE POLICY communication_messages_participant_insert ON public.communication_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    communication_messages.sender_id IN (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
    )
    AND public.is_thread_participant(communication_messages.thread_id)
  );

-- ------------------------------------------------------------------------------
-- communication_reads: strictly self-scoped (own INSERT/SELECT, no staff read)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS communication_reads_own_read ON public.communication_reads;
CREATE POLICY communication_reads_own_read ON public.communication_reads
  FOR SELECT TO authenticated
  USING (
    communication_reads.reader_id IN (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS communication_reads_own_insert ON public.communication_reads;
CREATE POLICY communication_reads_own_insert ON public.communication_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    communication_reads.reader_id IN (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
    )
  );
