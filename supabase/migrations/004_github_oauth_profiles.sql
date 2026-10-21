-- Make profile creation work for GitHub OAuth users, who may not share an email.
-- Run after 003_payment_controls_and_private_rosters.sql.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username_source TEXT;
  v_username TEXT;
  v_display_name TEXT;
BEGIN
  v_username_source := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'user_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'preferred_username'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'login'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), '')
  );

  v_username := trim(both '_' FROM regexp_replace(lower(COALESCE(v_username_source, '')), '[^a-z0-9_]+', '_', 'g'));
  IF length(v_username) < 3 THEN
    v_username := 'player_' || left(replace(NEW.id::TEXT, '-', ''), 8);
  END IF;
  v_username := left(v_username, 24);

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_username)) LOOP
    v_username := left(v_username, 17) || '_' || left(replace(gen_random_uuid()::TEXT, '-', ''), 6);
  END LOOP;

  v_display_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'user_name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    v_username
  );

  INSERT INTO public.profiles (
    id, username, display_name, avatar_url, bgmi_ign, bgmi_uid,
    free_fire_ign, free_fire_uid, role, account_status, current_rating
  ) VALUES (
    NEW.id, v_username, v_display_name,
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'bgmi_ign', NEW.raw_user_meta_data->>'bgmi_uid',
    NEW.raw_user_meta_data->>'free_fire_ign', NEW.raw_user_meta_data->>'free_fire_uid',
    'player', 'active', 1000
  );
  RETURN NEW;
END;
$$;
