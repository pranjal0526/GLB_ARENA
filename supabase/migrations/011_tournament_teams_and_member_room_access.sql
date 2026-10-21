-- Tournament-specific teams, leader approvals, solo registration labels, and
-- room access for every confirmed roster member. Run after migration 010.

CREATE TABLE IF NOT EXISTS public.registration_team_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_registration_team_requests_team
  ON public.registration_team_requests (registration_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_registration_team_requests_player
  ON public.registration_team_requests (player_id, tournament_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_registration_team_requests_one_pending_per_player_event
  ON public.registration_team_requests (tournament_id, player_id) WHERE status = 'pending';

ALTER TABLE public.registration_team_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_team_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.registration_team_requests TO authenticated;

-- SECURITY DEFINER membership checks avoid recursive RLS between the
-- registrations and registration_members tables.
CREATE OR REPLACE FUNCTION public.is_registration_captain(p_registration_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.id = p_registration_id AND r.captain_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_registration_captain(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_registration_captain(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_registration_team_member(p_registration_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registration_members rm
    WHERE rm.registration_id = p_registration_id AND rm.player_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_registration_team_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_registration_team_member(UUID) TO authenticated;

DROP POLICY IF EXISTS "Players and team leaders can view relevant team requests"
  ON public.registration_team_requests;
CREATE POLICY "Players and team leaders can view relevant team requests"
  ON public.registration_team_requests FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR public.is_registration_captain(registration_id)
    OR public.is_admin()
  );

-- Team rosters remain private, but each player can read their own membership row.
DROP POLICY IF EXISTS "Registration members visible to captain and admins"
  ON public.registration_members;
CREATE POLICY "Registration members visible to captain, player, and admins"
  ON public.registration_members FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR public.is_registration_captain(registration_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Players can view own registrations and admins can view all"
  ON public.registrations;
CREATE POLICY "Players can view own team registrations and admins can view all"
  ON public.registrations FOR SELECT TO authenticated
  USING (
    captain_id = auth.uid()
    OR public.is_registration_team_member(id)
    OR public.is_admin()
  );

CREATE TABLE IF NOT EXISTS public.registration_team_leadership_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  previous_leader_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  new_leader_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.registration_team_leadership_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_team_leadership_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.registration_team_leadership_events TO authenticated;
DROP POLICY IF EXISTS "Team members and admins can view leadership history"
  ON public.registration_team_leadership_events;
CREATE POLICY "Team members and admins can view leadership history"
  ON public.registration_team_leadership_events FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.registrations r
      LEFT JOIN public.registration_members rm ON rm.registration_id = r.id
      WHERE r.id = registration_team_leadership_events.registration_id
        AND (r.captain_id = auth.uid() OR rm.player_id = auth.uid())
    )
  );

-- Create a tournament-specific team using only the leader's own verified
-- account identity. Other players join through requests that the leader reviews.
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
  v_profile public.profiles%ROWTYPE;
  v_active_count INTEGER;
  v_registration_id UUID;
  v_registration_code TEXT;
  v_status TEXT;
  v_ign TEXT;
  v_uid TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_captain_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in as the player creating this entry.');
  END IF;
  SELECT * INTO v_profile FROM public.profiles
    WHERE id = auth.uid() AND account_status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'This account cannot register for tournaments.');
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Tournament not found.'); END IF;
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
  IF jsonb_typeof(p_members) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submit the leader identity as a list.');
  END IF;
  IF jsonb_array_length(p_members) <> 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the team leader enters their game ID here. Teammates request to join separately.');
  END IF;
  v_ign := trim(COALESCE(p_members->0->>'ign', ''));
  v_uid := trim(COALESCE(p_members->0->>'uid', ''));
  IF length(v_ign) < 2 OR v_uid !~ '^[0-9]{5,}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid in-game name and player ID.');
  END IF;
  IF v_tournament.team_size > 1 AND length(trim(COALESCE(p_team_name, ''))) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a team name to create your tournament team.');
  END IF;
  IF v_tournament.team_size > 1 AND EXISTS (
    SELECT 1 FROM public.registrations
    WHERE tournament_id = p_tournament_id AND lower(trim(team_name)) = lower(trim(p_team_name))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'That team name is already being used in this tournament. Choose another name.');
  END IF;
  IF v_tournament.team_size = 1 AND EXISTS (
    SELECT 1 FROM public.registrations WHERE tournament_id = p_tournament_id AND captain_id = p_captain_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are already registered for this tournament.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.registration_members rm
    JOIN public.registrations r ON r.id = rm.registration_id
    WHERE r.tournament_id = p_tournament_id AND r.status IN ('confirmed', 'payment_submitted', 'pending_payment')
      AND rm.player_id = p_captain_id
  ) OR EXISTS (
    SELECT 1 FROM public.registration_team_requests
    WHERE tournament_id = p_tournament_id AND player_id = p_captain_id AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already belong to a team or have a pending team request for this tournament.');
  END IF;

  SELECT count(*) INTO v_active_count FROM public.registrations
  WHERE tournament_id = p_tournament_id
    AND status IN ('confirmed', 'payment_submitted', 'pending_payment');
  IF v_active_count >= v_tournament.max_slots THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament has reached maximum slot capacity.');
  END IF;

  v_status := CASE WHEN v_tournament.entry_fee_paise = 0 THEN 'confirmed' ELSE 'pending_payment' END;
  v_registration_code := 'VYR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  INSERT INTO public.registrations (
    tournament_id, captain_id, team_name, registration_code, status, slot_number
  ) VALUES (
    p_tournament_id, p_captain_id,
    CASE WHEN v_tournament.team_size = 1 THEN NULL ELSE trim(p_team_name) END,
    v_registration_code, v_status, v_active_count + 1
  ) RETURNING id INTO v_registration_id;
  INSERT INTO public.registration_members (registration_id, player_id, ign, uid, role)
    VALUES (v_registration_id, p_captain_id, v_ign, v_uid, 'captain');

  RETURN jsonb_build_object(
    'success', true, 'registration_id', v_registration_id,
    'registration_code', v_registration_code, 'status', v_status
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'You already have an entry or team for this tournament.');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.register_tournament_atomic(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_tournament_atomic(UUID, UUID, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tournament_team_overview(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND account_status = 'active'
  ) THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'teams', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'registration_id', r.id,
        'team_name', r.team_name,
        'leader_name', leader.display_name,
        'registration_status', r.status,
        'member_count', roster.member_count,
        'team_size', t.team_size,
        'is_my_team', r.captain_id = v_user_id OR EXISTS (
          SELECT 1 FROM public.registration_members own_member
          WHERE own_member.registration_id = r.id AND own_member.player_id = v_user_id
        ),
        'request_status', (
          SELECT request.status FROM public.registration_team_requests request
          WHERE request.registration_id = r.id AND request.player_id = v_user_id
          ORDER BY request.created_at DESC LIMIT 1
        )
      ) ORDER BY r.created_at)
      FROM public.registrations r
      JOIN public.profiles leader ON leader.id = r.captain_id
      JOIN public.tournaments t ON t.id = r.tournament_id
      CROSS JOIN LATERAL (
        SELECT count(*)::INTEGER AS member_count FROM public.registration_members rm WHERE rm.registration_id = r.id
      ) roster
      WHERE r.tournament_id = p_tournament_id AND t.team_size > 1
        AND r.team_name IS NOT NULL
        AND r.status IN ('confirmed', 'payment_submitted', 'pending_payment')
    ), '[]'::JSONB),
    'requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'request_id', request.id,
        'registration_id', request.registration_id,
        'player_id', request.player_id,
        'display_name', player.display_name,
        'username', player.username,
        'game_ign', CASE WHEN upper(t.game) = 'BGMI' THEN player.bgmi_ign ELSE player.free_fire_ign END,
        'game_uid', CASE WHEN upper(t.game) = 'BGMI' THEN player.bgmi_uid ELSE player.free_fire_uid END,
        'created_at', request.created_at
      ) ORDER BY request.created_at)
      FROM public.registration_team_requests request
      JOIN public.registrations r ON r.id = request.registration_id AND r.captain_id = v_user_id
      JOIN public.tournaments t ON t.id = r.tournament_id
      JOIN public.profiles player ON player.id = request.player_id
      WHERE request.tournament_id = p_tournament_id AND request.status = 'pending'
    ), '[]'::JSONB),
    'my_team', (
      SELECT jsonb_build_object(
        'registration_id', r.id,
        'team_name', r.team_name,
        'is_leader', r.captain_id = v_user_id,
        'member_count', roster.member_count,
        'team_size', t.team_size,
        'members', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'player_id', rm.player_id,
            'display_name', player.display_name,
            'username', player.username,
            'ign', rm.ign,
            'uid', rm.uid,
            'role', rm.role
          ) ORDER BY CASE WHEN rm.role = 'captain' THEN 0 ELSE 1 END, rm.created_at)
          FROM public.registration_members rm
          LEFT JOIN public.profiles player ON player.id = rm.player_id
          WHERE rm.registration_id = r.id
        ), '[]'::JSONB)
      )
      FROM public.registrations r
      JOIN public.tournaments t ON t.id = r.tournament_id
      CROSS JOIN LATERAL (
        SELECT count(*)::INTEGER AS member_count FROM public.registration_members rm WHERE rm.registration_id = r.id
      ) roster
      WHERE r.tournament_id = p_tournament_id
        AND r.status IN ('confirmed', 'payment_submitted', 'pending_payment')
        AND (r.captain_id = v_user_id OR EXISTS (
          SELECT 1 FROM public.registration_members rm
          WHERE rm.registration_id = r.id AND rm.player_id = v_user_id
        ))
      ORDER BY r.created_at LIMIT 1
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_tournament_team_overview(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tournament_team_overview(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_to_join_tournament_team(p_registration_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_registration public.registrations%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_ign TEXT;
  v_uid TEXT;
  v_request_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sign in before requesting to join a team.'); END IF;
  SELECT * INTO v_registration FROM public.registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Team not found.'); END IF;
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_registration.tournament_id FOR UPDATE;
  SELECT * INTO v_registration FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  IF v_tournament.team_size <= 1 OR v_tournament.status <> 'open'
     OR now() < v_tournament.registration_opens_at OR now() > v_tournament.registration_closes_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team requests are closed for this tournament.');
  END IF;
  IF v_registration.status NOT IN ('confirmed', 'payment_submitted', 'pending_payment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This team is no longer accepting players.');
  END IF;
  IF v_registration.captain_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already lead this team.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND account_status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This account cannot join tournament teams.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.registration_members rm JOIN public.registrations r ON r.id = rm.registration_id
    WHERE r.tournament_id = v_tournament.id AND r.status IN ('confirmed', 'payment_submitted', 'pending_payment')
      AND rm.player_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already belong to a team in this tournament. You can join a different team in another tournament.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.registration_team_requests WHERE tournament_id = v_tournament.id AND player_id = v_user_id AND status = 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already have a pending request for a team in this tournament.');
  END IF;
  IF (SELECT count(*) FROM public.registration_members WHERE registration_id = p_registration_id) >= v_tournament.team_size THEN
    RETURN jsonb_build_object('success', false, 'error', 'This team roster is full.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF upper(v_tournament.game) = 'BGMI' THEN
    v_ign := NULLIF(trim(v_profile.bgmi_ign), ''); v_uid := NULLIF(trim(v_profile.bgmi_uid), '');
  ELSE
    v_ign := NULLIF(trim(v_profile.free_fire_ign), ''); v_uid := NULLIF(trim(v_profile.free_fire_uid), '');
  END IF;
  IF v_ign IS NULL OR v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Add your in-game name and player ID for this game in your profile before requesting to join.');
  END IF;

  INSERT INTO public.registration_team_requests (registration_id, tournament_id, player_id)
  VALUES (p_registration_id, v_tournament.id, v_user_id)
  RETURNING id INTO v_request_id;
  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'You already have a pending team request in this tournament.');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.request_to_join_tournament_team(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_to_join_tournament_team(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_tournament_team_request(p_request_id UUID, p_approve BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request public.registration_team_requests%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_ign TEXT;
  v_uid TEXT;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sign in required.'); END IF;
  SELECT * INTO v_request FROM public.registration_team_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Team request not found.'); END IF;
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_request.tournament_id FOR UPDATE;
  SELECT * INTO v_registration FROM public.registrations WHERE id = v_request.registration_id FOR UPDATE;
  SELECT * INTO v_request FROM public.registration_team_requests WHERE id = p_request_id FOR UPDATE;
  IF v_registration.captain_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the team leader can review join requests.');
  END IF;
  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This request has already been reviewed.');
  END IF;
  IF p_approve AND (v_tournament.status <> 'open' OR now() > v_tournament.registration_closes_at) THEN
    RETURN jsonb_build_object('success', false, 'error', 'The team roster is locked because registration has closed.');
  END IF;

  IF p_approve THEN
    IF (SELECT count(*) FROM public.registration_members WHERE registration_id = v_registration.id) >= v_tournament.team_size THEN
      RETURN jsonb_build_object('success', false, 'error', 'Your roster is full.');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.registration_members rm JOIN public.registrations r ON r.id = rm.registration_id
      WHERE r.tournament_id = v_tournament.id AND r.status IN ('confirmed', 'payment_submitted', 'pending_payment')
        AND rm.player_id = v_request.player_id
    ) THEN
      UPDATE public.registration_team_requests SET status = 'rejected', decided_at = now(), decided_by = v_user_id
        WHERE id = v_request.id;
      RETURN jsonb_build_object('success', false, 'error', 'This player has already joined another team in this tournament.');
    END IF;
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_request.player_id AND account_status = 'active';
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'This player account is not active.'); END IF;
    IF upper(v_tournament.game) = 'BGMI' THEN
      v_ign := NULLIF(trim(v_profile.bgmi_ign), ''); v_uid := NULLIF(trim(v_profile.bgmi_uid), '');
    ELSE
      v_ign := NULLIF(trim(v_profile.free_fire_ign), ''); v_uid := NULLIF(trim(v_profile.free_fire_uid), '');
    END IF;
    IF v_ign IS NULL OR v_uid IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Player needs to complete this game identity in their profile first.');
    END IF;
    INSERT INTO public.registration_members (registration_id, player_id, ign, uid, role)
      VALUES (v_registration.id, v_profile.id, v_ign, v_uid, 'member');
    UPDATE public.registration_team_requests SET status = 'approved', decided_at = now(), decided_by = v_user_id
      WHERE id = v_request.id;
    RETURN jsonb_build_object('success', true, 'approved', true);
  END IF;

  UPDATE public.registration_team_requests SET status = 'rejected', decided_at = now(), decided_by = v_user_id
    WHERE id = v_request.id;
  RETURN jsonb_build_object('success', true, 'approved', false);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'This player already has a team assignment or pending request in this tournament.');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.review_tournament_team_request(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_tournament_team_request(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_tournament_team_leadership(p_registration_id UUID, p_new_leader_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration public.registrations%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_registration_id UUID := p_registration_id;
  v_previous_leader UUID := auth.uid();
BEGIN
  IF v_previous_leader IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sign in required.'); END IF;
  SELECT * INTO v_registration FROM public.registrations WHERE id = v_registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Team not found.'); END IF;
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_registration.tournament_id FOR UPDATE;
  SELECT * INTO v_registration FROM public.registrations WHERE id = v_registration_id FOR UPDATE;
  IF NOT FOUND OR v_registration.captain_id <> v_previous_leader THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the current team leader can transfer leadership.');
  END IF;
  IF v_tournament.status IN ('completed', 'cancelled') OR v_registration.status NOT IN ('confirmed', 'payment_submitted', 'pending_payment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leadership cannot be changed after this tournament ends.');
  END IF;
  IF p_new_leader_id = v_previous_leader OR NOT EXISTS (
    SELECT 1 FROM public.registration_members
    WHERE registration_id = v_registration.id AND player_id = p_new_leader_id AND role <> 'substitute'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Choose an active member of this team as the new leader.');
  END IF;

  UPDATE public.registration_members SET role = 'member'
    WHERE registration_id = v_registration.id AND player_id = v_previous_leader;
  UPDATE public.registration_members SET role = 'captain'
    WHERE registration_id = v_registration.id AND player_id = p_new_leader_id;
  UPDATE public.registrations SET captain_id = p_new_leader_id, updated_at = now()
    WHERE id = v_registration.id;
  -- Leadership is tournament-specific; do not overwrite aggregate team metadata.
  INSERT INTO public.registration_team_leadership_events (
    registration_id, previous_leader_id, new_leader_id, changed_by
  ) VALUES (v_registration.id, v_previous_leader, p_new_leader_id, v_previous_leader);
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'The selected member is already leading another entry in this tournament.');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.transfer_tournament_team_leadership(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_tournament_team_leadership(UUID, UUID) TO authenticated;

-- Only confirmed leaders and members receive room credentials.
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

CREATE OR REPLACE FUNCTION public.get_match_room_credentials(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_match public.matches%ROWTYPE;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND OR NOT v_match.room_released THEN RETURN NULL; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active'
  ) THEN RETURN NULL; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.match_participants mp
    JOIN public.registrations r ON r.id = mp.registration_id
    LEFT JOIN public.registration_members rm ON rm.registration_id = r.id
    WHERE mp.match_id = p_match_id AND r.status = 'confirmed'
      AND (r.captain_id = auth.uid() OR rm.player_id = auth.uid())
  ) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('room_id', v_match.room_id, 'room_password', v_match.room_password);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_match_room_credentials(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_match_room_credentials(UUID) TO authenticated;

-- Stop organizers from creating fixtures for an incomplete roster.
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
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found.'; END IF;

  FOREACH v_registration_id IN ARRAY COALESCE(p_registration_ids, ARRAY[]::UUID[]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.registrations
      WHERE id = v_registration_id AND tournament_id = p_tournament_id AND status = 'confirmed'
    ) THEN RAISE EXCEPTION 'Every fixture entry must be confirmed for this tournament.'; END IF;
    SELECT count(*) INTO v_member_count FROM public.registration_members WHERE registration_id = v_registration_id;
    IF v_member_count <> v_tournament.team_size THEN
      RAISE EXCEPTION 'Team % has % of % required players. Approve team requests before creating fixtures.',
        v_registration_id, v_member_count, v_tournament.team_size;
    END IF;
  END LOOP;

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
      VALUES (v_match_id, v_registration_id, v_slot);
  END LOOP;
  RETURN v_match_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_match_with_participants(UUID, INTEGER, TEXT, INTEGER, TEXT, TIMESTAMPTZ, UUID[], TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_match_with_participants(UUID, INTEGER, TEXT, INTEGER, TEXT, TIMESTAMPTZ, UUID[], TEXT, TEXT, BOOLEAN) TO authenticated;
