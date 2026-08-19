/**
 * Switches GroupStay from sample data to the live Supabase backend.
 *
 * Verifies the schema first and only flips the flag if every migration is
 * present — enabling the backend against a half-migrated project just moves the
 * failure somewhere less obvious.
 *
 *   node scripts/enable-backend.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const check = spawnSync(process.execPath, ['scripts/check-backend.mjs'], {
  stdio: 'inherit',
});

if (check.status !== 0) {
  console.error('Backend not ready — leaving lib/config.ts on sample data.\n');
  console.error('Run supabase/SETUP_ALL.sql in the Supabase SQL editor, then try again.\n');
  process.exit(check.status ?? 1);
}

const path = 'lib/config.ts';
const source = readFileSync(path, 'utf8');

if (/SUPABASE_ENABLED\s*=\s*true/.test(source)) {
  console.log('Already pointing at Supabase. Nothing to change.\n');
  process.exit(0);
}

writeFileSync(path, source.replace(/SUPABASE_ENABLED\s*=\s*false/, 'SUPABASE_ENABLED = true'));
console.log('lib/config.ts updated — GroupStay now uses your Supabase project.');
console.log('Restart the dev server, then create your first hotel staff account.\n');
