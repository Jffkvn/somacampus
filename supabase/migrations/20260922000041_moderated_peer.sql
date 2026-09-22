-- =============================================================================
-- P2D-4 — moderated peer replies + clubs (policy-gated)
-- Plan §5: 11+ controlled peer · 13+ clubs · moderation queue mandatory
-- before free peer exists. Under-13: parent visibility flag already on
-- community_policies.
-- =============================================================================

BEGIN;

-- 1. Learner replies inside communities (not free social feed — space-scoped)
CREATE TABLE IF NOT EXISTS public.community_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.learning_communities(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  hidden_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_replies_post_idx
  ON public.community_replies(post_id, created_at) WHERE NOT is_hidden;

-- 2. Moderation queue (reports). Mandatory before free peer is trusted.
CREATE TABLE IF NOT EXISTS public.community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  reply_id UUID REFERENCES public.community_replies(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'actioned', 'dismissed')),
  decided_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_report_target CHECK (num_nonnulls(post_id, reply_id) = 1)
);

CREATE INDEX IF NOT EXISTS community_reports_status_idx
  ON public.community_reports(school_id, status, created_at DESC);

ALTER TABLE public.community_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

-- Replies: members can insert if policy allows peer replies for their school/stage
-- (checked app-side + this WITH CHECK keeps writes to authenticated people).
DROP POLICY IF EXISTS community_replies_insert ON public.community_replies;
CREATE POLICY community_replies_insert ON public.community_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_community_member(community_id)
    AND author_person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS community_replies_read ON public.community_replies;
CREATE POLICY community_replies_read ON public.community_replies
  FOR SELECT TO authenticated
  USING (NOT is_hidden AND public.is_community_member(community_id));

DROP POLICY IF EXISTS community_replies_staff_mod ON public.community_replies;
CREATE POLICY community_replies_staff_mod ON public.community_replies
  FOR UPDATE TO authenticated
  USING (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'))
  WITH CHECK (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'));

DROP POLICY IF EXISTS community_reports_insert ON public.community_reports;
CREATE POLICY community_reports_insert ON public.community_reports
  FOR INSERT TO authenticated
  WITH CHECK (reported_by IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS community_reports_staff ON public.community_reports;
CREATE POLICY community_reports_staff ON public.community_reports
  FOR ALL TO authenticated
  USING (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'))
  WITH CHECK (public.is_school_staff_role(school_id, 'admin', 'principal', 'teacher'));

COMMIT;
