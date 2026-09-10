-- ============================================================================
-- Stock requests: leadership (principal/admin) without an employees row
-- could not file requests — stock_requests_insert required
-- is_staff_in_school (employees-row based), while approvers act through
-- is_leadership_in_school (user_roles based). A principal filing a supply
-- request for their own school was denied. Leadership implies staff here:
-- allow is_leadership_in_school as an alternative on INSERT (requester_id
-- must still be the caller's own people row).
-- Idempotent. No data changes.
-- ============================================================================

DROP POLICY IF EXISTS stock_requests_insert ON public.stock_requests;
CREATE POLICY stock_requests_insert ON public.stock_requests
  FOR INSERT WITH CHECK (
    (
      public.is_staff_in_school(school_id)
      OR public.is_leadership_in_school(school_id)
    )
    AND requester_id IN (
      SELECT id FROM public.people WHERE auth_user_id = auth.uid()
    )
  );
