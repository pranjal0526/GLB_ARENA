-- Give every Battle Royale lobby in a tournament its own sequence number.
-- Repair existing rows first, preserving the order in which the lobbies were created.
WITH numbered_lobbies AS (
  SELECT
    m.id,
    row_number() OVER (
      PARTITION BY m.tournament_id
      ORDER BY m.created_at, m.scheduled_time, m.id
    )::INTEGER AS lobby_number
  FROM public.matches AS m
  JOIN public.tournaments AS t ON t.id = m.tournament_id
  WHERE t.tournament_format = 'Battle Royale'
)
UPDATE public.matches AS m
SET
  round_number = numbered_lobbies.lobby_number,
  match_number = numbered_lobbies.lobby_number,
  round_label = CASE
    WHEN m.round_label ~* '^Match[[:space:]]*[0-9]+'
      THEN regexp_replace(
        m.round_label,
        '^Match[[:space:]]*[0-9]+',
        'Match ' || numbered_lobbies.lobby_number::TEXT,
        'i'
      )
    ELSE m.round_label
  END,
  updated_at = now()
FROM numbered_lobbies
WHERE m.id = numbered_lobbies.id;

-- Serialize lobby creation on the tournament row, then assign the next number.
-- This also protects against two organizers creating lobbies at the same time.
CREATE OR REPLACE FUNCTION public.assign_battle_royale_match_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_format TEXT;
  v_next_match_number INTEGER;
BEGIN
  SELECT tournament_format
    INTO v_tournament_format
    FROM public.tournaments
    WHERE id = NEW.tournament_id
    FOR UPDATE;

  IF v_tournament_format = 'Battle Royale' THEN
    SELECT COALESCE(MAX(match_number), 0) + 1
      INTO v_next_match_number
      FROM public.matches
      WHERE tournament_id = NEW.tournament_id;

    NEW.round_number := v_next_match_number;
    NEW.match_number := v_next_match_number;

    IF NEW.round_label ~* '^Match[[:space:]]*[0-9]+' THEN
      NEW.round_label := regexp_replace(
        NEW.round_label,
        '^Match[[:space:]]*[0-9]+',
        'Match ' || v_next_match_number::TEXT,
        'i'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_battle_royale_match_number ON public.matches;
CREATE TRIGGER assign_battle_royale_match_number
  BEFORE INSERT ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_battle_royale_match_number();
