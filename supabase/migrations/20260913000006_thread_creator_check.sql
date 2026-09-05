-- ==============================================================================
-- SOMACAMPUS MIGRATION: THREAD CREATOR CHECK HELPER
-- ==============================================================================
-- communication_participants_thread_insert's creator branch joined
-- communication_threads directly, but that table's SELECT policy hides the
-- row until the inserter is already a participant (nested-RLS deadlock:
-- first participant can never be added). A SECURITY DEFINER helper bypasses
-- the row visibility for the narrow created_by = self check only.
CREATE OR REPLACE FUNCTION public.is_thread_creator(p_thread_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.communication_threads t
    JOIN public.people p ON p.id = t.created_by
    WHERE t.id = p_thread_id
      AND p.auth_user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS communication_participants_thread_insert ON public.communication_participants;
CREATE POLICY communication_participants_thread_insert ON public.communication_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_thread_participant(communication_participants.thread_id)
    OR public.is_thread_creator(communication_participants.thread_id)
    OR EXISTS (
      SELECT 1
      FROM public.communication_threads t
      JOIN public.user_roles ur ON ur.school_id = t.school_id
      WHERE t.id = communication_participants.thread_id
        AND ur.user_id = auth.uid()
        AND ur.role_id IN ('admin', 'principal')
    )
  );
