-- Save the phone number supplied during signup into the private contact table.
-- Run after 009_admin_team_match_and_verification_controls.sql.

CREATE OR REPLACE FUNCTION public.capture_new_user_contact_details()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_number TEXT := NULLIF(trim(NEW.raw_user_meta_data->>'phone_number'), '');
BEGIN
  -- The existing profile-creation trigger is named on_auth_user_created.
  -- This trigger's longer name runs after it, so the profile FK already exists.
  IF v_phone_number IS NOT NULL
     AND v_phone_number ~ '^[+]?[0-9][0-9[:space:]().-]{6,18}$' THEN
    INSERT INTO public.player_contact_details (player_id, phone_number)
    VALUES (NEW.id, v_phone_number)
    ON CONFLICT (player_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_new_user_contact_details() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_contact ON auth.users;
CREATE TRIGGER on_auth_user_created_contact
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.capture_new_user_contact_details();

-- Backfill contact rows for accounts that already have a valid phone number in
-- signup metadata. Existing profile-page contact entries remain unchanged.
INSERT INTO public.player_contact_details (player_id, phone_number)
SELECT u.id, trim(u.raw_user_meta_data->>'phone_number')
FROM auth.users AS u
JOIN public.profiles AS p ON p.id = u.id
WHERE NULLIF(trim(u.raw_user_meta_data->>'phone_number'), '') ~ '^[+]?[0-9][0-9[:space:]().-]{6,18}$'
ON CONFLICT (player_id) DO NOTHING;
