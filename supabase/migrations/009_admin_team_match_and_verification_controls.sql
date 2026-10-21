-- Admin controls for team removal, archived match cleanup, and rejected ID evidence.
-- Run after 008_private_player_phone_numbers.sql.

CREATE OR REPLACE FUNCTION public.admin_delete_team(p_team_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Team not found.'); END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
  VALUES (auth.uid(), 'TEAM_DELETED', 'teams', v_team.id::TEXT,
    jsonb_build_object('name', v_team.name, 'game', v_team.game));
  -- Historical tournament entries and rosters remain intact. Their team_id is
  -- cleared by the FK; deleting a team removes its public leaderboard row.
  DELETE FROM public.teams WHERE id = p_team_id;
  PERFORM public.rebuild_competitive_rankings();
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_team(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_team(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_archived_match(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_participant_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Match not found.'); END IF;
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_match.tournament_id FOR UPDATE;
  IF NOT FOUND OR v_tournament.status NOT IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only matches from completed or cancelled events can be deleted.');
  END IF;

  SELECT count(*) INTO v_participant_count FROM public.match_participants WHERE match_id = p_match_id;
  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
  VALUES (auth.uid(), 'ARCHIVED_MATCH_DELETED', 'matches', v_match.id::TEXT,
    jsonb_build_object('tournament_id', v_tournament.id, 'tournament_title', v_tournament.title,
      'round_label', v_match.round_label, 'match_number', v_match.match_number,
      'participants', v_participant_count));

  DELETE FROM public.rating_events WHERE match_id = p_match_id;
  DELETE FROM public.team_rating_events WHERE match_id = p_match_id;
  DELETE FROM public.matches WHERE id = p_match_id;
  PERFORM public.rebuild_competitive_rankings();
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_archived_match(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_archived_match(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_rejected_game_id_verification(p_verification_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.player_game_id_verifications%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT * INTO v_row FROM public.player_game_id_verifications WHERE id = p_verification_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Verification submission not found.'); END IF;
  IF v_row.status <> 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only rejected verification submissions can be deleted.');
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_entity, target_id, metadata)
  VALUES (auth.uid(), 'REJECTED_GAME_ID_VERIFICATION_DELETED', 'player_game_id_verifications', v_row.id::TEXT,
    jsonb_build_object('player_id', v_row.player_id, 'game', v_row.game, 'game_ign', v_row.game_ign, 'game_uid', v_row.game_uid));
  DELETE FROM public.player_game_id_verifications WHERE id = p_verification_id;
  RETURN jsonb_build_object('success', true, 'screenshot_path', v_row.screenshot_path);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_rejected_game_id_verification(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_rejected_game_id_verification(UUID) TO authenticated;
