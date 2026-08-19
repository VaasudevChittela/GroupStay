# GroupStay — setup and roles

## 1. Run the two migrations (required, one time)

The app talks to Supabase with the public anon key, so it cannot create its own
tables. Until these run, signing in lands on the "One-time database setup" screen.

Open your project on supabase.com → **SQL Editor** → **New query**, then paste and
run each file:

1. `supabase/migrations/0001_hotel_platform.sql` — room inventory fields, reservation
   lifecycle, digital keys, key audit log, guest requests, room-photo storage bucket.
2. `supabase/migrations/0002_rbac.sql` — hotels, chapters, profiles, and the row level
   security policies that isolate the data.

Both are idempotent, so re-running them is safe. Then tap **Check again** in the app.

## 2. Roles

Everyone signs in through the same screen. What they can reach is decided by their
`profiles.role` row — and enforced by Postgres, not by the UI.

| Role | Scope | Can do |
| --- | --- | --- |
| `hotel_staff` | One hotel | Every room at their property: add/edit rooms, set status, assign guests, check in/out, issue and revoke digital keys, resolve guest requests |
| `chapter_assignor` | One chapter | Their chapter's students only: view, search, filter, assign and reassign rooms, auto-assign, message the group |
| `student` | Themselves | Their own reservation, room, digital key and wallet pass, plus the names of people in *their* room only |
| `admin` | Everything | Full access |

On first sign-in each account picks its organization (a hotel, a chapter, or a trip
code for students). That attachment happens through `SECURITY DEFINER` functions —
`claim_hotel`, `claim_chapter`, `join_trip` — so a client cannot point its own profile
at somebody else's hotel by editing a row.

## 3. How the isolation actually works

Every table has row level security enabled and `anon` access revoked, so nothing is
readable while signed out. Policies key off helper functions that read the caller's
profile:

- `app_role()`, `app_hotel_id()`, `app_chapter_id()`, `app_guest_id()`, `app_room_id()`
- `app_can_see_trip(trip)` — the single visibility rule every child table reuses
- `app_shares_room_with(guest)` — how a student sees roommates and nobody else

Consequences worth knowing:

- A student has **no SELECT on `trips` at all**. Their own trip comes back through the
  `my_trip()` function, so trip codes cannot be enumerated.
- A student sees exactly one row in `rooms` — theirs.
- Chapter assignors get **no access to `digital_keys`**. Key material belongs to the
  guest and the hotel that issued it.
- Room inventory is writable by hotel staff only. Assignors get read-only visibility of
  the block their chapter is staying in, which is what the spec calls for — if you want
  advisors to create rooms too, add `chapter_assignor` to the `rooms_insert` /
  `rooms_update` policies.

To sanity-check isolation, sign in as two accounts at different hotels and confirm each
dashboard is empty of the other's rooms.

## 4. Wallet passes (optional)

`lib/wallet.ts` calls a pass service. Deploy `supabase/functions/wallet-pass` and set
its secrets (Apple Pass Type ID certificate, WWDR certificate, Google service account)
to hand out real `.pkpass` files and Google Wallet save links. Without those secrets the
in-app key card still works — the wallet buttons just report that passes aren't
configured yet.

## 5. Notes on this codebase

- `legacy/App.legacy.tsx` is the original pre-RBAC single-file app, kept for reference
  and excluded from the TypeScript build. Its still-useful pieces were rebuilt as real
  modules: trip messaging (`screens/shared/MessagesScreen.tsx`) and the auto-assign
  algorithm (`lib/assignments.ts`, wired into the assignor's dashboard).
- `lib/alert.ts` replaces `react-native-web`'s `Alert`, which ships as an empty
  function — importing `Alert` from `react-native` silently does nothing on web.
