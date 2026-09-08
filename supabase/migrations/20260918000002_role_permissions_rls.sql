-- ==============================================================================
-- 20260918000002_role_permissions_rls.sql
--
-- Enables Row Level Security on the global role_permissions lookup table.
-- Grants authenticated read-only access to role definitions.
-- Disallows any client insert, update, or delete operations.
-- ==============================================================================

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_permissions_read ON public.role_permissions;

CREATE POLICY role_permissions_read ON public.role_permissions
  FOR SELECT TO authenticated
  USING (true);
