-- Private in-game ID evidence, admin-only review, and safe archive deletion.
-- Run after 006_sequential_battle_royale_match_numbers.sql.

CREATE TABLE IF NOT EXISTS public.player_game_id_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game TEXT NOT NULL CHECK (game IN ('BGMI', 'Free Fire')),
  game_ign TEXT NOT NULL,
  game_uid TEXT NOT NULL,
  screenshot_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_game_id_verifications_player_game
  ON public.player_game_id_verifications (player_id, game, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_id_verifications_pending
  ON public.player_game_id_verifications (submitted_at ASC) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_id_one_pending_verification
  ON public.player_game_id_verifications (player_id, game) WHERE status = 'pending';

ALTER TABLE public.player_game_id_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Players and admins can view game ID verification records"
  ON public.player_game_id_verifications;
CREATE POLICY "Players and admins can view game ID verification records"
  ON public.player_game_id_verifications FOR SELECT TO authenticated
  USING (
    (player_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active'))
    OR public.is_admin()
  );
REVOKE ALL ON public.player_game_id_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.player_game_id_verifications TO authenticated;

-- Keep a version trail for profile changes from account creation onward.
-- Deleting the account removes these player-linked snapshots as well.
CREATE TABLE IF NOT EXISTS public.player_profile_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username_snapshot TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'profile_updated', 'tracking_started')),
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  before_values JSONB,
  after_values JSONB NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_player_profile_events_player
  ON public.player_profile_events (player_id, created_at ASC);
ALTER TABLE public.player_profile_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view player profile history" ON public.player_profile_events;
CREATE POLICY "Admins can view player profile history"
  ON public.player_profile_events FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.player_profile_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.player_profile_events TO authenticated;

INSERT INTO public.player_profile_events (
  player_id, username_snapshot, event_type, changed_fields, after_values, created_at
)
SELECT p.id, p.username, 'tracking_started', ARRAY['tracking_started']::TEXT[],
  jsonb_build_object('display_name', p.display_name, 'avatar_url', p.avatar_url,
    'bgmi_ign', p.bgmi_ign, 'bgmi_uid', p.bgmi_uid, 'free_fire_ign', p.free_fire_ign,
    'free_fire_uid', p.free_fire_uid, 'role', p.role, 'account_status', p.account_status), now()
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.player_profile_events e WHERE e.player_id = p.id
);

CREATE OR REPLACE FUNCTION public.capture_player_profile_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fields TEXT[] := ARRAY[]::TEXT[];
  v_before JSONB := '{}'::JSONB;
  v_after JSONB := '{}'::JSONB;
  v_key TEXT;
  v_old JSONB;
  v_new JSONB;
  v_profile JSONB := to_jsonb(NEW);
BEGIN
  FOREACH v_key IN ARRAY ARRAY['display_name', 'avatar_url', 'bgmi_ign', 'bgmi_uid', 'free_fire_ign', 'free_fire_uid', 'role', 'account_status', 'ban_reason'] LOOP
    v_new := v_profile -> v_key;
    IF TG_OP = 'INSERT' THEN
      v_fields := array_append(v_fields, v_key);
      v_after := v_after || jsonb_build_object(v_key, v_new);
    ELSE
      v_old := to_jsonb(OLD) -> v_key;
      IF v_old IS DISTINCT FROM v_new THEN
        v_fields := array_append(v_fields, v_key);
        v_before := v_before || jsonb_build_object(v_key, v_old);
        v_after := v_after || jsonb_build_object(v_key, v_new);
      END IF;
    END IF;
  END LOOP;
  IF TG_OP = 'INSERT' OR cardinality(v_fields) > 0 THEN
    INSERT INTO public.player_profile_events (
      player_id, username_snapshot, event_type, changed_fields,
      before_values, after_values, actor_id
    ) VALUES (
      NEW.id, NEW.username, CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'profile_updated' END,
      v_fields, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE v_before END,
      v_after, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS capture_player_profile_event ON public.profiles;
CREATE TRIGGER capture_player_profile_event
  AFTER INSERT OR UPDATE OF display_name, avatar_url, bgmi_ign, bgmi_uid,
    free_fire_ign, free_fire_uid, role, account_status, ban_reason ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.capture_player_profile_event();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('game-id-verifications', 'game-id-verifications', false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Players can upload their own game ID evidence" ON storage.objects;
CREATE POLICY "Players can upload their own game ID evidence" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'game-id-verifications'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active')
  );
DROP POLICY IF EXISTS "Players and admins can read game ID evidence" ON storage.objects;
CREATE POLICY "Players and admins can read game ID evidence" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'game-id-verifications'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active')
      OR public.is_admin()
    )
  );
DROP POLICY IF EXISTS "Players can remove unused game ID uploads" ON storage.objects;
CREATE POLICY "Players can remove unused game ID uploads" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'game-id-verifications'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active')
    AND NOT EXISTS (
      SELECT 1 FROM public.player_game_id_verifications verification
      WHERE verification.screenshot_path = storage.objects.name
    )
  );

CREATE OR REPLACE FUNCTION public.submit_game_id_verification(
  p_game TEXT,
  p_screenshot_path TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_ign TEXT;
  v_uid TEXT;
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in to submit verification.');
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.account_status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active player account required.');
  END IF;
  IF p_game = 'BGMI' THEN
    v_ign := v_profile.bgmi_ign;
    v_uid := v_profile.bgmi_uid;
  ELSIF p_game = 'Free Fire' THEN
    v_ign := v_profile.free_fire_ign;
    v_uid := v_profile.free_fire_uid;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Choose BGMI or Free Fire.');
  END IF;
  IF length(trim(COALESCE(v_ign, ''))) < 2 OR trim(COALESCE(v_uid, '')) !~ '^[0-9]{5,}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Save a valid in-game name and numeric ID before uploading evidence.');
  END IF;
  IF p_screenshot_path !~ ('^' || auth.uid()::TEXT || '/' || replace(p_game, ' ', '_') || '/[A-Za-z0-9_.-]+$') THEN
    RETURN jsonb_build_object('success', false, 'error', 'The screenshot path is invalid. Upload the image again.');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'game-id-verifications' AND name = p_screenshot_path
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Screenshot upload was not found. Please upload it again.');
  END IF;

  INSERT INTO public.player_game_id_verifications (player_id, game, game_ign, game_uid, screenshot_path)
  VALUES (auth.uid(), p_game, trim(v_ign), trim(v_uid), p_screenshot_path)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'verification_id', v_id, 'status', 'pending');
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'A verification for this game is already awaiting review.');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_game_id_verification(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_game_id_verification(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_game_id_verification(
  p_verification_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.player_game_id_verifications%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF p_status NOT IN ('verified', 'rejected') THEN RAISE EXCEPTION 'Invalid review status.'; END IF;
  SELECT * INTO v_row FROM public.player_game_id_verifications WHERE id = p_verification_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Verification submission not found.'); END IF;
  IF v_row.status <> 'pending' THEN RETURN jsonb_build_object('success', false, 'error', 'This submission has already been reviewed.'); END IF;
  UPDATE public.player_game_id_verifications SET status = p_status,
    reviewer_id = auth.uid(), reviewer_note = NULLIF(trim(p_note), ''), reviewed_at = now()
  WHERE id = p_verification_id;
  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
  VALUES (auth.uid(), CASE WHEN p_status = 'verified' THEN 'GAME_ID_VERIFIED' ELSE 'GAME_ID_REJECTED' END,
    'player_game_id_verifications', p_verification_id::TEXT,
    jsonb_build_object('player_id', v_row.player_id, 'game', v_row.game, 'note', p_note));
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.review_game_id_verification(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_game_id_verification(UUID, TEXT, TEXT) TO authenticated;

-- Rebuild denormalized ratings and totals after a tournament or player is
-- removed. Historical match rows remain the source of truth for all totals.
CREATE OR REPLACE FUNCTION public.rebuild_competitive_rankings()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A deleted captain cascades their registration and scores. Remove the
  -- corresponding player/team rating events before rebuilding the aggregates.
  DELETE FROM public.rating_events e
  WHERE e.match_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.match_participants mp
      JOIN public.registrations r ON r.id = mp.registration_id
      LEFT JOIN public.registration_members rm ON rm.registration_id = r.id
      WHERE mp.match_id = e.match_id AND (r.captain_id = e.player_id OR rm.player_id = e.player_id)
    );
  DELETE FROM public.team_rating_events e
  WHERE e.match_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.match_participants mp
      JOIN public.registrations r ON r.id = mp.registration_id
      WHERE mp.match_id = e.match_id AND r.team_id = e.team_id
    );

  WITH RECURSIVE ranked_events AS (
    SELECT e.id, e.player_id, e.rating_change,
      row_number() OVER (PARTITION BY e.player_id ORDER BY e.created_at, e.id) AS event_number
    FROM public.rating_events e
  ), rating_walk AS (
    SELECT p.id AS player_id, 0::BIGINT AS event_number, NULL::UUID AS event_id,
      NULL::INTEGER AS previous_rating, 1000::INTEGER AS new_rating
    FROM public.profiles p
    UNION ALL
    SELECT e.player_id, e.event_number, e.id, w.new_rating, GREATEST(500, w.new_rating + e.rating_change)
    FROM rating_walk w JOIN ranked_events e ON e.player_id = w.player_id AND e.event_number = w.event_number + 1
  )
  UPDATE public.rating_events e SET previous_rating = walk.previous_rating, new_rating = walk.new_rating
  FROM rating_walk walk
  WHERE walk.event_id IS NOT NULL AND e.id = walk.event_id;

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
  ), player_match_rows AS (
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
  ), player_stats AS (
    SELECT player_id, count(DISTINCT tournament_id)::INTEGER AS total_tournaments,
      count(*) FILTER (WHERE is_winner)::INTEGER AS total_wins,
      COALESCE(sum(player_kills), 0)::INTEGER AS total_kills
    FROM player_match_rows GROUP BY player_id
  )
  UPDATE public.profiles p SET
    current_rating = ratings.current_rating,
    highest_rating = ratings.highest_rating,
    total_tournaments = COALESCE(stats.total_tournaments, 0),
    total_wins = COALESCE(stats.total_wins, 0),
    total_kills = COALESCE(stats.total_kills, 0),
    updated_at = now()
  FROM rating_totals ratings LEFT JOIN player_stats stats ON stats.player_id = ratings.player_id
  WHERE p.id = ratings.player_id;

  WITH RECURSIVE ranked_events AS (
    SELECT e.id, e.team_id, e.rating_change,
      row_number() OVER (PARTITION BY e.team_id ORDER BY e.created_at, e.id) AS event_number
    FROM public.team_rating_events e
  ), rating_walk AS (
    SELECT tm.id AS team_id, 0::BIGINT AS event_number, NULL::UUID AS event_id,
      NULL::INTEGER AS previous_rating, 1000::INTEGER AS new_rating
    FROM public.teams tm
    UNION ALL
    SELECT e.team_id, e.event_number, e.id, w.new_rating, GREATEST(500, w.new_rating + e.rating_change)
    FROM rating_walk w JOIN ranked_events e ON e.team_id = w.team_id AND e.event_number = w.event_number + 1
  )
  UPDATE public.team_rating_events e SET previous_rating = walk.previous_rating, new_rating = walk.new_rating
  FROM rating_walk walk
  WHERE walk.event_id IS NOT NULL AND e.id = walk.event_id;

  WITH latest_team_rating AS (
    SELECT DISTINCT ON (team_id) team_id, new_rating
    FROM public.team_rating_events ORDER BY team_id, created_at DESC, id DESC
  ), peak_team_rating AS (
    SELECT team_id, max(new_rating) AS highest_rating FROM public.team_rating_events GROUP BY team_id
  ), team_stats AS (
    SELECT r.team_id, count(DISTINCT m.tournament_id)::INTEGER AS tournaments_played,
      count(*) FILTER (WHERE mp.is_winner)::INTEGER AS total_wins,
      COALESCE(sum(mp.kills), 0)::INTEGER AS total_kills,
      COALESCE(sum(mp.points), 0)::INTEGER AS total_points
    FROM public.match_participants mp
    JOIN public.matches m ON m.id = mp.match_id AND m.status = 'completed'
    JOIN public.tournaments t ON t.id = m.tournament_id AND t.status <> 'cancelled'
    JOIN public.registrations r ON r.id = mp.registration_id AND r.team_id IS NOT NULL
    GROUP BY r.team_id
  )
  UPDATE public.teams tm SET
    current_rating = COALESCE(latest.new_rating, 1000),
    highest_rating = GREATEST(1000, COALESCE(peak.highest_rating, 1000)),
    tournaments_played = COALESCE(stats.tournaments_played, 0),
    total_wins = COALESCE(stats.total_wins, 0),
    total_kills = COALESCE(stats.total_kills, 0),
    total_points = COALESCE(stats.total_points, 0),
    updated_at = now()
  FROM public.teams base
  LEFT JOIN latest_team_rating latest ON latest.team_id = base.id
  LEFT JOIN peak_team_rating peak ON peak.team_id = base.id
  LEFT JOIN team_stats stats ON stats.team_id = base.id
  WHERE tm.id = base.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rebuild_competitive_rankings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_competitive_rankings() TO service_role;

-- Force all event deletion through an audited admin operation. Registration,
-- payment, fixture, and prize rows follow their declared tournament FKs.
REVOKE DELETE ON public.tournaments FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.delete_archived_tournament(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tournament public.tournaments%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Event not found.'); END IF;
  IF v_tournament.status NOT IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only completed or cancelled events can be deleted.');
  END IF;
  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
  VALUES (auth.uid(), 'ARCHIVED_TOURNAMENT_DELETED', 'tournaments', v_tournament.id::TEXT,
    jsonb_build_object('title', v_tournament.title, 'slug', v_tournament.slug, 'status', v_tournament.status));
  DELETE FROM public.rating_events WHERE tournament_id = p_tournament_id;
  DELETE FROM public.team_rating_events WHERE tournament_id = p_tournament_id;
  DELETE FROM public.tournaments WHERE id = p_tournament_id;
  PERFORM public.rebuild_competitive_rankings();
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_archived_tournament(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_archived_tournament(UUID) TO authenticated;

-- A restricted account cannot continue editing its profile through direct API calls.
DROP POLICY IF EXISTS "Users can update their own non-sensitive profile info" ON public.profiles;
CREATE POLICY "Active users can update their own non-sensitive profile info"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id AND account_status = 'active')
  WITH CHECK (auth.uid() = id AND account_status = 'active');
