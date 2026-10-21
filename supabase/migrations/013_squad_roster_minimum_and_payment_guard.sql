-- Squad Battle Royale entries may contain 2–4 approved players. The leader
-- pays once for the team, and fixture creation requires the minimum roster.
-- Run after 012_arena_formats_match_rooms_and_team_leaving.sql.

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
    IF v_tournament.mode = 'Squad' AND (v_member_count < 2 OR v_member_count > 4) THEN
      RAISE EXCEPTION 'Squad entry % has % players. Approve 2 to 4 players before creating a lobby.',
        v_registration_id, v_member_count;
    ELSIF v_tournament.mode <> 'Squad' AND v_member_count <> v_tournament.team_size THEN
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

CREATE OR REPLACE FUNCTION public.require_min_squad_roster_before_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT;
  v_member_count INTEGER;
BEGIN
  IF NEW.payment_status NOT IN ('submitted', 'verified') THEN RETURN NEW; END IF;
  SELECT t.mode INTO v_mode
  FROM public.registrations r
  JOIN public.tournaments t ON t.id = r.tournament_id
  WHERE r.id = NEW.registration_id;
  IF v_mode = 'Squad' THEN
    SELECT count(*) INTO v_member_count
    FROM public.registration_members
    WHERE registration_id = NEW.registration_id;
    IF v_member_count < 2 OR v_member_count > 4 THEN
      RAISE EXCEPTION 'Squad teams need 2 to 4 approved players before payment submission or verification. The leader pays once for the team.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.require_min_squad_roster_before_payment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS require_min_squad_roster_before_payment ON public.payments;
CREATE TRIGGER require_min_squad_roster_before_payment
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.require_min_squad_roster_before_payment();

-- Individual kill totals must match the actual approved roster size. The
-- function body otherwise remains the previously shipped scoring behavior.
DO $$
DECLARE
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.finalize_match_results(uuid,jsonb)'::regprocedure)
    INTO v_definition;
  v_updated_definition := regexp_replace(
    v_definition,
    'v_member_kill_count[[:space:]]*<>[[:space:]]*v_tournament[.]team_size[[:space:]]+OR[[:space:]]+v_member_kill_sum[[:space:]]*<>[[:space:]]*v_kills',
    'v_member_kill_count <> (SELECT count(*) FROM public.registration_members WHERE registration_id = v_registration.id) OR v_member_kill_sum <> v_kills'
  );
  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'Could not update the individual-kill roster check in finalize_match_results.';
  END IF;
  EXECUTE v_updated_definition;
END;
$$;
