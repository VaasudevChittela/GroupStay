# GroupStay

Hotel room management and digital room keys for group travel — built for club trips
(DECA, HOSA, FBLA) where one hotel hosts a block of rooms and a chapter advisor has to
get a few dozen students into them.

Expo / React Native app (iOS, Android, web) with a Supabase backend.

## Running it

```bash
npm install
npm run web      # or: npm run ios / npm run android
```

It opens straight into a working app on sample data — no account, no database setup.

## Three roles

| Role | Sees |
| --- | --- |
| **Hotel staff** | Every room at their property: live status board, who is in each room, check in/out, digital keys, housekeeping and guest requests |
| **Chapter assignor** | Only their chapter's students: search, filter, assign and reassign rooms, auto-assign, group messaging |
| **Student** | Only their own reservation, room, digital key, and the names of people in *their* room |

## Features

**Room inventory** — add every room with a type (Single, Double, Queen, King, Double
Queen, Quadruple, Family Suite, Custom), capacity, floor, notes and photos. Six live
statuses: available, occupied, reserved, cleaning, maintenance, out of service.

**Live dashboard** — colour-coded room cards showing occupants by name, stay dates,
cleaning state and active key count. Arrivals and departures for today, plus who hasn't
checked in. Updates in realtime as staff work.

**Digital room key** — issued automatically at check-in, styled like a boarding pass.
QR credential, wallet passes for Apple and Google, shareable with roommates, revocable
by staff, and self-expiring at checkout.

**Room assignment** — assign by hand, or auto-assign a whole chapter at once: chaperones
get spread across rooms, mutual roommate requests are honoured, and everyone else fills
the smallest room that still fits.

## Backend

Off by default. `lib/config.ts`:

```ts
export const SUPABASE_ENABLED = false;   // local sample data
```

To use the real backend, run both migrations in the Supabase SQL editor and flip the
flag — see [SETUP.md](SETUP.md).

Access control is enforced in Postgres with row level security, not in the app. Each
role's scope is decided by helper functions against `auth.uid()`, so a hand-crafted
request still can't read another hotel's rooms or another chapter's students. Students
have no `SELECT` on trips at all — their own trip comes back through a `SECURITY
DEFINER` function, so trip codes can't be enumerated.

## Layout

```
lib/            data layer, theme, digital keys, wallet, sample data
components/     shared UI — room card, key card, icons, primitives
screens/hotel/  staff workspace: dashboard, rooms, guests, room detail
screens/chapter/ chapter assignor workspace
screens/guest/  student stay + room key
screens/auth/   sign in and organization setup
supabase/       migrations and the wallet-pass edge function
legacy/         the original single-file app, kept for reference
```
