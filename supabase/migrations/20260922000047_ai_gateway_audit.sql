-- =============================================================================
-- AI-8 — gateway audit (who signed this?)
-- Plan: docs/plans/2026-09-22-ai-gateway-plan.md §6
-- Every AI call: task · actor · input_refs · model · output_hash · approver.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_gateway_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID,
  task TEXT NOT NULL,
  actor_id UUID,
  input_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT,
  output_hash TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_gateway_audit_school_idx
  ON public.ai_gateway_audit(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_gateway_audit_task_idx
  ON public.ai_gateway_audit(task, created_at DESC);

ALTER TABLE public.ai_gateway_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_gateway_audit_staff_read ON public.ai_gateway_audit;
CREATE POLICY ai_gateway_audit_staff_read ON public.ai_gateway_audit
  FOR SELECT TO authenticated
  USING (
    school_id IS NULL
    OR public.is_school_staff_role(school_id, 'admin', 'principal', 'bursar')
  );

DROP POLICY IF EXISTS ai_gateway_audit_insert ON public.ai_gateway_audit;
CREATE POLICY ai_gateway_audit_insert ON public.ai_gateway_audit
  FOR INSERT TO authenticated
  WITH CHECK (true);

COMMIT;
