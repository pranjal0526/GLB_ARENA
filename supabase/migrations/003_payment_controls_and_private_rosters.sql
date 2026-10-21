-- Admin controls for paid registrations and privacy for participant rosters.
-- Run after 002_dual_game_backend.sql in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.get_paid_registration_enabled()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT setting_value = 'true'
    FROM public.platform_settings
    WHERE setting_key = 'paid_registration_enabled'
  ), false);
$$;
REVOKE EXECUTE ON FUNCTION public.get_paid_registration_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_paid_registration_enabled() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_paid_registration_enabled(p_enabled BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.';
  END IF;

  INSERT INTO public.platform_settings (setting_key, setting_value, updated_at)
  VALUES ('paid_registration_enabled', p_enabled::TEXT, now())
  ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value, updated_at = now();

  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
  VALUES (
    auth.uid(),
    CASE WHEN p_enabled THEN 'PAID_REGISTRATION_ENABLED' ELSE 'PAID_REGISTRATION_DISABLED' END,
    'platform_settings',
    'paid_registration_enabled',
    jsonb_build_object('enabled', p_enabled)
  );

  RETURN p_enabled;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_paid_registration_enabled(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_paid_registration_enabled(BOOLEAN) TO authenticated;

-- A player can see their own registration and admins can see all registrations.
-- Public slot counts come from get_tournament_registration_counts instead.
DROP POLICY IF EXISTS "Users can view their own registrations or public confirmed registrations"
  ON public.registrations;
DROP POLICY IF EXISTS "Players can view own registrations and admins can view all"
  ON public.registrations;
CREATE POLICY "Players can view own registrations and admins can view all"
  ON public.registrations FOR SELECT
  USING (captain_id = auth.uid() OR public.is_admin());

REVOKE SELECT ON public.registrations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.registrations TO authenticated;

-- In-game IDs and teammate rosters are visible only to the registering captain
-- and tournament administrators.
DROP POLICY IF EXISTS "Registration members are viewable by participants and admins"
  ON public.registration_members;
DROP POLICY IF EXISTS "Registration members visible to captain and admins"
  ON public.registration_members;
CREATE POLICY "Registration members visible to captain and admins"
  ON public.registration_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.id = registration_id
        AND (r.captain_id = auth.uid() OR public.is_admin())
    )
  );

REVOKE SELECT ON public.registration_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.registration_members TO authenticated;
