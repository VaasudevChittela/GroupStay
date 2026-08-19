/**
 * Master switch for the backend.
 *
 * false — the app runs entirely on the local sample data in lib/demo.ts. No
 *         sign-in, no network, no database setup. This is the current setting.
 *
 * true  — the real thing: Supabase auth, role-based routing, and row level
 *         security. Before flipping this back on, run both migrations in the
 *         Supabase SQL editor (see SETUP.md):
 *           supabase/migrations/0001_hotel_platform.sql
 *           supabase/migrations/0002_rbac.sql
 *
 * Nothing was deleted to turn this off — the auth screens, session layer, RBAC
 * policies and data layer are all still here and wired up.
 */
export const SUPABASE_ENABLED = false;
