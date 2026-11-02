#!/usr/bin/env bash
# Rename the app: display name everywhere it is shown, plus the Android applicationId.
# Usage: scripts/rebrand.sh "<App Name>" <application.id>
# Leaves the Kotlin namespace (ai.offgridmobile) and keychain service names alone.
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 \"<App Name>\" <application.id>" >&2; exit 2; }
cd "$(dirname "$0")/.."

NAME="$1" APP_ID="$2" node - <<'JS'
const fs = require('fs');
const { NAME: name, APP_ID: id } = process.env;
if (!name.trim()) throw new Error('app name is empty');
if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(id)) {
  throw new Error(`not a valid Android application id: ${id}`);
}

const edit = (file, re, to) => {
  const src = fs.readFileSync(file, 'utf8');
  if (src.search(re) === -1) throw new Error(`${file}: no match for ${re}`);
  fs.writeFileSync(file, src.replace(re, () => to));
};

// XML entities, then Android's own escapes: backslash, quotes, a leading @ or ?.
const androidName = name
  .replace(/\\/g, '\\\\')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/'/g, "\\'").replace(/"/g, '\\"')
  .replace(/^([@?])/, '\\$1');
edit('android/app/src/main/res/values/strings.xml',
  /<string name="app_name">[^<]*<\/string>/, `<string name="app_name">${androidName}</string>`);

edit('android/app/build.gradle', /applicationId "[^"]*"/, `applicationId "${id}"`);
edit('package.json', /--appId [\w.]+/g, `--appId ${id}.dev`);
edit('src/config/branding.ts', /^ {2}name: .*,$/m, `  name: ${JSON.stringify(name)},`);

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
app.displayName = name;
fs.writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');

console.log(`Rebranded to ${JSON.stringify(name)} (${id}).`);
JS
