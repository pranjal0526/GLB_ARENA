-- Dual-game support and production backend hardening for BGMI and Free Fire.
-- Run after 001_initial_schema.sql in the Supabase SQL editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS free_fire_ign TEXT,
  ADD COLUMN IF NOT EXISTS free_fire_uid TEXT;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_settings FROM PUBLIC, anon, authenticated;
INSERT INTO public.platform_settings (setting_key, setting_value)
VALUES ('paid_registration_enabled', 'false')
ON CONFLICT (setting_key) DO NOTHING;

-- Only an administrator may change account state or competitive statistics.
REVOKE UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (display_name, avatar_url, bgmi_ign, bgmi_uid, free_fire_ign, free_fire_uid, updated_at)
  ON public.profiles TO authenticated;

-- Browser clients can read tournament/match information, but room credentials
-- are only returned through the access-checked functions below.
REVOKE SELECT ON public.tournaments FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, title, slug, description, game, mode, team_size, tournament_format,
  entry_fee_paise, prize_pool_paise, prize_distribution, max_slots,
  registration_opens_at, registration_closes_at, start_time, rules, banner_url,
  status, cancellation_reason, room_release_policy, room_released, created_by,
  created_at, updated_at
) ON public.tournaments TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_tournament_registration_counts(p_tournament_ids UUID[])
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(counts.tournament_id::TEXT, counts.registration_count), '{}'::JSONB)
  FROM (
    SELECT tournament_id, count(*) AS registration_count
    FROM public.registrations
    WHERE tournament_id = ANY(p_tournament_ids)
      AND status IN ('confirmed', 'payment_submitted', 'pending_payment')
    GROUP BY tournament_id
  ) counts;
$$;
REVOKE EXECUTE ON FUNCTION public.get_tournament_registration_counts(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tournament_registration_counts(UUID[]) TO anon, authenticated;

REVOKE SELECT ON public.matches FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, tournament_id, round_number, round_label, match_number, format,
  scheduled_time, status, room_released, created_by, completed_at, created_at,
  updated_at
) ON public.matches TO anon, authenticated;

-- Safe profile updates are exposed directly; sensitive/admin updates use RPCs.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  v_display_name TEXT;
BEGIN
  v_username := COALESCE(NULLIF(NEW.raw_user_meta_data->>'username', ''), split_part(NEW.email, '@', 1));
  v_display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), split_part(NEW.email, '@', 1));

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_username)) LOOP
    v_username := left(v_username, 18) || floor(random() * 100000)::TEXT;
  END LOOP;

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

-- Prevent the old, weaker registration function from being called by clients.
REVOKE EXECUTE ON FUNCTION public.register_tournament_atomic(UUID, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.register_tournament_atomic(UUID, UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.register_tournament_atomic(
  p_tournament_id UUID,
  p_captain_id UUID,
  p_team_name TEXT,
  p_members JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament public.tournaments%ROWTYPE;
  v_active_count INTEGER;
  v_reg_id UUID;
  v_reg_code TEXT;
  v_status TEXT;
  v_member JSONB;
  v_index INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_captain_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in as the player registering this team.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This account cannot register for tournaments.');
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found.');
  END IF;
  IF v_tournament.status <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament is not open for registration.');
  END IF;
  IF v_tournament.entry_fee_paise > 0 AND COALESCE((
    SELECT setting_value FROM public.platform_settings WHERE setting_key = 'paid_registration_enabled'
  ), 'false') <> 'true' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Paid registration is currently disabled. Check back soon.');
  END IF;
  IF now() < v_tournament.registration_opens_at OR now() > v_tournament.registration_closes_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registration is outside the allowed time window.');
  END IF;
  IF jsonb_typeof(p_members) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player identities must be submitted as a list.');
  END IF;
  IF jsonb_array_length(p_members) <> v_tournament.team_size THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter exactly ' || v_tournament.team_size || ' player identities.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_members) AS members(value)
    WHERE length(trim(value->>'ign')) < 2 OR trim(value->>'uid') !~ '^[0-9]{5,}$'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Every player needs an in-game name and player ID.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE tournament_id = p_tournament_id AND captain_id = p_captain_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are already registered for this tournament.');
  END IF;

  SELECT count(*) INTO v_active_count FROM public.registrations
    WHERE tournament_id = p_tournament_id
      AND status IN ('confirmed', 'payment_submitted', 'pending_payment');
  IF v_active_count >= v_tournament.max_slots THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament has reached maximum slot capacity.');
  END IF;

  v_status := CASE WHEN v_tournament.entry_fee_paise = 0 THEN 'confirmed' ELSE 'pending_payment' END;
  v_reg_code := 'VYR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  INSERT INTO public.registrations (
    tournament_id, captain_id, team_name, registration_code, status, slot_number
  ) VALUES (
    p_tournament_id, p_captain_id, COALESCE(NULLIF(trim(p_team_name), ''), p_members->0->>'ign'),
    v_reg_code, v_status, v_active_count + 1
  ) RETURNING id INTO v_reg_id;

  FOR v_member IN SELECT value FROM jsonb_array_elements(p_members) LOOP
    INSERT INTO public.registration_members (registration_id, player_id, ign, uid, role)
    VALUES (
      v_reg_id,
      CASE WHEN v_index = 0 THEN p_captain_id ELSE NULL END,
      trim(v_member->>'ign'), trim(v_member->>'uid'),
      CASE WHEN v_index = 0 THEN 'captain' ELSE 'member' END
    );
    v_index := v_index + 1;
  END LOOP;

  IF v_status = 'confirmed' THEN
    UPDATE public.profiles SET total_tournaments = total_tournaments + 1, updated_at = now()
      WHERE id = p_captain_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'registration_id', v_reg_id,
    'registration_code', v_reg_code, 'status', v_status
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'You are already registered for this tournament.');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.register_tournament_atomic(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_tournament_atomic(UUID, UUID, TEXT, JSONB) TO authenticated;

-- Registration writes go through the transaction function so clients cannot
-- mark paid entries confirmed or bypass the slot limit with direct table writes.
REVOKE INSERT, UPDATE ON public.registrations FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON public.registration_members FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.disqualify_registration(p_registration_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  UPDATE public.registrations SET status = 'disqualified',
    disqualification_reason = NULLIF(trim(p_reason), ''), updated_at = now()
    WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Registration not found.'); END IF;
  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
    VALUES (auth.uid(), 'PARTICIPANT_DISQUALIFIED', 'registrations', p_registration_id::TEXT,
      jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.disqualify_registration(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disqualify_registration(UUID, TEXT) TO authenticated;

-- Payment submission and organizer review are transactional and RLS checked.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique_reference
  ON public.payments (lower(trim(transaction_reference)));
REVOKE INSERT, UPDATE ON public.payments FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_upi_payment(
  p_registration_id UUID,
  p_transaction_reference TEXT,
  p_screenshot_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration public.registrations%ROWTYPE;
  v_amount INTEGER;
  v_payment public.payments%ROWTYPE;
BEGIN
  SELECT r.* INTO v_registration FROM public.registrations r
    WHERE r.id = p_registration_id AND r.captain_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Registration not found.'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This account cannot submit payments.');
  END IF;
  IF v_registration.status NOT IN ('pending_payment', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This registration is not awaiting payment.');
  END IF;
  SELECT entry_fee_paise INTO v_amount FROM public.tournaments WHERE id = v_registration.tournament_id;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'This tournament does not require a payment.');
  END IF;
  IF COALESCE((
    SELECT setting_value FROM public.platform_settings WHERE setting_key = 'paid_registration_enabled'
  ), 'false') <> 'true' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Paid registration is currently disabled.');
  END IF;
  IF length(trim(p_transaction_reference)) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid UPI reference number.');
  END IF;

  INSERT INTO public.payments (
    registration_id, amount_paise, transaction_reference, screenshot_url, payment_status
  ) VALUES (
    p_registration_id, v_amount, trim(p_transaction_reference), NULLIF(trim(p_screenshot_url), ''), 'submitted'
  ) RETURNING * INTO v_payment;
  UPDATE public.registrations SET status = 'payment_submitted', updated_at = now() WHERE id = p_registration_id;
  RETURN jsonb_build_object('success', true, 'payment', to_jsonb(v_payment));
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'That UPI reference was already submitted.');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_upi_payment(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_upi_payment(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_payment(
  p_payment_id UUID,
  p_approve BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Payment record not found.'); END IF;
  SELECT * INTO v_registration FROM public.registrations WHERE id = v_payment.registration_id FOR UPDATE;
  IF NOT FOUND OR v_registration.status <> 'payment_submitted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'The registration is no longer awaiting payment review.');
  END IF;
  IF v_payment.payment_status <> 'submitted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This payment has already been reviewed.');
  END IF;

  UPDATE public.payments SET
    payment_status = CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END,
    rejection_reason = CASE WHEN p_approve THEN NULL ELSE NULLIF(trim(p_reason), '') END,
    verified_by = auth.uid(), verified_at = now(), updated_at = now()
  WHERE id = p_payment_id;
  UPDATE public.registrations SET
    status = CASE WHEN p_approve THEN 'confirmed' ELSE 'rejected' END,
    updated_at = now()
  WHERE id = v_registration.id;
  IF p_approve THEN
    UPDATE public.profiles SET total_tournaments = total_tournaments + 1, updated_at = now()
      WHERE id = v_registration.captain_id;
  END IF;
  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
  VALUES (
    auth.uid(), CASE WHEN p_approve THEN 'PAYMENT_VERIFIED' ELSE 'PAYMENT_REJECTED' END,
    'payments', p_payment_id::text,
    jsonb_build_object('registration_id', v_registration.id, 'reason', p_reason,
      'transaction_reference', v_payment.transaction_reference)
  );
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.review_payment(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_payment(UUID, BOOLEAN, TEXT) TO authenticated;

-- Organizer-only account status changes cannot be issued through profile UPDATE.
CREATE OR REPLACE FUNCTION public.set_player_account_status(
  p_player_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF p_status NOT IN ('active', 'banned', 'suspended') THEN RAISE EXCEPTION 'Invalid account status.'; END IF;
  UPDATE public.profiles SET
    account_status = p_status,
    ban_reason = CASE WHEN p_status = 'active' THEN NULL ELSE NULLIF(trim(p_reason), '') END,
    banned_at = CASE WHEN p_status = 'active' THEN NULL ELSE now() END,
    updated_at = now()
  WHERE id = p_player_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Player not found.'); END IF;
  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
  VALUES (auth.uid(), CASE WHEN p_status = 'active' THEN 'PLAYER_UNBANNED' ELSE 'PLAYER_BANNED' END,
    'profiles', p_player_id::text, jsonb_build_object('status', p_status, 'reason', p_reason));
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_player_account_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_player_account_status(UUID, TEXT, TEXT) TO authenticated;

-- Room credentials are returned only to an active admin or confirmed entrant.
CREATE OR REPLACE FUNCTION public.get_tournament_room_credentials(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tournament public.tournaments%ROWTYPE;
BEGIN
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND OR NOT v_tournament.room_released THEN RETURN NULL; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active') THEN RETURN NULL; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.registrations WHERE tournament_id = p_tournament_id
      AND captain_id = auth.uid() AND status = 'confirmed'
  ) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('room_id', v_tournament.room_id, 'room_password', v_tournament.room_password);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_tournament_room_credentials(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tournament_room_credentials(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_match_room_credentials(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_match public.matches%ROWTYPE;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND OR NOT v_match.room_released THEN RETURN NULL; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active') THEN RETURN NULL; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.match_participants mp
      JOIN public.registrations r ON r.id = mp.registration_id
    WHERE mp.match_id = p_match_id AND r.captain_id = auth.uid() AND r.status = 'confirmed'
  ) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('room_id', v_match.room_id, 'room_password', v_match.room_password);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_match_room_credentials(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_match_room_credentials(UUID) TO authenticated;

-- Atomic match/participant creation for fixture generation and custom lobbies.
REVOKE INSERT, UPDATE ON public.match_participants FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.create_match_with_participants(
  p_tournament_id UUID,
  p_round_number INTEGER,
  p_round_label TEXT,
  p_match_number INTEGER,
  p_format TEXT,
  p_scheduled_time TIMESTAMPTZ,
  p_registration_ids UUID[],
  p_room_id TEXT DEFAULT NULL,
  p_room_password TEXT DEFAULT NULL,
  p_room_released BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_match_id UUID; v_registration_id UUID; v_slot INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = p_tournament_id) THEN
    RAISE EXCEPTION 'Tournament not found.';
  END IF;
  INSERT INTO public.matches (
    tournament_id, round_number, round_label, match_number, format,
    scheduled_time, status, room_id, room_password, room_released, created_by
  ) VALUES (
    p_tournament_id, p_round_number, p_round_label, p_match_number, p_format,
    p_scheduled_time, 'scheduled', p_room_id, p_room_password, p_room_released, auth.uid()
  ) RETURNING id INTO v_match_id;
  FOREACH v_registration_id IN ARRAY COALESCE(p_registration_ids, ARRAY[]::UUID[]) LOOP
    v_slot := v_slot + 1;
    INSERT INTO public.match_participants (match_id, registration_id, participant_slot)
    SELECT v_match_id, r.id, v_slot FROM public.registrations r
      WHERE r.id = v_registration_id AND r.tournament_id = p_tournament_id AND r.status = 'confirmed';
    IF NOT FOUND THEN RAISE EXCEPTION 'Participant is not confirmed for this tournament.'; END IF;
  END LOOP;
  RETURN v_match_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_match_with_participants(UUID, INTEGER, TEXT, INTEGER, TEXT, TIMESTAMPTZ, UUID[], TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_match_with_participants(UUID, INTEGER, TEXT, INTEGER, TEXT, TIMESTAMPTZ, UUID[], TEXT, TEXT, BOOLEAN) TO authenticated;

-- Store result rows, rating events, and player stats in one idempotent operation.
CREATE OR REPLACE FUNCTION public.finalize_match_results(p_match_id UUID, p_results JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_item JSONB;
  v_registration public.registrations%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_placement INTEGER;
  v_kills INTEGER;
  v_points INTEGER;
  v_winner BOOLEAN;
  v_delta INTEGER;
  v_key TEXT;
  v_expected NUMERIC;
  v_opponent_rating INTEGER;
  v_rating_snapshot JSONB;
  v_result_count INTEGER;
  v_match_participant_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Match not found.'); END IF;
  IF v_match.status = 'completed' THEN RETURN jsonb_build_object('success', false, 'error', 'Match has already been finalized.'); END IF;

  IF jsonb_typeof(p_results) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submit a result for each match participant.');
  END IF;
  SELECT count(*) INTO v_result_count FROM jsonb_array_elements(p_results);
  SELECT count(*) INTO v_match_participant_count FROM public.match_participants WHERE match_id = p_match_id;
  IF v_result_count = 0 OR v_result_count <> v_match_participant_count OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_results) AS results(value)
    GROUP BY value->>'registrationId' HAVING count(*) > 1
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submit exactly one result for every participant.');
  END IF;
  SELECT COALESCE(jsonb_object_agg(p.id::TEXT, p.current_rating), '{}'::JSONB)
    INTO v_rating_snapshot
    FROM public.match_participants mp
    JOIN public.registrations r ON r.id = mp.registration_id
    JOIN public.profiles p ON p.id = r.captain_id
    WHERE mp.match_id = p_match_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
    v_placement := NULLIF(v_item->>'placement', '')::INTEGER;
    v_kills := GREATEST(0, COALESCE((v_item->>'kills')::INTEGER, 0));
    v_points := GREATEST(0, COALESCE((v_item->>'points')::INTEGER, 0));
    v_winner := COALESCE((v_item->>'isWinner')::BOOLEAN, false);
    UPDATE public.match_participants SET placement = v_placement, kills = v_kills,
      points = v_points, is_winner = v_winner, updated_at = now()
      WHERE match_id = p_match_id AND registration_id = (v_item->>'registrationId')::UUID;
    IF NOT FOUND THEN RAISE EXCEPTION 'Result includes a player who is not in this match.'; END IF;

    SELECT * INTO v_registration FROM public.registrations WHERE id = (v_item->>'registrationId')::UUID;
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_registration.captain_id FOR UPDATE;
    v_profile.current_rating := COALESCE((v_rating_snapshot->>v_profile.id::TEXT)::INTEGER, v_profile.current_rating);
    UPDATE public.profiles SET total_kills = total_kills + v_kills,
      total_wins = total_wins + CASE WHEN v_winner THEN 1 ELSE 0 END,
      updated_at = now() WHERE id = v_profile.id;

    v_key := 'rating-' || p_match_id::TEXT || '-' || v_profile.id::TEXT;
    IF v_match.format ILIKE '%1v1%' OR v_match.format ILIKE '%elimination%' THEN
      SELECT COALESCE((v_rating_snapshot->>p.id::TEXT)::INTEGER, p.current_rating, 1000) INTO v_opponent_rating
        FROM public.match_participants mp JOIN public.registrations r ON r.id = mp.registration_id
        JOIN public.profiles p ON p.id = r.captain_id
        WHERE mp.match_id = p_match_id AND mp.registration_id <> v_registration.id LIMIT 1;
      v_expected := 1 / (1 + power(10, (COALESCE(v_opponent_rating, 1000) - v_profile.current_rating)::NUMERIC / 400));
      v_delta := round(32 * ((CASE WHEN v_winner THEN 1 ELSE 0 END) - v_expected))::INTEGER;
    ELSE
      v_delta := CASE
        WHEN v_placement = 1 THEN 35 WHEN v_placement = 2 THEN 24 WHEN v_placement = 3 THEN 18
        WHEN v_placement <= 5 THEN 12 WHEN v_placement <= 10 THEN 6
        WHEN v_placement <= 15 THEN -2 WHEN v_placement <= 20 THEN -8 ELSE -14
      END + v_kills * 3;
    END IF;

    INSERT INTO public.rating_events (
      player_id, tournament_id, match_id, previous_rating, rating_change,
      new_rating, description, idempotency_key
    ) VALUES (
      v_profile.id, v_match.tournament_id, p_match_id, v_profile.current_rating, v_delta,
      GREATEST(500, v_profile.current_rating + v_delta), v_match.round_label, v_key
    ) ON CONFLICT (idempotency_key) DO NOTHING;
    IF FOUND THEN
      UPDATE public.profiles SET current_rating = GREATEST(500, current_rating + v_delta), updated_at = now()
        WHERE id = v_profile.id;
    END IF;
  END LOOP;

  UPDATE public.matches SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = p_match_id;
  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
    VALUES (auth.uid(), 'RESULT_FINALIZED', 'matches', p_match_id::TEXT,
      jsonb_build_object('results_count', jsonb_array_length(p_results)));
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finalize_match_results(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_match_results(UUID, JSONB) TO authenticated;

-- Let admins write audit records through RLS; normal users still cannot.
DROP POLICY IF EXISTS "Admins can create audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can create audit logs" ON public.admin_audit_logs
  FOR INSERT WITH CHECK (public.is_admin());
