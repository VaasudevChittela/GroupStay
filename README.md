# GroupStay

Rooming lists, room picks, and check-in for school trips. Students pick rooms with friends, advisors lock assignments and send the hotel a manifest, hotels mark rooms ready, and parents sign permission slips.

Live demo: https://groupstay.netlify.app

## Getting started

You need [Node.js](https://nodejs.org) (LTS).

```bash
git clone https://github.com/VaasudevChittela/GroupStay.git
cd GroupStay
npm install
cp .env.example .env
npx expo start --web
```

Then open http://localhost:8081. On the login screen, tap any **demo account** to sign in as an advisor, student, chaperone, parent, or hotel staff.

## Demo mode vs. Supabase

`.env` has `EXPO_PUBLIC_DEMO_MODE=true`, so the app runs on a built-in fake backend (`lib/demoBackend.ts`, data in `lib/demoSeed.ts`) saved in your browser. Use **Reset demo data** on the home screen to start over.

The real database setup is in `supabase/schema.sql`. Any new table or column needs adding there **and** to the demo backend's defaults and seed.

## Where things are

- `App.tsx`: home screen, login routing, and the advisor screens
- `screens/`: student, parent, hotel staff, and shared screens
- `components/`: shared UI (`ui.tsx`), QR code, map, hotel search
- `lib/`: data types, notifications, theme, demo backend, helpers
- `styles.ts` and `lib/theme.ts`: colors, light/dark mode, text size

## Publishing the web demo

```bash
npm run export:web
```

Then drag the `dist` folder onto the project in Netlify ("Already built it?").

## Working together

- Pull before you start: `git pull`
- Work on a branch (`git checkout -b my-change`), push it, and open a pull request, so you don't overwrite each other's work.
