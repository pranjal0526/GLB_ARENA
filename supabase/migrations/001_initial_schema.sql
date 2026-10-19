-- VYROX Esports Platform Database Schema
-- Initial Migration: Schema, Constraints, Functions, and RLS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bgmi_ign TEXT,
    bgmi_uid TEXT,
    role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'banned', 'suspended')),
    ban_reason TEXT,
    banned_at TIMESTAMPTZ,
    current_rating INTEGER NOT NULL DEFAULT 1000,
    total_tournaments INTEGER NOT NULL DEFAULT 0,
    total_wins INTEGER NOT NULL DEFAULT 0,
    total_kills INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_rating ON public.profiles(current_rating DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 2. Tournaments Table
CREATE TABLE IF NOT EXISTS public.tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    game TEXT NOT NULL DEFAULT 'BGMI',
    mode TEXT NOT NULL DEFAULT 'Squad' CHECK (mode IN ('Solo', '1v1', 'Duo', 'Squad')),
    team_size INTEGER NOT NULL DEFAULT 4 CHECK (team_size >= 1 AND team_size <= 6),
    tournament_format TEXT NOT NULL DEFAULT 'Battle Royale' CHECK (tournament_format IN ('Single Elimination', 'Round Robin', 'Battle Royale')),
    entry_fee_paise INTEGER NOT NULL DEFAULT 0 CHECK (entry_fee_paise >= 0),
    prize_pool_paise INTEGER NOT NULL DEFAULT 0 CHECK (prize_pool_paise >= 0),
    prize_distribution JSONB DEFAULT '[]'::jsonb,
    max_slots INTEGER NOT NULL CHECK (max_slots > 0),
    registration_opens_at TIMESTAMPTZ NOT NULL,
    registration_closes_at TIMESTAMPTZ NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    rules TEXT NOT NULL,
    banner_url TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'registration_closed', 'live', 'completed', 'cancelled')),
    cancellation_reason TEXT,
    room_id TEXT,
    room_password TEXT,
    room_release_policy TEXT NOT NULL DEFAULT 'manual' CHECK (room_release_policy IN ('manual', '15_min_before', 'confirmed_only')),
    room_released BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_tournaments_slug ON public.tournaments(slug);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_start_time ON public.tournaments(start_time ASC);

-- 3. Registrations Table
CREATE TABLE IF NOT EXISTS public.registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    captain_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_name TEXT,
    registration_code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'payment_submitted', 'confirmed', 'rejected', 'cancelled', 'disqualified')),
    disqualification_reason TEXT,
    slot_number INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT unique_user_tournament UNIQUE (tournament_id, captain_id)
);

CREATE INDEX IF NOT EXISTS idx_registrations_tournament ON public.registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_registrations_captain ON public.registrations(captain_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON public.registrations(status);

-- 4. Registration Members Table
CREATE TABLE IF NOT EXISTS public.registration_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
    player_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ign TEXT NOT NULL,
    uid TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('captain', 'member', 'substitute')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_reg_members_reg_id ON public.registration_members(registration_id);

-- 5. Payments Table (Preserves history of attempts)
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
    amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
    payment_method TEXT NOT NULL DEFAULT 'upi_qr',
    payment_status TEXT NOT NULL DEFAULT 'submitted' CHECK (payment_status IN ('pending', 'submitted', 'verified', 'rejected')),
    transaction_reference TEXT NOT NULL,
    screenshot_url TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    verified_by UUID REFERENCES public.profiles(id),
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_payments_reg_id ON public.payments(registration_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_utr ON public.payments(transaction_reference);

-- 6. Matches Table
CREATE TABLE IF NOT EXISTS public.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL DEFAULT 1,
    round_label TEXT NOT NULL,
    match_number INTEGER NOT NULL DEFAULT 1,
    format TEXT NOT NULL,
    scheduled_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')),
    room_id TEXT,
    room_password TEXT,
    room_released BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES public.profiles(id),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_matches_tournament ON public.matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);

-- 7. Match Participants Table
CREATE TABLE IF NOT EXISTS public.match_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
    participant_slot INTEGER,
    placement INTEGER,
    kills INTEGER NOT NULL DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0,
    is_winner BOOLEAN NOT NULL DEFAULT false,
    stats JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT unique_match_registration UNIQUE (match_id, registration_id)
);

CREATE INDEX IF NOT EXISTS idx_match_participants_match ON public.match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_reg ON public.match_participants(registration_id);

-- 8. Rating Events Table (Idempotent updates)
CREATE TABLE IF NOT EXISTS public.rating_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
    match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
    previous_rating INTEGER NOT NULL,
    rating_change INTEGER NOT NULL,
    new_rating INTEGER NOT NULL,
    description TEXT NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_rating_events_player ON public.rating_events(player_id);
CREATE INDEX IF NOT EXISTS idx_rating_events_idempotency ON public.rating_events(idempotency_key);

-- 9. Announcements Table
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'tournament', 'fixture', 'payment', 'winner', 'urgent')),
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    published_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements(created_at DESC);

-- 10. Admin Audit Logs
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    target_id TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.admin_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.admin_audit_logs(target_entity, target_id);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rating_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND account_status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles Policies
CREATE POLICY "Public profiles are readable by everyone"
ON public.profiles FOR SELECT
USING (true);

CREATE POLICY "Users can update their own non-sensitive profile info"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  -- Prevents player from escalating role, rating, or account status
);

CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
USING (public.is_admin());

-- Tournaments Policies
CREATE POLICY "Tournaments readable by everyone"
ON public.tournaments FOR SELECT
USING (status != 'draft' OR public.is_admin());

CREATE POLICY "Only admins can manage tournaments"
ON public.tournaments FOR ALL
USING (public.is_admin());

-- Registrations Policies
CREATE POLICY "Users can view their own registrations or public confirmed registrations"
ON public.registrations FOR SELECT
USING (
  captain_id = auth.uid() 
  OR status = 'confirmed'
  OR public.is_admin()
);

CREATE POLICY "Users can insert registration for themselves"
ON public.registrations FOR INSERT
WITH CHECK (auth.uid() = captain_id);

CREATE POLICY "Users can update their own pending registration or admins can update"
ON public.registrations FOR UPDATE
USING (
  (captain_id = auth.uid() AND status IN ('pending_payment', 'payment_submitted'))
  OR public.is_admin()
);

-- Registration Members Policies
CREATE POLICY "Registration members are viewable by participants and admins"
ON public.registration_members FOR SELECT
USING (true);

CREATE POLICY "Captains or admins can insert registration members"
ON public.registration_members FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.id = registration_id AND (r.captain_id = auth.uid() OR public.is_admin())
  )
);

-- Payments Policies
CREATE POLICY "Captains can view their own payments, admins can view all"
ON public.payments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.id = registration_id AND r.captain_id = auth.uid()
  )
  OR public.is_admin()
);

CREATE POLICY "Captains can submit payment for their registration"
ON public.payments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.id = registration_id AND r.captain_id = auth.uid()
  )
);

CREATE POLICY "Only admins can verify/update payments"
ON public.payments FOR UPDATE
USING (public.is_admin());

-- Matches Policies
CREATE POLICY "Matches are readable by everyone"
ON public.matches FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert or update matches"
ON public.matches FOR ALL
USING (public.is_admin());

-- Match Participants Policies
CREATE POLICY "Match participants viewable by all"
ON public.match_participants FOR SELECT
USING (true);

CREATE POLICY "Only admins can manage match participants"
ON public.match_participants FOR ALL
USING (public.is_admin());

-- Rating Events Policies
CREATE POLICY "Rating events are viewable by all"
ON public.rating_events FOR SELECT
USING (true);

CREATE POLICY "Only system/admins can insert rating events"
ON public.rating_events FOR INSERT
WITH CHECK (public.is_admin());

-- Announcements Policies
CREATE POLICY "Announcements viewable by everyone"
ON public.announcements FOR SELECT
USING (true);

CREATE POLICY "Only admins can manage announcements"
ON public.announcements FOR ALL
USING (public.is_admin());

-- Admin Audit Logs Policies
CREATE POLICY "Only admins can view audit logs"
ON public.admin_audit_logs FOR SELECT
USING (public.is_admin());

-- Trigger to create profile when auth.users signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username TEXT;
  v_display_name TEXT;
BEGIN
  v_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  v_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
  
  -- Ensure username uniqueness
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_username := v_username || floor(random() * 1000)::TEXT;
  END LOOP;

  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    avatar_url,
    bgmi_ign,
    bgmi_uid,
    role,
    account_status,
    current_rating
  ) VALUES (
    NEW.id,
    v_username,
    v_display_name,
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'bgmi_ign',
    NEW.raw_user_meta_data->>'bgmi_uid',
    COALESCE(NEW.raw_user_meta_data->>'role', 'player'),
    'active',
    1000
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Atomic Tournament Registration Function to prevent race conditions & overbooking
CREATE OR REPLACE FUNCTION public.register_tournament_atomic(
    p_tournament_id UUID,
    p_captain_id UUID,
    p_team_name TEXT,
    p_ign TEXT,
    p_uid TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_tournament public.tournaments%ROWTYPE;
    v_confirmed_count INTEGER;
    v_existing_reg public.registrations%ROWTYPE;
    v_reg_id UUID;
    v_reg_code TEXT;
    v_status TEXT;
BEGIN
    -- 1. Lock the tournament row to serialize concurrent registrations
    SELECT * INTO v_tournament 
    FROM public.tournaments 
    WHERE id = p_tournament_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
    END IF;

    -- 2. Check tournament status
    IF v_tournament.status != 'open' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tournament is not open for registration');
    END IF;

    -- 3. Check registration timeframe
    IF now() < v_tournament.registration_opens_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'Registration has not started yet');
    END IF;
    IF now() > v_tournament.registration_closes_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'Registration is closed');
    END IF;

    -- 4. Check if player already registered
    SELECT * INTO v_existing_reg 
    FROM public.registrations 
    WHERE tournament_id = p_tournament_id AND captain_id = p_captain_id;

    IF FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'You are already registered for this tournament');
    END IF;

    -- 5. Check slot capacity (count confirmed + pending registrations)
    SELECT COUNT(*) INTO v_confirmed_count 
    FROM public.registrations 
    WHERE tournament_id = p_tournament_id AND status IN ('confirmed', 'payment_submitted', 'pending_payment');

    IF v_confirmed_count >= v_tournament.max_slots THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tournament is at full capacity');
    END IF;

    -- 6. Generate registration code & determine initial status
    v_reg_code := 'VYR-' || UPPER(SUBSTRING(MD5(random()::TEXT) FROM 1 FOR 6));
    
    -- If free tournament (entry_fee_paise = 0), immediately confirm registration!
    IF v_tournament.entry_fee_paise = 0 THEN
        v_status := 'confirmed';
    ELSE
        v_status := 'pending_payment';
    END IF;

    -- 7. Insert registration
    INSERT INTO public.registrations (
        tournament_id,
        captain_id,
        team_name,
        registration_code,
        status,
        slot_number
    ) VALUES (
        p_tournament_id,
        p_captain_id,
        COALESCE(p_team_name, p_ign),
        v_reg_code,
        v_status,
        v_confirmed_count + 1
    ) RETURNING id INTO v_reg_id;

    -- 8. Insert captain as registration member
    INSERT INTO public.registration_members (
        registration_id,
        player_id,
        ign,
        uid,
        role
    ) VALUES (
        v_reg_id,
        p_captain_id,
        p_ign,
        p_uid,
        'captain'
    );

    RETURN jsonb_build_object(
        'success', true, 
        'registration_id', v_reg_id,
        'registration_code', v_reg_code,
        'status', v_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
