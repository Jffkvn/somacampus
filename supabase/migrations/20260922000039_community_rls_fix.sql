-- =============================================================================
-- P2D fix — break RLS recursion on community_* (posts → members → communities
-- → members). Membership checks use SECURITY DEFINER helpers.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_community_member(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members cm
    JOIN public.people pp ON pp.id = cm.person_id
    WHERE cm.community_id = p_community_id
      AND pp.auth_user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_school_staff_role(p_school_id UUID, VARIADIC p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.school_id = p_school_id
      AND ur.role_id = ANY(p_roles)
  )
$$;

REVOKE ALL ON FUNCTION public.is_community_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_community_member(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.is_school_staff_role(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_school_staff_role(UUID, TEXT[]) TO authenticated;

-- Rewrite member/community/post policies to use helpers (no nested table scans).
DROP POLICY IF EXISTS learning_communities_member_read ON public.learning_communities;
CREATE POLICY learning_communities_member_read ON public.learning_communities
  FOR SELECT TO authenticated
  USING (NOT is_archived AND public.is_community_member(id));

DROP POLICY IF EXISTS community_posts_member_read ON public.community_posts;
CREATE POLICY community_posts_member_read ON public.community_posts
  FOR SELECT TO authenticated
  USING (NOT is_hidden AND public.is_community_member(community_id));

DROP POLICY IF EXISTS community_posts_staff_write ON public.community_posts;
CREATE POLICY community_posts_staff_write ON public.community_posts
  FOR ALL TO authenticated
  USING (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'))
  WITH CHECK (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'));

DROP POLICY IF EXISTS community_members_staff ON public.community_members;
CREATE POLICY community_members_staff ON public.community_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_communities c
      WHERE c.id = community_id
        AND public.is_school_staff_role(c.school_id, 'admin', 'principal', 'teacher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.learning_communities c
      WHERE c.id = community_id
        AND public.is_school_staff_role(c.school_id, 'admin', 'principal', 'teacher')
    )
  );

DROP POLICY IF EXISTS community_members_self_read ON public.community_members;
CREATE POLICY community_members_self_read ON public.community_members
  FOR SELECT TO authenticated
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

COMMIT;
