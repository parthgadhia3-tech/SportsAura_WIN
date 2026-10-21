# MatchDay

Free-to-play live prediction and loyalty platform for sports bars, clubs and pubs.
Patrons scan a coaster, predict live match moments on their phone, climb the bar's
leaderboard and win F&B and brand rewards. "MatchDay" is a placeholder name: change
`NEXT_PUBLIC_APP_NAME`.

Three apps in one Next.js project:

| URL | Who | What |
| --- | --- | --- |
| `/v/<venue-slug>` | Patrons (mobile PWA) | Phone OTP login, consent, GPS or PIN check-in, live questions, leaderboard, wallet, offers, how to play, T&C |
| `/admin` | Game Master / admin | Push, lock, settle and void questions live; matches, reward buckets, themes, offer banners, venues + coaster QR codes, staff accounts, click analytics |
| `/venue` and `/venue/tv` | Venue staff (tablet) and the bar TV | Rotating 4-digit PIN, live players, leaderboard, reward redemption with ID-check prompt, full-screen TV display |

## How the rules are enforced

All game rules live in the database (Postgres functions + Row Level Security), so a
modified phone or API call can't cheat.

- **Check-in, main way:** the bar TV shows a QR code that changes every 30 seconds.
  Scanning it checks the player in instantly: no location prompt, no typing. The code
  is swapped for a single-use 15-minute ticket at scan time, so new players have time
  to do the OTP. A photo forwarded to someone outside is dead within a minute.
- **Check-in, fallback:** GPS distance is checked server-side with PostGIS `ST_DWithin` against the
  venue's radius (default 150 m). Raw coordinates are never stored, only pass/fail and
  distance. If GPS fails or is denied, the player enters the venue PIN instead.
- **PIN:** derived from a per-venue secret and the clock (changes every 10 minutes,
  previous PIN accepted for 2 more minutes). It rotates even if no dashboard is open.
  5 wrong guesses in 10 minutes locks the player out of PIN entry.
- **Players stay logged in:** the login lives in a cookie the server re-issues on every
  visit with a 400-day life (Safari wipes script-written storage after 7 idle days, but
  keeps server-set cookies). Everything (profile, points, wallet, match history) is tied
  to the phone number, so signing out, changing phones or clearing the browser loses
  nothing: OTP again and it's all back. The More > Me tab shows lifetime points, matches,
  accuracy, rewards, best finish and every past match.
- **One check-in per match:** players verify once. The session lasts the whole match
  unless they go quiet for 45 minutes, or a silent GPS re-check (only for players who
  allowed location) puts them more than 3x the radius away.
- **Answers:** one per question, rejected after the timer, and the correct answer is
  only written at settlement, so it can never leak to phones early.
- **Rewards:** fastest correct answers win first, quantity limits are respected, and
  spirits rewards (min age 25) only go to players who confirmed 25+. Beer and wine
  rewards are 21+. A player can win the same reward only once per match.
- **Affiliate tracking:** wallet links go through `/api/track`, which logs user,
  reward, venue and time, then 302-redirects to the URL stored server-side. Patrons
  can't see affiliate URLs or static promo codes before winning.
- **DPDP:** `consent_agreed_at`, `location_consent_at`, optional `marketing_consent_at`,
  `age_verified_21`, `age_verified_25`, terms version. Players can delete their account
  (More > Account), which removes profile, answers, sessions and wallet.
- **Copy rule:** `npm run check:copy` (runs on every build) fails if words like bet,
  wager, gamble or odds appear anywhere in the app.

## Setup (about 30 minutes)

### 1. Supabase

1. Create a project at supabase.com (region: Mumbai, `ap-south-1`).
2. Open **SQL Editor** and run the files in `supabase/migrations/` in name order
   (`20261020000000_init.sql`, then `20261020120000_qr_checkin_and_record.sql`).
   (Or with the Supabase CLI: `supabase link` then `supabase db push`.)
3. Optional demo data: run `supabase/seed.sql`. It creates a demo venue, a live match,
   two themes, three reward buckets and two draft questions.
4. **Phone login:** Authentication > Sign In / Providers > Phone. Connect an SMS provider
   (Twilio, MessageBird, Vonage or Textlocal). Indian SMS needs DLT-registered sender ID
   and template. For testing before that, add test phone numbers with a fixed code in the
   same settings page.
5. **First admin:** Authentication > Users > Add user (email + password, auto-confirm).
   Copy the user's ID and run:
   ```sql
   insert into public.staff (user_id, role, name)
   values ('PASTE-USER-ID', 'admin', 'Parth');
   ```
   After that, add Game Masters and venue managers from `/admin` > Staff.

### 2. Run locally

```bash
cp .env.example .env.local   # fill in URL, anon/publishable key, service_role/secret key
npm install
npm run dev
```

Open `http://localhost:3000/admin`, sign in, then open `/v/demo-dugout` on your phone.
Location only works on HTTPS or localhost, so test the patron app on the deployed URL
or with the PIN.

### 3. Deploy to Vercel

Import the repo, add the four variables from `.env.example` as Environment Variables
(the service role key is server-only and never reaches the browser), deploy.

### 4. Coasters

`/admin` > Venues: add the bar (use "Use this device's location" while standing inside
it, or paste coordinates from Google Maps), then **Download QR**. The same URL can be
written to NFC tags with any NFC writer app.

## Running a match night

1. **Before:** Matches > create the match, pick a sponsor theme. Live > save 10 to 15
   draft questions with rewards attached.
2. **Kick-off:** Live > Start match. Open `/venue/tv` on the bar's TV (sign in once as the
   venue manager). The QR on screen is the main way players check in.
3. **During play:** push a draft (or type one and Push now). Lock early if the moment
   happens before the timer ends. Tap the correct option to settle: points and rewards
   go out instantly and winners see the celebration screen.
4. **Can't settle?** Void it. Nobody gets points.
5. **Redemption:** staff type the `MD-` code into `/venue` > Redeem. Alcohol rewards show
   an ID-check banner (21+ beer/wine, 25+ spirits).

## Testing

```bash
npm run check:copy   # restricted-word scan
npm run lint
npm run typecheck
npm run build

# Database security tests (needs local Postgres 15+ with PostGIS):
PGHOST=localhost PGPORT=5432 PGUSER=postgres npm run test:db
```

`supabase/tests/e2e_test.sql` checks 30+ rules as real patron, Game Master and venue
roles: GPS fence, PIN lockout, drafts hidden, answer never leaked early, double answers
blocked, 25+ spirits rule, wallet isolation, cross-venue redemption blocked, idle and
left-the-venue sessions expire, logged-out visitors can't call anything sensitive.

## Project layout

```
supabase/migrations/   schema, RLS, game functions (single source of truth)
supabase/seed.sql      demo data
supabase/tests/        database security test suite
src/app/v/[slug]       patron app entry (coaster URL)
src/app/admin          Game Master console
src/app/venue          venue dashboard and /venue/tv
src/app/api/track      click tracker + redirect
src/app/api/account    DPDP account deletion
src/app/api/admin      staff account creation
src/components/patron  patron screens
src/components/staff   staff screens
src/lib/theme.ts       white-label theming (CSS variables)
src/lib/copy.ts        all player-facing copy, T&C and error messages
```

## Known limits for the pilot

- Answer timers use the phone's clock for display. The server enforces the real cutoff,
  so a phone with a wrong clock sees a slightly off countdown but can't cheat.
- Supabase Realtime's free tier caps concurrent connections. Check your plan's limit
  against expected players per night before scaling past a few venues.
- T&C text in `src/lib/copy.ts` is a working draft. Get it reviewed by a lawyer before
  launch, especially alcohol-brand sponsorship and the prize promotion terms.
