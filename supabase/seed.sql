-- VYROX demo tournaments and announcements. Run this once after migrations.

-- Sample Tournaments
INSERT INTO public.tournaments (
    id,
    title,
    slug,
    description,
    game,
    mode,
    team_size,
    tournament_format,
    entry_fee_paise,
    prize_pool_paise,
    prize_distribution,
    max_slots,
    registration_opens_at,
    registration_closes_at,
    start_time,
    rules,
    banner_url,
    status,
    room_release_policy
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'BGMI Winter Championship 2026',
    'bgmi-winter-championship-2026',
    'The premier battle royale tournament in India. 25 elite squads battle across Erangel and Miramar for the ₹50,000 prize pool.',
    'BGMI',
    'Squad',
    4,
    'Battle Royale',
    20000, -- ₹200.00
    5000000, -- ₹50,000.00
    '[{"place": "1st", "amount": 25000}, {"place": "2nd", "amount": 15000}, {"place": "3rd", "amount": 10000}]'::jsonb,
    25,
    timezone('utc', now() - interval '2 days'),
    timezone('utc', now() + interval '5 days'),
    timezone('utc', now() + interval '6 days'),
    '1. All players must record POV or submit screenshots upon request.\n2. iPad and emulators are strictly banned.\n3. Hacking, teaming, or glitch exploits will result in immediate disqualification and account ban.\n4. Lobby ID & password will be visible to confirmed squads 15 minutes before match start.',
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
    'open',
    '15_min_before'
),
(
    'b2222222-2222-2222-2222-222222222222',
    'Redline 1v1 M416 Arena Clash',
    'redline-1v1-m416-arena-clash',
    'Pure gunplay and reflexes. Warehouse 1v1 single elimination bracket. Win 5 rounds to advance to the grand final.',
    'BGMI',
    '1v1',
    1,
    'Single Elimination',
    5000, -- ₹50.00
    500000, -- ₹5,000.00
    '[{"place": "1st", "amount": 3000}, {"place": "2nd", "amount": 1500}, {"place": "3rd", "amount": 500}]'::jsonb,
    32,
    timezone('utc', now() - interval '1 day'),
    timezone('utc', now() + interval '3 days'),
    timezone('utc', now() + interval '4 days'),
    '1. Map: TDM Warehouse.\n2. Weapons allowed: M416 only.\n3. Slide allowed: Disabled.\n4. Armor: Level 2.\n5. Screenshot of match results must be submitted by the winner.',
    'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80',
    'open',
    'manual'
),
(
    'c3333333-3333-3333-3333-333333333333',
    'Campus Scrims: Weekly Free Showdown',
    'campus-scrims-weekly-free-showdown',
    'Free entry community scrims for college and amateur squads. Gain competitive experience, build rating, and win ₹2,000.',
    'BGMI',
    'Squad',
    4,
    'Battle Royale',
    0, -- Free Entry!
    200000, -- ₹2,000.00
    '[{"place": "1st", "amount": 1200}, {"place": "2nd", "amount": 800}]'::jsonb,
    25,
    timezone('utc', now() - interval '3 days'),
    timezone('utc', now() + interval '2 days'),
    timezone('utc', now() + interval '3 days'),
    '1. Open for all Indian players.\n2. In-game name and UID must match registration records.\n3. Toxic behavior or abusing players will lead to permanent blacklist.',
    'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=1200&q=80',
    'open',
    '15_min_before'
),
(
    'd4444444-4444-4444-4444-444444444444',
    'Pro Invitational Series S4',
    'pro-invitational-series-s4',
    'Top Tier-1 teams competing live in custom lobbies.',
    'BGMI',
    'Squad',
    4,
    'Battle Royale',
    50000, -- ₹500.00
    10000000, -- ₹1,00,000.00
    '[{"place": "1st", "amount": 50000}, {"place": "2nd", "amount": 30000}, {"place": "3rd", "amount": 20000}]'::jsonb,
    20,
    timezone('utc', now() - interval '7 days'),
    timezone('utc', now() - interval '1 day'),
    timezone('utc', now() + interval '1 day'),
    'Official tournament rulebook applies. Anti-cheat client mandatory.',
    'https://images.unsplash.com/photo-1560253023-3ec5d502959f?auto=format&fit=crop&w=1200&q=80',
    'live',
    'confirmed_only'
),
(
    'e5555555-5555-5555-5555-555555555555',
    'Free Fire Booyah Cup',
    'free-fire-booyah-cup',
    'Open squad battle royale for Free Fire teams. Compete across Bermuda and Alpine for the Booyah Cup prize pool.',
    'Free Fire',
    'Squad',
    4,
    'Battle Royale',
    10000,
    2500000,
    '[{"place": "1st", "amount": 12500}, {"place": "2nd", "amount": 7500}, {"place": "3rd", "amount": 5000}]'::jsonb,
    24,
    timezone('utc', now() - interval '1 day'),
    timezone('utc', now() + interval '3 days'),
    timezone('utc', now() + interval '4 days'),
    '1. Use the Free Fire account registered for this squad.\n2. No emulators, hacks, or unauthorized software.\n3. Report results to the organizer after each lobby.',
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
    'open',
    '15_min_before'
);

-- Sample Announcements
INSERT INTO public.announcements (
    tournament_id,
    title,
    content,
    category,
    is_pinned
) VALUES 
(
    'a1111111-1111-1111-1111-111111111111',
    'BGMI Winter Championship Registration Now Open!',
    'Registrations for the BGMI Winter Championship 2026 are officially open. Ensure your squad captain has submitted the accurate UPI UTR transaction reference for quick verification.',
    'tournament',
    true
),
(
    NULL,
    'Anti-Cheat & Fair Play Notice',
    'We enforce strict hardware checks and manual POV audits for top 3 squads. Do not use unauthorized config files or trigger attachments.',
    'urgent',
    true
),
(
    'c3333333-3333-3333-3333-333333333333',
    'Free Weekly Scrims Slots Filling Fast',
    '18 out of 25 slots already claimed for this weekend''s showdown. Instant confirmation upon registration!',
    'general',
    false
);
