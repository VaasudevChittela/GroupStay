/**
 * Checks whether the GroupStay migrations have been applied.
 *
 * Uses the public anon key only — it cannot create anything, it just reports
 * what is there. Run:  node scripts/check-backend.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// Read the public config out of the TS file rather than importing it, so this
// runs under plain node with no build step.
const config = readFileSync(new URL('../lib/supabaseConfig.ts', import.meta.url), 'utf8');
const pick = (name) => config.match(new RegExp(`${name}\\s*=\\s*'([^']+)'`))?.[1];
const supabaseUrl = pick('supabaseUrl');
const supabaseAnonKey = pick('supabaseAnonKey');
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Could not read Supabase config from lib/supabaseConfig.ts');
  process.exit(2);
}

const sb = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

const MISSING_TABLE = 'PGRST205';
const MISSING_COLUMN = '42703';
const MISSING_FUNCTION = 'PGRST202';

const checks = [
  { m: '0001', label: 'rooms.status',            run: () => sb.from('rooms').select('status').limit(1) },
  { m: '0001', label: 'assignments.status',      run: () => sb.from('assignments').select('status').limit(1) },
  { m: '0001', label: 'digital_keys',            run: () => sb.from('digital_keys').select('id').limit(1) },
  { m: '0001', label: 'key_events',              run: () => sb.from('key_events').select('id').limit(1) },
  { m: '0001', label: 'guest_requests',          run: () => sb.from('guest_requests').select('id').limit(1) },
  { m: '0002', label: 'profiles',                run: () => sb.from('profiles').select('id').limit(1) },
  { m: '0002', label: 'hotels',                  run: () => sb.from('hotels').select('id').limit(1) },
  { m: '0002', label: 'chapters',                run: () => sb.from('chapters').select('id').limit(1) },
  { m: '0002', label: 'trips.hotel_id',          run: () => sb.from('trips').select('hotel_id').limit(1) },
  { m: '0003', label: 'hotels.city',             run: () => sb.from('hotels').select('city').limit(1) },
  { m: '0004', label: 'assignment_events',       run: () => sb.from('assignment_events').select('id').limit(1) },
  { m: '0004', label: 'notifications',           run: () => sb.from('notifications').select('id').limit(1) },
  { m: '0004', label: 'device_tokens',           run: () => sb.from('device_tokens').select('id').limit(1) },
];

// Fail closed. Only a clean read, or a permission error (which proves the
// object exists and RLS is guarding it), counts as present. Anything else —
// including a network failure — is unknown, never a pass.
const RLS_DENIED = '42501';

const results = [];
for (const check of checks) {
  let error;
  try {
    ({ error } = await check.run());
  } catch (e) {
    error = { code: 'NETWORK', message: e instanceof Error ? e.message : String(e) };
  }

  if (!error) {
    results.push({ ...check, state: 'present', note: 'readable' });
  } else if ([MISSING_TABLE, MISSING_COLUMN, MISSING_FUNCTION].includes(error.code)) {
    results.push({ ...check, state: 'missing', note: 'not created yet' });
  } else if (error.code === RLS_DENIED) {
    results.push({ ...check, state: 'present', note: 'exists, RLS enforcing' });
  } else {
    results.push({
      ...check,
      state: 'unknown',
      note: `could not check — ${error.code || 'no code'}: ${String(error.message).slice(0, 60)}`,
    });
  }
}

if (results.every((r) => r.state === 'unknown')) {
  console.error('\nCould not reach Supabase at all. Check the network and the URL in lib/supabaseConfig.ts.');
  console.error(`  ${results[0].note}\n`);
  process.exit(2);
}

const byMigration = {};
for (const r of results) {
  byMigration[r.m] ??= [];
  byMigration[r.m].push(r);
}

let allGood = true;
const mark = { present: 'ok  ', missing: 'MISS', unknown: '????' };
console.log('\nGroupStay backend check\n');
for (const [migration, rows] of Object.entries(byMigration)) {
  const done = rows.every((r) => r.state === 'present');
  if (!done) allGood = false;
  console.log(`  ${done ? 'OK  ' : 'TODO'}  ${migration}`);
  for (const r of rows) {
    console.log(`         ${mark[r.state]} ${r.label.padEnd(24)} ${r.note}`);
  }
}

// RLS is the whole point of 0002 — verify anon really was locked out.
let anonError;
try {
  ({ error: anonError } = await sb.from('guests').select('id').limit(1));
} catch {
  anonError = { code: 'NETWORK' };
}
const anonLockedOut = anonError?.code === RLS_DENIED;
console.log(
  `\n  ${anonLockedOut ? 'OK  ' : 'WARN'}  anonymous access ${anonLockedOut ? 'revoked' : 'still permitted — 0002 may not have run'}`,
);

console.log(
  allGood
    ? '\nAll migrations applied. Set SUPABASE_ENABLED = true in lib/config.ts.\n'
    : '\nRun supabase/SETUP_ALL.sql in the Supabase SQL editor, then re-run this.\n',
);
process.exit(allGood ? 0 : 1);
