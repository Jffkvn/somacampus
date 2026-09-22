-- =============================================================================
-- P2D-1 — Community & Collaboration layer + stage policy
-- Plan: docs/plans/2026-09-22-digital-learning-spine-P2.md §5
--
-- Principle: community maturity follows learner maturity.
-- Default is teacher-led at EVERY age. Peer is a school policy flag
-- (stage + optional age floor) — never a birthday auto-unlock.
-- =============================================================================

BEGIN;

-- 1. School community policy (capability flags, like Learning Coach)
CREATE TABLE IF NOT EXISTS public.community_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL DEFAULT '',
  -- Teacher-led is always on (the floor).
  allow_teacher_led BOOLEAN NOT NULL DEFAULT true,
  allow_study_groups BOOLEAN NOT NULL DEFAULT false,
  -- Controlled peer: structured peer review / moderated replies.
  allow_peer_review BOOLEAN NOT NULL DEFAULT false,
  allow_peer_replies BOOLEAN NOT NULL DEFAULT false,
  allow_clubs BOOLEAN NOT NULL DEFAULT false,
  -- Optional age floor for peer (in addition to stage).
  peer_age_floor INT CHECK (peer_age_floor IS NULL OR peer_age_floor BETWEEN 5 AND 18),
  require_moderation BOOLEAN NOT NULL DEFAULT true,
  parent_visibility_under_13 BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, stage_key)
);

-- 2. Communities (spaces)
CREATE TABLE IF NOT EXISTS public.learning_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  community_type TEXT NOT NULL DEFAULT 'teacher_led'
    CHECK (community_type IN ('teacher_led', 'study_group', 'peer_review', 'club')),
  title TEXT NOT NULL,
  description TEXT,
  offering_id UUID REFERENCES public.online_offerings(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  stage_key TEXT,
  moderator_person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_communities_school_idx
  ON public.learning_communities(school_id, community_type) WHERE NOT is_archived;

-- 3. Members (students + staff + guardians with read)
CREATE TABLE IF NOT EXISTS public.community_members (
  community_id UUID NOT NULL REFERENCES public.learning_communities(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'learner'
    CHECK (member_role IN ('moderator', 'teacher', 'learner', 'guardian')),
  can_post BOOLEAN NOT NULL DEFAULT true,
  can_reply BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, person_id)
);

-- 4. Teacher-led posts (P2D-2). Learner replies gated by policy later.
CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.learning_communities(id) ON DELETE CASCADE,
  author_person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  hidden_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_posts_community_idx
  ON public.community_posts(community_id, is_pinned DESC, created_at DESC);

-- 5. Policy helpers (deterministic; no AI)
CREATE OR REPLACE FUNCTION public.community_peer_allowed(
  p_school_id UUID,
  p_stage_key TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT allow_peer_replies OR allow_peer_review OR allow_clubs
      FROM public.community_policies
      WHERE school_id = p_school_id AND stage_key = COALESCE(p_stage_key, '')
      LIMIT 1
    ),
    false
  )
$$;

REVOKE ALL ON FUNCTION public.community_peer_allowed(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_peer_allowed(UUID, TEXT) TO authenticated;

-- 6. RLS
ALTER TABLE public.community_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_policies_staff ON public.community_policies;
CREATE POLICY community_policies_staff ON public.community_policies
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal')
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal')
    )
  );

DROP POLICY IF EXISTS community_policies_member_read ON public.community_policies;
CREATE POLICY community_policies_member_read ON public.community_policies
  FOR SELECT TO authenticated
  USING (school_id IN (SELECT ur.school_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS learning_communities_staff_all ON public.learning_communities;
CREATE POLICY learning_communities_staff_all ON public.learning_communities
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  );

DROP POLICY IF EXISTS learning_communities_member_read ON public.learning_communities;
CREATE POLICY learning_communities_member_read ON public.learning_communities
  FOR SELECT TO authenticated
  USING (
    NOT is_archived
    AND id IN (
      SELECT cm.community_id FROM public.community_members cm
      JOIN public.people pp ON pp.id = cm.person_id
      WHERE pp.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS community_members_staff ON public.community_members;
CREATE POLICY community_members_staff ON public.community_members
  FOR ALL TO authenticated
  USING (
    community_id IN (
      SELECT id FROM public.learning_communities c
      WHERE c.school_id IN (
        SELECT ur.school_id FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
      )
    )
  )
  WITH CHECK (
    community_id IN (
      SELECT id FROM public.learning_communities c
      WHERE c.school_id IN (
        SELECT ur.school_id FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
      )
    )
  );

DROP POLICY IF EXISTS community_posts_staff_write ON public.community_posts;
CREATE POLICY community_posts_staff_write ON public.community_posts
  FOR ALL TO authenticated
  USING (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT ur.school_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role_id IN ('admin', 'principal', 'teacher')
    )
  );

DROP POLICY IF EXISTS community_posts_member_read ON public.community_posts;
CREATE POLICY community_posts_member_read ON public.community_posts
  FOR SELECT TO authenticated
  USING (
    NOT is_hidden
    AND community_id IN (
      SELECT cm.community_id FROM public.community_members cm
      JOIN public.people pp ON pp.id = cm.person_id
      WHERE pp.auth_user_id = auth.uid()
    )
  );

COMMIT;
