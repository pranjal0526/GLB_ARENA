-- Add explicit arena team sizes, per-match room access for head-to-head events,
-- and safe tournament-team departure. Run after migration 011.

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_mode_check;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_mode_check
  CHECK (mode IN ('Solo', '1v1', '2v2', '3v3', '4v4', 'Duo', 'Squad'));

-- A head-to-head entrant is one registration: one player for 1v1 or a complete
-- roster for 2v2, 3v3, or 4v4. Knockout matches therefore contain two entries;
-- a single-entry knockout row is allowed only to represent a bye.
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
DECLARE
  v_tournament public.tournaments%ROWTYPE;
  v_match_id UUID;
  v_registration_id UUID;
  v_slot INTEGER := 0;
  v_member_count INTEGER;
  v_entry_count INTEGER := COALESCE(cardinality(p_registration_ids), 0);
  v_unique_entry_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found.'; END IF;

  SELECT count(DISTINCT entry_id) INTO v_unique_entry_count
    FROM unnest(COALESCE(p_registration_ids, ARRAY[]::UUID[])) AS entries(entry_id);
  IF v_entry_count = 0 OR v_unique_entry_count <> v_entry_count THEN
    RAISE EXCEPTION 'Choose one or more different confirmed entries for this fixture.';
  END IF;
  IF v_tournament.tournament_format = 'Single Elimination' AND v_entry_count NOT IN (1, 2) THEN
    RAISE EXCEPTION 'A head-to-head fixture must contain two entrants. A single entrant is allowed only for a knockout bye.';
  ELSIF v_tournament.tournament_format = 'Round Robin' AND v_entry_count <> 2 THEN
    RAISE EXCEPTION 'A round-robin fixture must contain exactly two entrants.';
  END IF;

  FOREACH v_registration_id IN ARRAY COALESCE(p_registration_ids, ARRAY[]::UUID[]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.registrations
      WHERE id = v_registration_id AND tournament_id = p_tournament_id AND status = 'confirmed'
    ) THEN RAISE EXCEPTION 'Every fixture entry must be confirmed for this tournament.'; END IF;
    SELECT count(*) INTO v_member_count FROM public.registration_members WHERE registration_id = v_registration_id;
    IF v_member_count <> v_tournament.team_size THEN
      RAISE EXCEPTION 'Entry % has % of % required players. Complete the roster before creating fixtures.',
        v_registration_id, v_member_count, v_tournament.team_size;
    END IF;
  END LOOP;

  INSERT INTO public.matches (
    tournament_id, round_number, round_label, match_number, format,
    scheduled_time, status, room_id, room_password, room_released, created_by, completed_at
  ) VALUES (
    p_tournament_id, p_round_number, p_round_label, p_match_number, p_format,
    p_scheduled_time,
    CASE WHEN v_tournament.tournament_format = 'Single Elimination' AND v_entry_count = 1 THEN 'completed' ELSE 'scheduled' END,
    CASE WHEN v_entry_count = 2 THEN p_room_id ELSE NULL END,
    CASE WHEN v_entry_count = 2 THEN p_room_password ELSE NULL END,
    p_room_released AND v_entry_count = 2,
    auth.uid(),
    CASE WHEN v_tournament.tournament_format = 'Single Elimination' AND v_entry_count = 1 THEN now() ELSE NULL END
  ) RETURNING id INTO v_match_id;

  FOREACH v_registration_id IN ARRAY COALESCE(p_registration_ids, ARRAY[]::UUID[]) LOOP
    v_slot := v_slot + 1;
    INSERT INTO public.match_participants (match_id, registration_id, participant_slot, is_winner)
      VALUES (
        v_match_id, v_registration_id, v_slot,
        v_tournament.tournament_format = 'Single Elimination' AND v_entry_count = 1
      );
  END LOOP;
  RETURN v_match_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_match_with_participants(UUID, INTEGER, TEXT, INTEGER, TEXT, TIMESTAMPTZ, UUID[], TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_match_with_participants(UUID, INTEGER, TEXT, INTEGER, TEXT, TIMESTAMPTZ, UUID[], TEXT, TEXT, BOOLEAN) TO authenticated;

-- Head-to-head room details live on each match and must not fall back to one
-- tournament-wide room that would be shared with unrelated fixtures.
CREATE OR REPLACE FUNCTION public.get_tournament_room_credentials(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tournament public.tournaments%ROWTYPE;
BEGIN
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND OR NOT v_tournament.room_released THEN RETURN NULL; END IF;
  IF NOT public.is_admin() AND v_tournament.tournament_format <> 'Battle Royale' THEN RETURN NULL; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active'
  ) THEN RETURN NULL; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.registrations r
    LEFT JOIN public.registration_members rm ON rm.registration_id = r.id
    WHERE r.tournament_id = p_tournament_id AND r.status = 'confirmed'
      AND (r.captain_id = auth.uid() OR rm.player_id = auth.uid())
  ) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('room_id', v_tournament.room_id, 'room_password', v_tournament.room_password);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_tournament_room_credentials(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tournament_room_credentials(UUID) TO authenticated;

-- Keep a private snapshot when a player changes teams so leaving a roster does
-- not erase their tournament identity from the organizer's history.
CREATE TABLE IF NOT EXISTS public.registration_team_member_departures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL,
  tournament_id UUID NOT NULL,
  player_id UUID,
  team_name TEXT,
  display_name TEXT,
  username TEXT,
  ign TEXT NOT NULL,
  uid TEXT NOT NULL,
  former_role TEXT NOT NULL,
  departed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_member_departures_player_tournament
  ON public.registration_team_member_departures (player_id, tournament_id, departed_at DESC);
ALTER TABLE public.registration_team_member_departures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_team_member_departures FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.registration_team_member_departures TO authenticated;
DROP POLICY IF EXISTS "Admins can view departed tournament team members"
  ON public.registration_team_member_departures;
CREATE POLICY "Admins can view departed tournament team members"
  ON public.registration_team_member_departures FOR SELECT TO authenticated
  USING (public.is_admin());

-- Players can leave before registration closes and before any fixture assigns
-- their entry. A leader must transfer leadership first. Removed roster rows are
-- available for another team's approval in this event; earlier join requests
-- remain as the membership audit trail.
CREATE OR REPLACE FUNCTION public.leave_tournament_team(p_registration_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_registration public.registrations%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_member public.registration_members%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sign in before leaving a team.'); END IF;
  SELECT * INTO v_registration FROM public.registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Team entry not found.'); END IF;
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_registration.tournament_id FOR UPDATE;
  SELECT * INTO v_registration FROM public.registrations WHERE id = p_registration_id FOR UPDATE;

  IF v_tournament.team_size <= 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo entries do not have a team to leave.');
  END IF;
  IF v_registration.captain_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer team leadership to another roster member before leaving.');
  END IF;
  SELECT * INTO v_member FROM public.registration_members
    WHERE registration_id = p_registration_id AND player_id = v_user_id AND role <> 'captain';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not an active member of this team.');
  END IF;
  IF v_tournament.status <> 'open' OR now() > v_tournament.registration_closes_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team changes are locked because registration has closed.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_participants WHERE registration_id = p_registration_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team changes are locked after fixtures are created.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND account_status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This account cannot change tournament teams.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  INSERT INTO public.registration_team_member_departures (
    registration_id, tournament_id, player_id, team_name, display_name, username,
    ign, uid, former_role, departed_at
  ) VALUES (
    v_registration.id, v_tournament.id, v_user_id, v_registration.team_name,
    v_profile.display_name, v_profile.username, v_member.ign, v_member.uid,
    v_member.role, now()
  );
  DELETE FROM public.registration_members
    WHERE registration_id = p_registration_id AND player_id = v_user_id;
  UPDATE public.registration_team_requests
    SET status = 'cancelled', decided_at = now(), decided_by = v_user_id
    WHERE tournament_id = v_tournament.id AND player_id = v_user_id AND status = 'pending';
  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
    VALUES (v_user_id, 'TEAM_MEMBER_LEFT', 'registrations', p_registration_id::TEXT,
      jsonb_build_object('tournament_id', v_tournament.id, 'team_name', v_registration.team_name));

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.leave_tournament_team(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_tournament_team(UUID) TO authenticated;
