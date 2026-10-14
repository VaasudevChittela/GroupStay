// Netlify Drop skips any folder named "node_modules", but Expo's web export puts the icon fonts
// under dist/assets/node_modules/. This moves them to dist/assets/vendor/ and points the
// JavaScript bundle at the new location. Run after `expo export --platform web`.

const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const from = path.join(dist, 'assets', 'node_modules');
const to = path.join(dist, 'assets', 'vendor');

if (!fs.existsSync(from)) {
  console.log('Nothing to move.');
  process.exit(0);
}

fs.rmSync(to, { recursive: true, force: true });
fs.renameSync(from, to);

let updated = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|html|json|css)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      if (text.includes('/assets/node_modules/')) {
        fs.writeFileSync(full, text.split('/assets/node_modules/').join('/assets/vendor/'));
        updated++;
      }
    }
  }
};
walk(dist);
console.log(`Moved fonts to assets/vendor and updated ${updated} file(s).`);
