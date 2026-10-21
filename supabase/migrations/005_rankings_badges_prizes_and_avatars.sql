-- Persistent individual/team rankings, prize awards, badge ratings, and avatars.
-- Run after 004_github_oauth_profiles.sql in the Supabase SQL editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS highest_rating INTEGER NOT NULL DEFAULT 1000;
UPDATE public.profiles
  SET highest_rating = GREATEST(highest_rating, current_rating);

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  game TEXT NOT NULL,
  captain_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  current_rating INTEGER NOT NULL DEFAULT 1000,
  highest_rating INTEGER NOT NULL DEFAULT 1000,
  tournaments_played INTEGER NOT NULL DEFAULT 0,
  total_wins INTEGER NOT NULL DEFAULT 0,
  total_kills INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_game_name ON public.teams (game, lower(name));
CREATE INDEX IF NOT EXISTS idx_teams_rating ON public.teams (current_rating DESC, total_wins DESC);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Team rankings are public" ON public.teams;
CREATE POLICY "Team rankings are public" ON public.teams FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.teams FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.teams TO anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'teams') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
    END IF;
  END IF;
END;
$$;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.assign_registration_team()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game TEXT;
  v_team_size INTEGER;
  v_name TEXT;
BEGIN
  SELECT game, team_size INTO v_game, v_team_size
    FROM public.tournaments WHERE id = NEW.tournament_id;
  IF v_team_size > 1 THEN
    SELECT COALESCE(NULLIF(trim(NEW.team_name), ''), p.username)
      INTO v_name FROM public.profiles p WHERE p.id = NEW.captain_id;
    INSERT INTO public.teams (name, game, captain_id)
      VALUES (v_name, v_game, NEW.captain_id)
      ON CONFLICT (game, (lower(name))) DO UPDATE SET updated_at = now()
      RETURNING id INTO NEW.team_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assign_registration_team ON public.registrations;
CREATE TRIGGER assign_registration_team
  BEFORE INSERT OR UPDATE OF tournament_id, team_name ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.assign_registration_team();

-- Link historic teams and any roster identities already present on a player profile.
INSERT INTO public.teams (name, game, captain_id)
SELECT DISTINCT COALESCE(NULLIF(trim(r.team_name), ''), p.username), t.game, r.captain_id
FROM public.registrations r
JOIN public.tournaments t ON t.id = r.tournament_id AND t.team_size > 1
JOIN public.profiles p ON p.id = r.captain_id
ON CONFLICT (game, (lower(name))) DO NOTHING;
UPDATE public.registrations r
SET team_id = tm.id
FROM public.tournaments t, public.teams tm
WHERE t.id = r.tournament_id AND t.team_size > 1
  AND tm.game = t.game AND lower(tm.name) = lower(COALESCE(NULLIF(trim(r.team_name), ''), (SELECT p.username FROM public.profiles p WHERE p.id = r.captain_id)))
  AND r.team_id IS NULL;
UPDATE public.registration_members rm SET player_id = (
  SELECT p.id
  FROM public.registrations r
  JOIN public.tournaments t ON t.id = r.tournament_id
  JOIN public.profiles p ON
    (upper(t.game) = 'BGMI' AND p.bgmi_uid = rm.uid)
    OR (upper(t.game) = 'FREE FIRE' AND p.free_fire_uid = rm.uid)
  WHERE r.id = rm.registration_id
  LIMIT 1
)
WHERE rm.player_id IS NULL AND EXISTS (
  SELECT 1 FROM public.registrations r JOIN public.tournaments t ON t.id = r.tournament_id
  JOIN public.profiles p ON
    (upper(t.game) = 'BGMI' AND p.bgmi_uid = rm.uid)
    OR (upper(t.game) = 'FREE FIRE' AND p.free_fire_uid = rm.uid)
  WHERE r.id = rm.registration_id
);

CREATE TABLE IF NOT EXISTS public.team_rating_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
  match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  previous_rating INTEGER NOT NULL,
  rating_change INTEGER NOT NULL,
  new_rating INTEGER NOT NULL,
  description TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_rating_events_team ON public.team_rating_events(team_id, created_at DESC);
ALTER TABLE public.team_rating_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_rating_events FROM PUBLIC, anon, authenticated;

-- Carry forward historical team results recorded against the old captain-only rating.
INSERT INTO public.team_rating_events (team_id, tournament_id, match_id, previous_rating,
  rating_change, new_rating, description, idempotency_key, created_at)
SELECT historic.team_id, historic.tournament_id, historic.match_id, historic.previous_rating,
  historic.rating_change, historic.new_rating, historic.description,
  'team-rating-backfill-' || historic.team_id::TEXT || '-' || historic.match_id::TEXT,
  historic.created_at
FROM (
  SELECT DISTINCT ON (r.team_id, m.id) r.team_id, m.tournament_id, m.id AS match_id,
    e.previous_rating, e.rating_change, e.new_rating, e.description, e.created_at
  FROM public.match_participants mp
  JOIN public.matches m ON m.id = mp.match_id AND m.status = 'completed'
  JOIN public.tournaments t ON t.id = m.tournament_id AND t.status <> 'cancelled'
  JOIN public.registrations r ON r.id = mp.registration_id AND r.team_id IS NOT NULL
  JOIN public.rating_events e ON e.match_id = m.id AND e.player_id = r.captain_id
  ORDER BY r.team_id, m.id, e.created_at
) historic
ON CONFLICT (idempotency_key) DO NOTHING;

-- Backfill completed team stats from match score rows already recorded.
WITH historic AS (
  SELECT r.team_id,
    count(DISTINCT m.tournament_id)::INTEGER AS tournaments_played,
    count(*) FILTER (WHERE mp.is_winner)::INTEGER AS total_wins,
    sum(mp.kills)::INTEGER AS total_kills,
    sum(mp.points)::INTEGER AS total_points
  FROM public.match_participants mp
  JOIN public.matches m ON m.id = mp.match_id AND m.status = 'completed'
  JOIN public.tournaments t ON t.id = m.tournament_id AND t.status <> 'cancelled'
  JOIN public.registrations r ON r.id = mp.registration_id AND r.team_id IS NOT NULL
  GROUP BY r.team_id
)
UPDATE public.teams tm SET
  tournaments_played = historic.tournaments_played,
  total_wins = historic.total_wins,
  total_kills = historic.total_kills,
  total_points = historic.total_points,
  updated_at = now()
FROM historic WHERE historic.team_id = tm.id;

-- Give linked teammates a result history too. Older result rows do not have
-- individual kill counts, so their score rating follows the previous team result.
INSERT INTO public.rating_events (player_id, tournament_id, match_id, previous_rating,
  rating_change, new_rating, description, idempotency_key, created_at)
SELECT DISTINCT rm.player_id, e.tournament_id, e.match_id, e.previous_rating,
  e.rating_change, e.new_rating, e.description,
  'rating-' || e.match_id::TEXT || '-' || rm.player_id::TEXT, e.created_at
FROM public.match_participants mp
JOIN public.matches m ON m.id = mp.match_id AND m.status = 'completed'
JOIN public.tournaments t ON t.id = m.tournament_id AND t.status <> 'cancelled'
JOIN public.registrations r ON r.id = mp.registration_id
JOIN public.registration_members rm ON rm.registration_id = r.id
JOIN public.rating_events e ON e.match_id = m.id AND e.player_id = r.captain_id
WHERE rm.player_id IS NOT NULL AND rm.player_id <> r.captain_id
ON CONFLICT (idempotency_key) DO NOTHING;

-- Recalculate current and peak ratings from the full event stream and rebuild
-- displayed player totals from scored matches rather than signup attempts.
WITH RECURSIVE ranked_events AS (
  SELECT e.player_id, e.rating_change,
    row_number() OVER (PARTITION BY e.player_id ORDER BY e.created_at, e.id) AS event_number
  FROM public.rating_events e
), rating_walk AS (
  SELECT p.id AS player_id, 0::BIGINT AS event_number, 1000::INTEGER AS rating FROM public.profiles p
  UNION ALL
  SELECT e.player_id, e.event_number, GREATEST(500, w.rating + e.rating_change)
  FROM rating_walk w JOIN ranked_events e ON e.player_id = w.player_id AND e.event_number = w.event_number + 1
), rating_totals AS (
  SELECT player_id, (array_agg(rating ORDER BY event_number DESC))[1] AS current_rating,
    max(rating) AS highest_rating FROM rating_walk GROUP BY player_id
), player_stats AS (
  SELECT roster.player_id,
    count(DISTINCT roster.tournament_id)::INTEGER AS total_tournaments,
    count(*) FILTER (WHERE roster.is_winner)::INTEGER AS total_wins,
    COALESCE(sum(roster.player_kills), 0)::INTEGER AS total_kills
  FROM (
    SELECT DISTINCT r.captain_id AS player_id, m.tournament_id, m.id AS match_id, mp.is_winner,
      CASE WHEN t.team_size = 1 THEN mp.kills ELSE COALESCE((mp.stats->'member_kills'->>(
        SELECT rm.uid FROM public.registration_members rm
        WHERE rm.registration_id = r.id AND rm.player_id = r.captain_id LIMIT 1
      ))::INTEGER, 0) END AS player_kills
    FROM public.match_participants mp
    JOIN public.matches m ON m.id = mp.match_id AND m.status = 'completed'
    JOIN public.tournaments t ON t.id = m.tournament_id AND t.status <> 'cancelled'
    JOIN public.registrations r ON r.id = mp.registration_id
    UNION
    SELECT DISTINCT rm.player_id, m.tournament_id, m.id, mp.is_winner,
      CASE WHEN t.team_size = 1 THEN mp.kills ELSE COALESCE((mp.stats->'member_kills'->>rm.uid)::INTEGER, 0) END
    FROM public.match_participants mp
    JOIN public.matches m ON m.id = mp.match_id AND m.status = 'completed'
    JOIN public.tournaments t ON t.id = m.tournament_id AND t.status <> 'cancelled'
    JOIN public.registration_members rm ON rm.registration_id = mp.registration_id AND rm.player_id IS NOT NULL
  ) roster GROUP BY roster.player_id
)
UPDATE public.profiles p SET
  current_rating = rt.current_rating,
  highest_rating = rt.highest_rating,
  total_tournaments = COALESCE(ps.total_tournaments, 0),
  total_wins = COALESCE(ps.total_wins, 0),
  total_kills = COALESCE(ps.total_kills, 0),
  updated_at = now()
FROM rating_totals rt LEFT JOIN player_stats ps ON ps.player_id = rt.player_id
WHERE p.id = rt.player_id;

WITH latest_team_event AS (
  SELECT DISTINCT ON (team_id) team_id, new_rating
  FROM public.team_rating_events ORDER BY team_id, created_at DESC, id DESC
), peak_team_rating AS (
  SELECT team_id, max(new_rating) AS highest_rating FROM public.team_rating_events GROUP BY team_id
)
UPDATE public.teams tm SET current_rating = COALESCE(latest.new_rating, 1000),
  highest_rating = GREATEST(1000, COALESCE(peak.highest_rating, 1000)), updated_at = now()
FROM latest_team_event latest LEFT JOIN peak_team_rating peak ON peak.team_id = latest.team_id
WHERE tm.id = latest.team_id;

CREATE TABLE IF NOT EXISTS public.prize_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  place INTEGER NOT NULL CHECK (place > 0),
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_by UUID REFERENCES public.profiles(id),
  paid_at TIMESTAMPTZ,
  transfer_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, registration_id)
);
ALTER TABLE public.prize_awards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Players and admins can view prize awards" ON public.prize_awards;
CREATE POLICY "Players and admins can view prize awards" ON public.prize_awards
  FOR SELECT USING (player_id = auth.uid() OR public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.prize_awards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.prize_awards TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_prize_award_paid(p_award_id UUID, p_transfer_reference TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  UPDATE public.prize_awards SET status = 'paid', paid_by = auth.uid(), paid_at = now(),
    transfer_reference = NULLIF(trim(p_transfer_reference), '')
  WHERE id = p_award_id AND status = 'pending';
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Pending prize award not found.'); END IF;
  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
  VALUES (auth.uid(), 'PRIZE_MARKED_PAID', 'prize_awards', p_award_id::TEXT,
    jsonb_build_object('transfer_reference', p_transfer_reference));
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_prize_award_paid(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_prize_award_paid(UUID, TEXT) TO authenticated;

-- Public avatars may be viewed by anyone; each signed-in player can upload only
-- beneath their own UUID folder. The public bucket is served by public URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 3145728,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  );
DROP POLICY IF EXISTS "Users can read their own avatar objects" ON storage.objects;
CREATE POLICY "Users can read their own avatar objects" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  );
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  ) WITH CHECK (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  );
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  );

-- Counts now describe events with recorded results, rather than registrations.
CREATE OR REPLACE FUNCTION public.register_tournament_atomic(
  p_tournament_id UUID, p_captain_id UUID, p_team_name TEXT, p_members JSONB
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
  v_player_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_captain_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in as the player registering this team.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This account cannot register for tournaments.');
  END IF;
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Tournament not found.'); END IF;
  IF v_tournament.status <> 'open' THEN RETURN jsonb_build_object('success', false, 'error', 'Tournament is not open for registration.'); END IF;
  IF v_tournament.entry_fee_paise > 0 AND COALESCE((SELECT setting_value FROM public.platform_settings WHERE setting_key = 'paid_registration_enabled'), 'false') <> 'true' THEN
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
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_members) AS members(value)
    WHERE length(trim(value->>'ign')) < 2 OR trim(value->>'uid') !~ '^[0-9]{5,}$') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Every player needs an in-game name and player ID.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.registrations WHERE tournament_id = p_tournament_id AND captain_id = p_captain_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are already registered for this tournament.');
  END IF;
  SELECT count(*) INTO v_active_count FROM public.registrations WHERE tournament_id = p_tournament_id
    AND status IN ('confirmed', 'payment_submitted', 'pending_payment');
  IF v_active_count >= v_tournament.max_slots THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament has reached maximum slot capacity.');
  END IF;
  v_status := CASE WHEN v_tournament.entry_fee_paise = 0 THEN 'confirmed' ELSE 'pending_payment' END;
  v_reg_code := 'VYR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  INSERT INTO public.registrations (tournament_id, captain_id, team_name, registration_code, status, slot_number)
  VALUES (p_tournament_id, p_captain_id, COALESCE(NULLIF(trim(p_team_name), ''), p_members->0->>'ign'),
    v_reg_code, v_status, v_active_count + 1) RETURNING id INTO v_reg_id;
  FOR v_member IN SELECT value FROM jsonb_array_elements(p_members) LOOP
    IF v_index = 0 THEN
      v_player_id := p_captain_id;
    ELSIF upper(v_tournament.game) = 'BGMI' THEN
      SELECT id INTO v_player_id FROM public.profiles WHERE bgmi_uid = trim(v_member->>'uid') LIMIT 1;
    ELSIF upper(v_tournament.game) = 'FREE FIRE' THEN
      SELECT id INTO v_player_id FROM public.profiles WHERE free_fire_uid = trim(v_member->>'uid') LIMIT 1;
    ELSE
      v_player_id := NULL;
    END IF;
    INSERT INTO public.registration_members (registration_id, player_id, ign, uid, role)
    VALUES (v_reg_id, v_player_id, trim(v_member->>'ign'), trim(v_member->>'uid'),
      CASE WHEN v_index = 0 THEN 'captain' ELSE 'member' END);
    v_index := v_index + 1;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'registration_id', v_reg_id,
    'registration_code', v_reg_code, 'status', v_status);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'You are already registered for this tournament.');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.register_tournament_atomic(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_tournament_atomic(UUID, UUID, TEXT, JSONB) TO authenticated;

-- Payment review only confirms the slot. It does not award a tournament played.
CREATE OR REPLACE FUNCTION public.review_payment(p_payment_id UUID, p_approve BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_payment public.payments%ROWTYPE; v_registration public.registrations%ROWTYPE;
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
  UPDATE public.payments SET payment_status = CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END,
    rejection_reason = CASE WHEN p_approve THEN NULL ELSE NULLIF(trim(p_reason), '') END,
    verified_by = auth.uid(), verified_at = now(), updated_at = now() WHERE id = p_payment_id;
  UPDATE public.registrations SET status = CASE WHEN p_approve THEN 'confirmed' ELSE 'rejected' END,
    updated_at = now() WHERE id = v_registration.id;
  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
  VALUES (auth.uid(), CASE WHEN p_approve THEN 'PAYMENT_VERIFIED' ELSE 'PAYMENT_REJECTED' END,
    'payments', p_payment_id::TEXT, jsonb_build_object('registration_id', v_registration.id,
      'reason', p_reason, 'transaction_reference', v_payment.transaction_reference));
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.review_payment(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_payment(UUID, BOOLEAN, TEXT) TO authenticated;

-- Finalize result rows and update every linked roster player plus the persistent team.
CREATE OR REPLACE FUNCTION public.finalize_match_results(p_match_id UUID, p_results JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_item JSONB;
  v_registration public.registrations%ROWTYPE;
  v_placement INTEGER;
  v_kills INTEGER;
  v_player_kills INTEGER;
  v_points INTEGER;
  v_winner BOOLEAN;
  v_delta INTEGER;
  v_player_delta INTEGER;
  v_previous_rating INTEGER;
  v_new_rating INTEGER;
  v_opponent_rating INTEGER;
  v_expected NUMERIC;
  v_player_id UUID;
  v_key TEXT;
  v_player_snapshot JSONB;
  v_team_snapshot JSONB;
  v_result_count INTEGER;
  v_participant_count INTEGER;
  v_member_kill_count INTEGER;
  v_member_kill_sum INTEGER;
  v_award_amount INTEGER;
  v_is_final BOOLEAN := false;
  v_first_player_event BOOLEAN;
  v_first_team_event BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Match not found.'); END IF;
  IF v_match.status = 'completed' THEN RETURN jsonb_build_object('success', false, 'error', 'Match has already been finalized.'); END IF;
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_match.tournament_id FOR UPDATE;
  IF NOT FOUND OR v_tournament.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cancelled events cannot publish results or prizes.');
  END IF;
  IF COALESCE(jsonb_typeof(p_results), '') <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submit a result for each match participant.');
  END IF;
  SELECT count(*) INTO v_result_count FROM jsonb_array_elements(p_results);
  SELECT count(*) INTO v_participant_count FROM public.match_participants WHERE match_id = p_match_id;
  IF v_result_count = 0 OR v_result_count <> v_participant_count OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_results) AS results(value)
    GROUP BY value->>'registrationId' HAVING count(*) > 1
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submit exactly one result for every participant.');
  END IF;

  SELECT COALESCE(jsonb_object_agg(players.player_id::TEXT, players.current_rating), '{}'::JSONB)
    INTO v_player_snapshot
  FROM (
    SELECT DISTINCT p.id AS player_id, p.current_rating
    FROM public.match_participants mp
    JOIN public.registrations r ON r.id = mp.registration_id
    JOIN public.profiles p ON p.id = r.captain_id
    WHERE mp.match_id = p_match_id
    UNION
    SELECT DISTINCT p.id, p.current_rating
    FROM public.match_participants mp
    JOIN public.registration_members rm ON rm.registration_id = mp.registration_id
    JOIN public.profiles p ON p.id = rm.player_id
    WHERE mp.match_id = p_match_id
  ) players;
  SELECT COALESCE(jsonb_object_agg(tm.id::TEXT, tm.current_rating), '{}'::JSONB)
    INTO v_team_snapshot
  FROM public.match_participants mp
  JOIN public.registrations r ON r.id = mp.registration_id
  JOIN public.teams tm ON tm.id = r.team_id
  WHERE mp.match_id = p_match_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
    v_placement := NULLIF(v_item->>'placement', '')::INTEGER;
    v_kills := GREATEST(0, COALESCE((v_item->>'kills')::INTEGER, 0));
    v_points := GREATEST(0, COALESCE((v_item->>'points')::INTEGER, 0));
    v_winner := COALESCE((v_item->>'isWinner')::BOOLEAN, false);
    SELECT * INTO v_registration FROM public.registrations WHERE id = (v_item->>'registrationId')::UUID;
    IF NOT FOUND THEN RAISE EXCEPTION 'Result includes an unknown registration.'; END IF;
    IF v_item ? 'memberKills' THEN
      IF jsonb_typeof(v_item->'memberKills') <> 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Individual kills must be entered as a player-by-player list.');
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_each_text(v_item->'memberKills') AS entries(uid, kills) WHERE kills !~ '^[0-9]+$')
        OR EXISTS (SELECT 1 FROM jsonb_each_text(v_item->'memberKills') AS entries(uid, kills)
          WHERE NOT EXISTS (SELECT 1 FROM public.registration_members rm
            WHERE rm.registration_id = v_registration.id AND rm.uid = entries.uid)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Individual kills contain an invalid player or value.');
      END IF;
      SELECT count(*)::INTEGER, COALESCE(sum(entries.kills::INTEGER), 0)::INTEGER
        INTO v_member_kill_count, v_member_kill_sum
      FROM jsonb_each_text(v_item->'memberKills') AS entries(uid, kills);
      IF v_member_kill_count <> v_tournament.team_size OR v_member_kill_sum <> v_kills THEN
        RETURN jsonb_build_object('success', false, 'error', 'Individual kills must include every squad member and add up to the squad kill total.');
      END IF;
    END IF;
    UPDATE public.match_participants SET placement = v_placement, kills = v_kills,
      points = v_points, is_winner = v_winner,
      stats = COALESCE(stats, '{}'::JSONB) || CASE
        WHEN jsonb_typeof(v_item->'memberKills') = 'object' THEN jsonb_build_object('member_kills', v_item->'memberKills')
        ELSE '{}'::JSONB END,
      updated_at = now()
      WHERE match_id = p_match_id AND registration_id = (v_item->>'registrationId')::UUID;
    IF NOT FOUND THEN RAISE EXCEPTION 'Result includes a player who is not in this match.'; END IF;

    IF v_match.format ILIKE '%1v1%' OR v_match.format ILIKE '%elimination%' OR v_tournament.tournament_format = 'Single Elimination' THEN
      SELECT COALESCE(
          v_team_snapshot->>(opp.team_id::TEXT),
          v_player_snapshot->>(opp.captain_id::TEXT),
          '1000'
        )::INTEGER
        INTO v_opponent_rating
      FROM public.match_participants omp
      JOIN public.registrations opp ON opp.id = omp.registration_id
      WHERE omp.match_id = p_match_id AND omp.registration_id <> v_registration.id
      ORDER BY omp.participant_slot LIMIT 1;
      v_previous_rating := COALESCE(
        (v_team_snapshot->>v_registration.team_id::TEXT)::INTEGER,
        (v_player_snapshot->>v_registration.captain_id::TEXT)::INTEGER, 1000
      );
      v_expected := 1 / (1 + power(10, (COALESCE(v_opponent_rating, 1000) - v_previous_rating)::NUMERIC / 400));
      v_delta := round(32 * ((CASE WHEN v_winner THEN 1 ELSE 0 END) - v_expected))::INTEGER;
    ELSE
      v_delta := CASE
        WHEN v_placement = 1 THEN 35 WHEN v_placement = 2 THEN 24 WHEN v_placement = 3 THEN 18
        WHEN v_placement <= 5 THEN 12 WHEN v_placement <= 10 THEN 6
        WHEN v_placement <= 15 THEN -2 WHEN v_placement <= 20 THEN -8 ELSE -14
      END + v_kills * 3;
      v_previous_rating := COALESCE(
        (v_team_snapshot->>v_registration.team_id::TEXT)::INTEGER,
        (v_player_snapshot->>v_registration.captain_id::TEXT)::INTEGER, 1000
      );
    END IF;
    UPDATE public.match_participants SET stats = COALESCE(stats, '{}'::JSONB) ||
      jsonb_build_object('team_rating_change', v_delta)
      WHERE match_id = p_match_id AND registration_id = v_registration.id;

    IF v_registration.team_id IS NOT NULL THEN
      SELECT NOT EXISTS (SELECT 1 FROM public.team_rating_events e
        WHERE e.team_id = v_registration.team_id AND e.tournament_id = v_match.tournament_id)
        INTO v_first_team_event;
      v_key := 'team-rating-' || p_match_id::TEXT || '-' || v_registration.team_id::TEXT;
      v_new_rating := GREATEST(500, v_previous_rating + v_delta);
      INSERT INTO public.team_rating_events (team_id, tournament_id, match_id, previous_rating,
        rating_change, new_rating, description, idempotency_key)
      VALUES (v_registration.team_id, v_match.tournament_id, p_match_id, v_previous_rating, v_delta,
        v_new_rating, v_match.round_label, v_key) ON CONFLICT (idempotency_key) DO NOTHING;
      IF FOUND THEN
        UPDATE public.teams SET
          current_rating = GREATEST(500, current_rating + v_delta),
          highest_rating = GREATEST(highest_rating, current_rating + v_delta),
          tournaments_played = tournaments_played + CASE WHEN v_first_team_event THEN 1 ELSE 0 END,
          total_wins = total_wins + CASE WHEN v_winner THEN 1 ELSE 0 END,
          total_kills = total_kills + v_kills,
          total_points = total_points + v_points,
          updated_at = now()
        WHERE id = v_registration.team_id;
      END IF;
    END IF;

    FOR v_player_id IN
      SELECT p.id FROM public.profiles p WHERE p.id = v_registration.captain_id
      UNION
      SELECT p.id FROM public.registration_members rm JOIN public.profiles p ON p.id = rm.player_id
        WHERE rm.registration_id = v_registration.id
    LOOP
      SELECT NOT EXISTS (SELECT 1 FROM public.rating_events e
        WHERE e.player_id = v_player_id AND e.tournament_id = v_match.tournament_id)
        INTO v_first_player_event;
      SELECT CASE WHEN v_tournament.team_size = 1 THEN v_kills ELSE 0 END INTO v_player_kills;
      SELECT (v_item->'memberKills'->>rm.uid)::INTEGER INTO v_player_kills
      FROM public.registration_members rm
      WHERE rm.registration_id = v_registration.id AND rm.player_id = v_player_id
        AND jsonb_typeof(v_item->'memberKills') = 'object'
      LIMIT 1;
      IF NOT FOUND THEN v_player_kills := CASE WHEN v_tournament.team_size = 1 THEN v_kills ELSE 0 END; END IF;
      v_player_delta := v_delta;
      IF v_tournament.team_size > 1
        AND v_match.format NOT ILIKE '%1v1%'
        AND v_match.format NOT ILIKE '%elimination%'
        AND v_tournament.tournament_format <> 'Single Elimination' THEN
        v_player_delta := v_delta - (v_kills * 3) + (v_player_kills * 3);
      END IF;
      SELECT current_rating INTO v_previous_rating FROM public.profiles WHERE id = v_player_id FOR UPDATE;
      v_new_rating := GREATEST(500, COALESCE(v_previous_rating, 1000) + v_player_delta);
      v_key := 'rating-' || p_match_id::TEXT || '-' || v_player_id::TEXT;
      INSERT INTO public.rating_events (player_id, tournament_id, match_id, previous_rating,
        rating_change, new_rating, description, idempotency_key)
      VALUES (v_player_id, v_match.tournament_id, p_match_id, COALESCE(v_previous_rating, 1000),
        v_player_delta, v_new_rating,
        v_match.round_label || CASE WHEN v_winner THEN ' · Victory' ELSE ' · Place #' || COALESCE(v_placement, 0) END,
        v_key) ON CONFLICT (idempotency_key) DO NOTHING;
      IF FOUND THEN
        UPDATE public.profiles SET
          current_rating = v_new_rating,
          highest_rating = GREATEST(highest_rating, v_new_rating),
          total_tournaments = total_tournaments + CASE WHEN v_first_player_event THEN 1 ELSE 0 END,
          total_wins = total_wins + CASE WHEN v_winner THEN 1 ELSE 0 END,
          total_kills = total_kills + v_player_kills,
          updated_at = now()
        WHERE id = v_player_id;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.matches SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = p_match_id;
  SELECT (
    v_match.round_label ~* '(^|[^a-z])final([^a-z]|$)'
    AND v_match.round_label !~* '(semi|quarter)[- ]?final'
  ) OR (
    v_tournament.tournament_format <> 'Single Elimination' AND NOT EXISTS (
      SELECT 1 FROM public.matches m WHERE m.tournament_id = v_match.tournament_id
        AND m.id <> p_match_id AND m.status IN ('scheduled', 'live')
    )
  ) INTO v_is_final;
  IF v_is_final THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
      v_placement := NULLIF(v_item->>'placement', '')::INTEGER;
      IF v_placement IS NULL THEN CONTINUE; END IF;
      SELECT round((pd.value->>'amount')::NUMERIC * 100)::INTEGER INTO v_award_amount
      FROM jsonb_array_elements(COALESCE(v_tournament.prize_distribution, '[]'::JSONB)) AS pd(value)
      WHERE COALESCE(
        NULLIF((regexp_match(COALESCE(pd.value->>'place', ''), '([0-9]+)'))[1], '')::INTEGER,
        CASE WHEN lower(COALESCE(pd.value->>'place', '')) ~ '(winner|champion|1st)' THEN 1 ELSE NULL END
      ) = v_placement
      LIMIT 1;
      IF COALESCE(v_award_amount, 0) > 0 THEN
        INSERT INTO public.prize_awards (tournament_id, registration_id, player_id, team_id, place, amount_paise)
        SELECT v_match.tournament_id, r.id, r.captain_id, r.team_id, v_placement, v_award_amount
        FROM public.registrations r WHERE r.id = (v_item->>'registrationId')::UUID
        ON CONFLICT (tournament_id, registration_id) DO NOTHING;
      END IF;
      v_award_amount := 0;
    END LOOP;
    UPDATE public.tournaments SET status = 'completed', updated_at = now()
      WHERE id = v_match.tournament_id AND status <> 'cancelled';
  END IF;
  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
  VALUES (auth.uid(), 'RESULT_FINALIZED', 'matches', p_match_id::TEXT,
    jsonb_build_object('results_count', jsonb_array_length(p_results), 'final_match', v_is_final));
  RETURN jsonb_build_object('success', true, 'final_match', v_is_final);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finalize_match_results(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_match_results(UUID, JSONB) TO authenticated;

-- If an event is cancelled after partial scoring, void its unspent awards and
-- rebuild rankings from the remaining completed matches so no cancelled result
-- remains on any player or team board.
CREATE OR REPLACE FUNCTION public.rebuild_rankings_after_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled' THEN
    DELETE FROM public.prize_awards WHERE tournament_id = NEW.id AND status = 'pending';
    DELETE FROM public.rating_events WHERE tournament_id = NEW.id;
    DELETE FROM public.team_rating_events WHERE tournament_id = NEW.id;

    WITH RECURSIVE ranked_events AS (
      SELECT e.player_id, e.rating_change,
        row_number() OVER (PARTITION BY e.player_id ORDER BY e.created_at, e.id) AS event_number
      FROM public.rating_events e WHERE e.tournament_id IS NOT NULL
    ), rating_walk AS (
      SELECT p.id AS player_id, 0::BIGINT AS event_number, 1000::INTEGER AS rating
      FROM public.profiles p
      UNION ALL
      SELECT e.player_id, e.event_number, GREATEST(500, w.rating + e.rating_change)
      FROM rating_walk w JOIN ranked_events e
        ON e.player_id = w.player_id AND e.event_number = w.event_number + 1
    ), rating_totals AS (
      SELECT player_id, (array_agg(rating ORDER BY event_number DESC))[1] AS current_rating,
        max(rating) AS highest_rating
      FROM rating_walk GROUP BY player_id
    ), player_stats AS (
      SELECT roster.player_id,
        count(DISTINCT roster.tournament_id)::INTEGER AS total_tournaments,
        count(*) FILTER (WHERE roster.is_winner)::INTEGER AS total_wins,
        COALESCE(sum(roster.player_kills), 0)::INTEGER AS total_kills
      FROM (
        SELECT DISTINCT r.captain_id AS player_id, m.tournament_id, m.id AS match_id,
          mp.is_winner,
          CASE WHEN t.team_size = 1 THEN mp.kills ELSE COALESCE((mp.stats->'member_kills'->>(
            SELECT rm.uid FROM public.registration_members rm
            WHERE rm.registration_id = r.id AND rm.player_id = r.captain_id LIMIT 1
          ))::INTEGER, 0) END AS player_kills
        FROM public.match_participants mp
        JOIN public.matches m ON m.id = mp.match_id AND m.status = 'completed'
        JOIN public.tournaments t ON t.id = m.tournament_id AND t.status <> 'cancelled'
        JOIN public.registrations r ON r.id = mp.registration_id
        UNION
        SELECT DISTINCT rm.player_id, m.tournament_id, m.id,
          mp.is_winner,
          CASE WHEN t.team_size = 1 THEN mp.kills ELSE COALESCE((mp.stats->'member_kills'->>rm.uid)::INTEGER, 0) END
        FROM public.match_participants mp
        JOIN public.matches m ON m.id = mp.match_id AND m.status = 'completed'
        JOIN public.tournaments t ON t.id = m.tournament_id AND t.status <> 'cancelled'
        JOIN public.registration_members rm ON rm.registration_id = mp.registration_id AND rm.player_id IS NOT NULL
      ) roster GROUP BY roster.player_id
    )
    UPDATE public.profiles p SET
      current_rating = COALESCE(rt.current_rating, 1000),
      highest_rating = COALESCE(rt.highest_rating, 1000),
      total_tournaments = COALESCE(ps.total_tournaments, 0),
      total_wins = COALESCE(ps.total_wins, 0),
      total_kills = COALESCE(ps.total_kills, 0),
      updated_at = now()
    FROM rating_totals rt FULL JOIN player_stats ps ON ps.player_id = rt.player_id
    WHERE p.id = COALESCE(rt.player_id, ps.player_id);

    -- Profiles with no remaining events/stats must also be reset.
    UPDATE public.profiles p SET current_rating = 1000, highest_rating = 1000,
      total_tournaments = 0, total_wins = 0, total_kills = 0, updated_at = now()
    WHERE NOT EXISTS (SELECT 1 FROM public.rating_events e WHERE e.player_id = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.match_participants mp
        JOIN public.matches m ON m.id = mp.match_id AND m.status = 'completed'
        JOIN public.tournaments t ON t.id = m.tournament_id AND t.status <> 'cancelled'
        JOIN public.registrations r ON r.id = mp.registration_id
        LEFT JOIN public.registration_members rm ON rm.registration_id = r.id
        WHERE r.captain_id = p.id OR rm.player_id = p.id
      );

    WITH RECURSIVE ranked_events AS (
      SELECT e.team_id, e.rating_change,
        row_number() OVER (PARTITION BY e.team_id ORDER BY e.created_at, e.id) AS event_number
      FROM public.team_rating_events e WHERE e.tournament_id IS NOT NULL
    ), rating_walk AS (
      SELECT tm.id AS team_id, 0::BIGINT AS event_number, 1000::INTEGER AS rating FROM public.teams tm
      UNION ALL
      SELECT e.team_id, e.event_number, GREATEST(500, w.rating + e.rating_change)
      FROM rating_walk w JOIN ranked_events e
        ON e.team_id = w.team_id AND e.event_number = w.event_number + 1
    ), rating_totals AS (
      SELECT team_id, (array_agg(rating ORDER BY event_number DESC))[1] AS current_rating,
        max(rating) AS highest_rating FROM rating_walk GROUP BY team_id
    ), team_stats AS (
      SELECT r.team_id, count(DISTINCT m.tournament_id)::INTEGER AS tournaments_played,
        count(*) FILTER (WHERE mp.is_winner)::INTEGER AS total_wins,
        COALESCE(sum(mp.kills), 0)::INTEGER AS total_kills,
        COALESCE(sum(mp.points), 0)::INTEGER AS total_points
      FROM public.match_participants mp
      JOIN public.matches m ON m.id = mp.match_id AND m.status = 'completed'
      JOIN public.tournaments t ON t.id = m.tournament_id AND t.status <> 'cancelled'
      JOIN public.registrations r ON r.id = mp.registration_id
      WHERE r.team_id IS NOT NULL GROUP BY r.team_id
    )
    UPDATE public.teams tm SET
      current_rating = COALESCE(rt.current_rating, 1000),
      highest_rating = COALESCE(rt.highest_rating, 1000),
      tournaments_played = COALESCE(ts.tournaments_played, 0),
      total_wins = COALESCE(ts.total_wins, 0),
      total_kills = COALESCE(ts.total_kills, 0),
      total_points = COALESCE(ts.total_points, 0),
      updated_at = now()
    FROM rating_totals rt FULL JOIN team_stats ts ON ts.team_id = rt.team_id
    WHERE tm.id = COALESCE(rt.team_id, ts.team_id);

    UPDATE public.teams tm SET current_rating = 1000, highest_rating = 1000,
      tournaments_played = 0, total_wins = 0, total_kills = 0, total_points = 0, updated_at = now()
    WHERE NOT EXISTS (SELECT 1 FROM public.team_rating_events e WHERE e.team_id = tm.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.match_participants mp
        JOIN public.matches m ON m.id = mp.match_id AND m.status = 'completed'
        JOIN public.tournaments t ON t.id = m.tournament_id AND t.status <> 'cancelled'
        JOIN public.registrations r ON r.id = mp.registration_id WHERE r.team_id = tm.id
      );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS rebuild_rankings_after_cancellation ON public.tournaments;
CREATE TRIGGER rebuild_rankings_after_cancellation
  AFTER UPDATE OF status ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.rebuild_rankings_after_cancellation();
