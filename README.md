# VYROX Arena

VYROX Arena is a tournament platform for **BGMI** and **Free Fire**. Players can create an account, add game identities and private contact details, find tournaments, register teams, submit UPI references for paid events, and view match details. Organizers can manage tournaments, payments, fixtures, scores, player accounts, and exports.

## Stack

- Next.js 14 App Router, React 18, TypeScript, and Tailwind CSS
- Supabase Auth and PostgreSQL with Row Level Security
- Manual UPI reference review for paid tournaments

## Connect the database

Before using sign-in or organizer tools, make sure `.env.local` contains the URL and public anon/publishable key for your Supabase project.

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy the Project URL and the publishable/anon key.
3. Put them in `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

   `.env.example` shows the optional payment settings. The service-role key enables full account-history and complete-account deletion in the admin portal. Never put it in a `NEXT_PUBLIC_` variable or browser code.

4. In the Supabase **SQL Editor**, run these files in order:

   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_dual_game_backend.sql`
   - `supabase/migrations/003_payment_controls_and_private_rosters.sql`
   - `supabase/migrations/004_github_oauth_profiles.sql`
   - `supabase/migrations/005_rankings_badges_prizes_and_avatars.sql`
   - `supabase/migrations/006_sequential_battle_royale_match_numbers.sql`
   - `supabase/migrations/007_player_verification_and_event_deletion.sql`
   - `supabase/migrations/008_private_player_phone_numbers.sql`

   The first migration creates the tables and initial policies. The second adds Free Fire identities, transactional registration and payment actions, organizer operations, and access-checked room credential functions. The third adds the admin paid-entry switch and restricts participant rosters to the captain and organizer. The fourth makes profile creation support GitHub OAuth accounts. The fifth adds individual and team rankings, result-linked rating updates, permanent rating badges, prize award tracking, and avatar uploads. The sixth repairs duplicate Battle Royale match numbers and assigns the next number automatically when a lobby is created. The seventh adds private game-ID screenshot verification and audited deletion of archived events. The eighth stores phone numbers in a private table that only the player and authorized server-side admin actions can read. Run each migration once against a new project, in this order. For an existing project, run only migrations it has not already applied.

5. To add sample tournaments and announcements, run `supabase/seed.sql` once. It adds BGMI and Free Fire tournament listings. Do not run it repeatedly; its sample tournament IDs are fixed.
6. In Supabase **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` and your deployed site's `/auth/callback` URL to the redirect allow list. Email confirmation links return through this callback.
7. In Supabase **Authentication → Sign In / Providers**, disable **Phone** if it was enabled for SMS. To enable GitHub, create an OAuth App in GitHub (**Settings → Developer settings → OAuth Apps**). Set the GitHub app's **Homepage URL** to your website origin (for local development, `http://localhost:3000`). Set its **Authorization callback URL** to the callback shown in Supabase under **Authentication → Sign In / Providers → GitHub** (`https://<project-ref>.supabase.co/auth/v1/callback`). Copy the GitHub Client ID and Client Secret into the GitHub provider settings in Supabase and enable the provider.
8. Start the app:

   ```bash
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Make the first organizer account

Create a player account through email/password or GitHub, then promote it in the Supabase SQL Editor. Replace the username with the account you created:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE username = 'your_username';
```

Sign out and back in. The navigation will show **Admin Center** for that account. Organizer access is checked both in the UI and by database policies; the old hard-coded browser passkey has been removed.

## Configure paid tournaments

Payments are **manual UPI verification**, not an automated payment gateway. Add the following to `.env.local` if you want to accept paid registrations:

```env
NEXT_PUBLIC_MANUAL_PAYMENT_ENABLED=true
NEXT_PUBLIC_UPI_ID=your-upi-id
NEXT_PUBLIC_UPI_PAYEE_NAME=your-payee-name
NEXT_PUBLIC_UPI_QR_IMAGE=/upi-qr.png
```

Place the QR image under `public/` or use a hosted image URL. An organizer must verify the bank credit before approving a payment. Restart the development server after changing these values. Once they are configured, sign in as an organizer and turn on **Paid registration** in Tournament Management. That switch controls the database too, so paid signups and payment submissions remain rejected until the organizer enables it.

Paid registrations default to **off in the database**. If the admin switch reports that it is unavailable, run migration `003_payment_controls_and_private_rosters.sql` after `002_dual_game_backend.sql`.

Migration `005_rankings_badges_prizes_and_avatars.sql` adds individual and team standings, rating based badge unlocks, a prize award ledger, and the public `avatars` Storage bucket. Match results update linked roster accounts and their team. To credit a teammate on the individual board, that teammate needs a VYROX account with the same BGMI or Free Fire player ID as the registered roster entry. Squad kills remain team totals unless the match result form collects individual kills.

Prize awards are created from the admin's prize distribution after the final match is scored. The site records the amount and lets an admin mark it paid with a transfer reference; an organizer still sends the UPI or bank payment separately. The platform does not connect to a prize disbursement provider.

Keep the switch off until the UPI destination and real QR image are ready. Paid entries use manual bank verification, not an automatic payment gateway. Contact support at `xooo5532@gmail.com`.

Restart `npm run dev` after changing environment values. Instagram story cards download as 1080 × 1920 PNGs; copy the generated leaderboard URL and add it as an Instagram Link sticker, since an image itself cannot contain a clickable link. Localhost links only work on your own device.

## Deploy to GitHub and Vercel

1. Run the migrations above in the Supabase SQL Editor, including migration 008. Keep the project URL and public anon/publishable key available.
2. Create a private GitHub repository, then push this project from its root:

   ```bash
   git init
   git add .
   git commit -m "Prepare VYROX Arena for deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
   git push -u origin main
   ```

   If this directory is already a Git repository, skip `git init` and add only the `origin` remote if one is not configured.
3. Import the GitHub repository into Vercel. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SITE_URL` in Vercel's Environment Variables. The service-role key is server-only; keep it out of GitHub and all `NEXT_PUBLIC_` variables. Add the UPI environment values only if accepting paid events.
4. Deploy, then change `NEXT_PUBLIC_SITE_URL` to the production site origin and redeploy. Add `https://YOUR_SITE_DOMAIN/auth/callback` to the Supabase Auth redirect allow list, and set its Site URL to the production origin. Add the same callback URL to the GitHub OAuth app's allowed callback list only if GitHub requires it; Supabase remains the OAuth callback URL configured in the GitHub provider.
5. Locally, `npm run build` creates the same production build Vercel runs. Vercel runs the build automatically for pushes to the connected branch.

## Authentication options

Players can register or sign in with GitHub OAuth, or use email and password. GitHub avoids confirmation-email sending limits. Email/password signup depends on Supabase email confirmation and its email provider's rate limits. If confirmation emails are being throttled, configure custom SMTP in Supabase Authentication or use GitHub while the limit resets. Confirm the `http://localhost:3000/auth/callback` URL is in Supabase's redirect allow list. See the [Supabase GitHub sign-in guide](https://supabase.com/docs/guides/auth/social-login/auth-github) for provider setup details.

## What uses Supabase

- Supabase Auth handles GitHub OAuth, email/password sign-in, email confirmation, session restore, and sign-out.
- The profile trigger creates a player row and stores BGMI and Free Fire identities separately.
- Match scoring updates each linked player and their persistent team ranking. Peak rating unlocks badges that players can share from their profile.
- Players can choose a built-in avatar or upload an image to the public avatars bucket; uploads are limited to each player's own folder.
- Player phone numbers are stored in a private contact table and can only be read by that player or server-side admin tools.
- Tournament listings, profiles, registrations, payments, matches, results, announcements, and audit records are stored in PostgreSQL.
- Registration capacity and UPI review use database functions so the slot and payment state changes are transactional.
- Row Level Security limits organizer actions to active admin profiles. Room IDs and passwords are not readable from public tournament or match queries; confirmed entrants and admins retrieve them through protected database functions.
- When Supabase environment values are missing, public pages can show local sample data, but account and organizer actions require a real Supabase project.

## Useful commands

```bash
npm run dev
npm run typecheck
npm run build
```

## Project structure

```text
app/                         Player, tournament, and organizer pages
components/                  Shared navigation, tournament cards, and payment UI
lib/auth-context.tsx         Supabase-backed application session
lib/services/                Tournament, registration, payment, match, and profile services
lib/supabase/                Supabase clients, data types, and local sample data
supabase/migrations/         Database schema and backend functions
supabase/seed.sql            Optional tournament and announcement examples
```

BGMI and Free Fire are trademarks of their respective owners. VYROX Arena is an independent tournament platform and is not affiliated with either game publisher. Organizers are responsible for following applicable laws, publisher rules, and prize/payment requirements.
