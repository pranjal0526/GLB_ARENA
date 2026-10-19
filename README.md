# VYROX — Competitive Esports Tournament Management Platform

VYROX is a production-ready, full-stack esports tournament management platform initially focused on competitive **BGMI (Battlegrounds Mobile India)** tournaments in India. It is built with Next.js (App Router), TypeScript, Tailwind CSS, and PostgreSQL via Supabase.

---

## 1. Application Overview

VYROX provides an end-to-end competitive gaming infrastructure for college communities, gaming clubs, and tournament organizers:
- **Player Ecosystem:** User accounts, BGMI in-game identities (IGN & UID), persistent national ratings starting at 1000 PTS, match history, and personal dashboard.
- **Tournament Discovery:** Filter by game mode (Solo, 1v1, Squad), format (Battle Royale, Single Elimination), entry fee (Free vs Paid INR), and search by title.
- **Manual UPI Payments:** Built for the Indian market with manual UPI QR code scanning (PhonePe, GPay, Paytm) and 12-digit UTR transaction reference submission with admin approval workflows.
- **Secure Custom Room Delivery:** Restricted BGMI lobby credentials (Room ID and Password) released only to verified, confirmed participants.
- **Automated Fixtures & Scoring:** Deterministic Single Elimination knockout bracket generation (with odd-participant bye support) and Battle Royale 25-team custom lobby generation.
- **Persistent Idempotent Rating System:** Dual rating calculation engine (Elo K=32 for 1v1 and Placement/Kill weighting for Battle Royale) with idempotency keys preventing double-scoring.
- **Administrator Command Center:** Real-time metrics, payment verification portal with rejection reasons, tournament creation, participant disqualification, anti-cheat player banning, in-app announcement broadcasts, audit logging, and CSV exports.

---

## 2. Technology Stack & Prerequisites

- **Frontend & Backend:** Next.js 14 (App Router), React 18, TypeScript (Strict).
- **Styling & Icons:** Tailwind CSS with dark esports theme (Obsidian, Electric Violet `#8b5cf6`, Cyan `#06b6d4`), Lucide React.
- **Database:** PostgreSQL with Row Level Security (RLS) via Supabase.
- **Forms & Validation:** Zod schemas and React Hook Form.
- **Testing:** Node.js native test runner & `tsx`.
- **Runtime Required:** Node.js 18.x, 20.x, or 22.x, and npm.

---

## 3. Quick Start & Local Execution

### Step 1: Install Dependencies
```bash
npm install --legacy-peer-deps
```

### Step 2: Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
The application comes pre-configured with high-fidelity local fallback and demo personas, allowing the entire application, registration flow, and admin verification to be evaluated immediately.

### Step 3: Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 4: Run Tests & Type Checks
```bash
# Run unit tests and end-to-end integration test
npm test

# Run strict TypeScript type check
npm run typecheck

# Run production build
npm run build
```

---

## 4. Supabase Setup & Database Migrations

When connecting to your live Supabase project:

1. Create a new Supabase project at [https://supabase.com](https://supabase.com).
2. Retrieve your project URL, Anon Key, and Service Role Key from **Project Settings > API**.
3. Update `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   ```
4. In the Supabase Dashboard, navigate to the **SQL Editor**.
5. Run the migration script located at:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
   This creates:
   - `profiles`, `tournaments`, `registrations`, `registration_members`, `payments`, `matches`, `match_participants`, `rating_events`, `announcements`, and `admin_audit_logs`.
   - Comprehensive Row Level Security (RLS) policies.
   - `register_tournament_atomic` PostgreSQL function for concurrency-safe registration.
   - `handle_new_user` trigger for automatic profile generation.
6. Run the seed data script:
   ```
   supabase/seed.sql
   ```

---

## 5. Initial Administrator Setup

To assign an account as an administrator:
1. Sign up on the platform using email and password.
2. In the Supabase SQL Editor, run:
   ```sql
   UPDATE public.profiles 
   SET role = 'admin' 
   WHERE username = 'your_username';
   ```
3. Alternatively, for local evaluation, use the built-in **"Switch Persona"** control in the top navigation bar to toggle between `Naman (Mortal)` (Player) and `VYROX Admin` (Admin) with zero friction.

---

## 6. Manual UPI Payment Procedure

1. **Player Registration:** A player registers their squad for a tournament with an entry fee.
2. **Payment Display:** The player is presented with the configured UPI QR code, payee name (`VYROX Esports India`), UPI ID (`vyrox.tournaments@upi`), and the exact entry fee in INR.
3. **Transaction Submission:** The player pays via their mobile banking/UPI app (PhonePe, GPay, Paytm) and enters the 12-digit UTR/UPI reference number in the modal.
4. **Verification State:** The registration status transitions to `payment_submitted` (Pending Verification).
5. **Organizer Verification:** The administrator reviews the pending payments table in `/admin`.
   - **Approval:** Admin confirms credit in bank statements, clicks "Approve". Status updates to `confirmed`, assigning the squad a tournament slot and unlocking restricted match lobby credentials.
   - **Rejection:** Admin enters a reason (e.g. "Mismatched UTR"). The player receives notification to resubmit the corrected reference.

---

## 7. Rating Calculation Engine

- **1v1 Arena Clash:**
  $$E_A = \frac{1}{1 + 10^{(R_B - R_A) / 400}}$$
  $$\Delta R = \text{round}(32 \times (S - E_A))$$
- **Battle Royale (25 Squads):**
  - 1st Place (WWCD): `+35` rating
  - 2nd Place: `+24` rating
  - 3rd Place: `+18` rating
  - Top 5: `+12` rating
  - Top 10: `+6` rating
  - Bottom tiers: `-2` to `-14` rating
  - Each verified kill awards `+3` rating points.
- **Idempotency Protection:** Every rating event is logged with an `idempotency_key` (`rating-<matchId>-<playerId>`). Retrying result finalization will never apply duplicate rating updates.

---

## 8. File Structure

```
├── app/
│   ├── layout.tsx              # Root layout with esports theme & AuthProvider
│   ├── page.tsx                # Homepage (Hero, Stats, Tourneys, FAQ)
│   ├── tournaments/
│   │   ├── page.tsx            # Directory with search, mode, & fee filters
│   │   └── [slug]/page.tsx     # Details, registration, UPI modal, & room credentials
│   ├── dashboard/page.tsx      # Player Hub (My Tournaments, Matches, Rooms)
│   ├── admin/page.tsx          # Admin Command Center (Payments, Fixtures, Bans, CSV)
│   ├── leaderboard/page.tsx    # National BGMI Leaderboard & Top 3 Podium
│   ├── profile/page.tsx        # Player credentials (IGN, UID) & stats
│   ├── auth/
│   │   ├── signin/page.tsx     # Sign in with instant persona switcher
│   │   └── signup/page.tsx     # Profile creation with BGMI UID capture
├── components/
│   ├── navbar.tsx              # Brand navigation with quick persona switch
│   ├── footer.tsx              # Footer with legal & Indian currency notices
│   ├── status-badge.tsx        # Status pill badges
│   ├── tournament-card.tsx     # Card with slots progress and IST dates
│   └── upi-payment-modal.tsx   # Interactive manual UPI QR modal
├── lib/
│   ├── auth-context.tsx        # Session state & demo persona provider
│   ├── validations/schemas.ts  # Zod validation schemas
│   ├── supabase/
│   │   ├── types.ts            # Complete TypeScript domain models
│   │   ├── client.ts           # Browser Supabase client
│   │   ├── server.ts           # Server Supabase client
│   │   └── mock-data.ts        # Seed mock data
│   └── services/
│       ├── tournament-service.ts
│       ├── registration-service.ts
│       ├── payment-service.ts
│       ├── fixture-service.ts
│       ├── rating-service.ts
│       ├── profile-service.ts
│       ├── announcement-service.ts
│       └── audit-service.ts
├── supabase/
│   ├── migrations/001_initial_schema.sql  # Full PostgreSQL migration & RLS
│   └── seed.sql                           # Production seed data
└── tests/
    ├── domain-logic.test.mjs   # Unit tests for Elo, BR delta, & capacity
    └── user-journey.test.mjs   # End-to-end integration test
```

---

## 9. Legal & Compliance Disclaimer

BGMI (Battlegrounds Mobile India) is a registered trademark of Krafton Inc. VYROX is an independent tournament management platform and is not officially affiliated with or endorsed by Krafton. Real-money prize distribution and paid esports tournaments in India are subject to applicable state and central laws, game-publisher competition guidelines, and tax withholding regulations (TDS under Section 194B/194BA).
