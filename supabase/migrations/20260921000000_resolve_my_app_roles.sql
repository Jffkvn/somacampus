-- Auth identity hardening: server-resolved roles for the signed-in caller.
-- Client UI gates must not trust user_metadata.role (spoofable chrome).
-- This RPC returns only the caller's own user_roles rows (auth.uid()).

CREATE OR REPLACE FUNCTION public.resolve_my_app_roles()
RETURNS TABLE (school_id uuid, role_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.school_id, ur.role_id
  FROM user_roles ur
  WHERE ur.user_id = auth.uid()
  ORDER BY ur.school_id, ur.role_id
$$;

REVOKE ALL ON FUNCTION public.resolve_my_app_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_my_app_roles() FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_my_app_roles() TO authenticated;

COMMENT ON FUNCTION public.resolve_my_app_roles() IS
  'Returns school_id + role_id rows for auth.uid() only. SECURITY DEFINER so the client can resolve its institutional role without trusting user_metadata.';
