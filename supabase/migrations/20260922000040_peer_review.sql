-- =============================================================================
-- P2D-3 — structured peer review (FORMATIVE ONLY)
-- Teacher-owned prompts. Peer scores NEVER enter learning_results
-- (gradebook) unless a teacher later confirms — out of band.
-- Policy: community_policies.allow_peer_review / allow_peer_replies.
-- =============================================================================

BEGIN;

-- 1. Teacher-defined review task (prompts come from the teacher, not free chat)
CREATE TABLE IF NOT EXISTS public.peer_review_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.learning_communities(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  instructions TEXT,
  -- [{ "id": "well", "prompt": "What was done well?" }, …]
  prompts JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Formative only — no score columns. Teacher-owned rubric language in prompts.
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Learner responses (structured, not free threads)
CREATE TABLE IF NOT EXISTS public.peer_review_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.peer_review_tasks(id) ON DELETE CASCADE,
  author_student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  work_student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  -- { promptId: "text" }
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  hidden_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT peer_review_not_self CHECK (author_student_id <> work_student_id)
);

CREATE INDEX IF NOT EXISTS peer_review_tasks_school_idx
  ON public.peer_review_tasks(school_id) WHERE is_published;
CREATE INDEX IF NOT EXISTS peer_review_responses_task_idx
  ON public.peer_review_responses(task_id);

ALTER TABLE public.peer_review_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_review_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS peer_review_tasks_staff_all ON public.peer_review_tasks;
CREATE POLICY peer_review_tasks_staff_all ON public.peer_review_tasks
  FOR ALL TO authenticated
  USING (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'))
  WITH CHECK (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'));

DROP POLICY IF EXISTS peer_review_tasks_learner_read ON public.peer_review_tasks;
CREATE POLICY peer_review_tasks_learner_read ON public.peer_review_tasks
  FOR SELECT TO authenticated
  USING (is_published);

DROP POLICY IF EXISTS peer_review_responses_learner_rw ON public.peer_review_responses;
CREATE POLICY peer_review_responses_learner_rw ON public.peer_review_responses
  FOR ALL TO authenticated
  USING (
    author_student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.people pp ON pp.id = s.person_id
      WHERE pp.auth_user_id = auth.uid()
    )
    OR public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher')
  )
  WITH CHECK (
    NOT is_hidden
    AND author_student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.people pp ON pp.id = s.person_id
      WHERE pp.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS peer_review_responses_read ON public.peer_review_responses;
CREATE POLICY peer_review_responses_read ON public.peer_review_responses
  FOR SELECT TO authenticated
  USING (
    NOT is_hidden
    AND (
      public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher')
      OR work_student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.people pp ON pp.id = s.person_id
        WHERE pp.auth_user_id = auth.uid()
      )
    )
  );

COMMIT;
