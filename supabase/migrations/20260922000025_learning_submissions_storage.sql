-- =============================================================================
-- Digital Learning Spine M3/M4 — learning_submissions + photo-first storage
-- Charter: docs/plans/2026-09-22-digital-learning-spine.md §8, §13
--
-- Submission state machine (LOCKED):
--   draft | submitted | late | missing | revision_requested | resubmitted | reviewed
-- Resubmit increments attempt — history is never destroyed.
-- =============================================================================

BEGIN;

-- 1. learning_submissions (latest attempt is the working row; history kept)
CREATE TABLE IF NOT EXISTS public.learning_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attempt INT NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  state TEXT NOT NULL DEFAULT 'submitted'
    CHECK (state IN ('draft', 'submitted', 'late', 'missing', 'revision_requested', 'resubmitted', 'reviewed')),
  late BOOLEAN NOT NULL DEFAULT false,
  text_body TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id, attempt)
);

CREATE INDEX IF NOT EXISTS learning_submissions_assignment_idx
  ON public.learning_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS learning_submissions_student_idx
  ON public.learning_submissions(student_id);
CREATE INDEX IF NOT EXISTS learning_submissions_state_idx
  ON public.learning_submissions(state)
  WHERE state IN ('submitted', 'late', 'resubmitted', 'revision_requested');

-- 2. Attachments (photo-first)
CREATE TABLE IF NOT EXISTS public.learning_submission_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.learning_submissions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'photo'
    CHECK (kind IN ('photo', 'text', 'pdf', 'document', 'audio', 'video')),
  storage_path TEXT,
  mime TEXT,
  byte_size BIGINT,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS learning_submission_attachments_sub_idx
  ON public.learning_submission_attachments(submission_id);

-- 3. submit_learning_work — one RPC so late/attempt/state stay consistent
CREATE OR REPLACE FUNCTION public.submit_learning_work(
  p_school_id UUID,
  p_assignment_id UUID,
  p_student_id UUID,
  p_text_body TEXT DEFAULT NULL,
  p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due DATE;
  v_attempt INT;
  v_state TEXT;
  v_late BOOLEAN;
  v_id UUID;
  v_att JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'submit_learning_work: authentication required';
  END IF;

  SELECT due_date INTO v_due
  FROM public.assignments
  WHERE id = p_assignment_id AND school_id = p_school_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'submit_learning_work: assignment not found';
  END IF;

  SELECT COALESCE(MAX(attempt), 0) + 1 INTO v_attempt
  FROM public.learning_submissions
  WHERE assignment_id = p_assignment_id AND student_id = p_student_id;

  v_late := (v_due IS NOT NULL AND (now()::date) > v_due);
  v_state := CASE WHEN v_attempt = 1 THEN
    (CASE WHEN v_late THEN 'late' ELSE 'submitted' END)
  ELSE
    (CASE WHEN v_late THEN 'late' ELSE 'resubmitted' END)
  END;

  INSERT INTO public.learning_submissions (
    school_id, assignment_id, student_id, attempt,
    state, late, text_body, submitted_at
  ) VALUES (
    p_school_id, p_assignment_id, p_student_id, v_attempt,
    v_state, v_late, p_text_body, now()
  ) RETURNING id INTO v_id;

  FOR v_att IN SELECT * FROM jsonb_array_elements(COALESCE(p_attachments, '[]'::jsonb))
  LOOP
    INSERT INTO public.learning_submission_attachments (
      submission_id, kind, storage_path, mime, byte_size, sort_order
    ) VALUES (
      v_id,
      COALESCE(v_att->>'kind', 'photo'),
      v_att->>'storage_path',
      v_att->>'mime',
      NULLIF(v_att->>'byte_size', '')::bigint,
      COALESCE((v_att->>'sort_order')::int, 0)
    );
  END LOOP;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_learning_work(UUID, UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_learning_work(UUID, UUID, UUID, TEXT, JSONB) TO authenticated;

-- 4. RLS
ALTER TABLE public.learning_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_submission_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_submissions_staff_all ON public.learning_submissions;
CREATE POLICY learning_submissions_staff_all ON public.learning_submissions
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
    )
  );

DROP POLICY IF EXISTS learning_submissions_student_write ON public.learning_submissions;
CREATE POLICY learning_submissions_student_write ON public.learning_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id IN (
      SELECT st.id FROM public.students st
      JOIN public.people p ON p.id = st.person_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS learning_submissions_student_read ON public.learning_submissions;
CREATE POLICY learning_submissions_student_read ON public.learning_submissions
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT st.id FROM public.students st
      JOIN public.people p ON p.id = st.person_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS learning_submissions_guardian_read ON public.learning_submissions;
CREATE POLICY learning_submissions_guardian_read ON public.learning_submissions
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT sg.student_id FROM public.student_guardians sg
      JOIN public.people p ON p.id = sg.guardian_person_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS learning_submission_attachments_staff_all ON public.learning_submission_attachments;
CREATE POLICY learning_submission_attachments_staff_all ON public.learning_submission_attachments
  FOR ALL TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM public.learning_submissions ls
      WHERE ls.school_id IN (
        SELECT ur.school_id FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
      )
    )
  );

DROP POLICY IF EXISTS learning_submission_attachments_student_all ON public.learning_submission_attachments;
CREATE POLICY learning_submission_attachments_student_all ON public.learning_submission_attachments
  FOR ALL TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM public.learning_submissions ls
      WHERE ls.student_id IN (
        SELECT st.id FROM public.students st
        JOIN public.people p ON p.id = st.person_id
        WHERE p.auth_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    submission_id IN (
      SELECT id FROM public.learning_submissions ls
      WHERE ls.student_id IN (
        SELECT st.id FROM public.students st
        JOIN public.people p ON p.id = st.person_id
        WHERE p.auth_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS learning_submission_attachments_guardian_read ON public.learning_submission_attachments;
CREATE POLICY learning_submission_attachments_guardian_read ON public.learning_submission_attachments
  FOR SELECT TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM public.learning_submissions ls
      WHERE ls.student_id IN (
        SELECT sg.student_id FROM public.student_guardians sg
        JOIN public.people p ON p.id = sg.guardian_person_id
        WHERE p.auth_user_id = auth.uid()
      )
    )
  );

-- 5. Storage bucket for photo-first work (authenticated only — no public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-submissions',
  'student-submissions',
  false,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'audio/mpeg', 'video/mp4']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "student-submissions staff read" ON storage.objects;
CREATE POLICY "student-submissions staff read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-submissions'
    AND (storage.foldername(name))[1] IN (
      SELECT ur.school_id::text FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal', 'teacher', 'bursar')
    )
  );

DROP POLICY IF EXISTS "student-submissions student write" ON storage.objects;
CREATE POLICY "student-submissions student write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'student-submissions'
    AND (storage.foldername(name))[2] IN (
      SELECT st.id::text FROM public.students st
      JOIN public.people p ON p.id = st.person_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "student-submissions guardian read" ON storage.objects;
CREATE POLICY "student-submissions guardian read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-submissions'
    AND (storage.foldername(name))[2] IN (
      SELECT sg.student_id::text FROM public.student_guardians sg
      JOIN public.people p ON p.id = sg.guardian_person_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

COMMIT;
