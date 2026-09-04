-- ============================================================================
-- SomaCampus Hardening Part C: Finance role check uses roles.id
-- Migration: 20260912000000_fix_finance_role_key.sql
-- ============================================================================
-- Live roles shape is (id, name, description) — there is NO key column, so the
-- Phase 7 definition referencing r.key fails at runtime. Redefine the helper
-- with r.id, keeping the intended role set (admin, principal, bursar) unchanged:
-- every finance policy in 20260911000000/0001 expects exactly this set
-- ("Strictly Admin, Principal, Bursar"). No role seed exists in-repo; bursar is
-- provisioned live. Idempotent: CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.has_school_finance_access(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND ur.school_id = p_school_id
      AND r.id IN ('admin', 'principal', 'bursar')
  );
$$;
