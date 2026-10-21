-- Store player contact numbers separately from public profiles so they cannot
-- be exposed by public profile and leaderboard queries.
CREATE TABLE IF NOT EXISTS public.player_contact_details (
  player_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL CHECK (phone_number ~ '^[+]?[0-9][0-9[:space:]().-]{6,18}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.player_contact_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_contact_details FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.player_contact_details TO authenticated;
GRANT UPDATE (phone_number, updated_at) ON public.player_contact_details TO authenticated;
GRANT ALL ON public.player_contact_details TO service_role;

DROP POLICY IF EXISTS "Players can read their own contact details" ON public.player_contact_details;
CREATE POLICY "Players can read their own contact details"
  ON public.player_contact_details FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.account_status = 'active')
  );

DROP POLICY IF EXISTS "Players can add their own contact details" ON public.player_contact_details;
CREATE POLICY "Players can add their own contact details"
  ON public.player_contact_details FOR INSERT TO authenticated
  WITH CHECK (
    player_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.account_status = 'active')
  );

DROP POLICY IF EXISTS "Players can update their own contact details" ON public.player_contact_details;
CREATE POLICY "Players can update their own contact details"
  ON public.player_contact_details FOR UPDATE TO authenticated
  USING (
    player_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.account_status = 'active')
  )
  WITH CHECK (
    player_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.account_status = 'active')
  );
