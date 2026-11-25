-- S05: get_user_role answers signed-in users only about THEMSELVES.
--
-- Supabase advisor: get_user_role(uuid) is SECURITY DEFINER and executable by `authenticated`, so any signed-in user
-- could ask for any other user's staff role through the API. It cannot simply be revoked: all 100 row-level security
-- policies call it as get_user_role((SELECT auth.uid())) with the caller's own privileges.
-- Now, for requests made through the API as `authenticated` or `anon`, any id other than the caller's own returns NULL.
-- Every policy keeps working (it always passes the caller's own id). The service role and direct database
-- connections (no API role) are unchanged.
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;

  SELECT s.role INTO v_role
  FROM profiles p
  JOIN staff s ON s.profile_id = p.id
  WHERE p.id = p_user_id AND s.is_active = TRUE;

  RETURN v_role;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;
