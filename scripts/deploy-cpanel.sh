#!/usr/bin/env bash
set -euo pipefail
umask 077

app="$HOME/public_html/afroreel"
cd "$app"
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
export NODE_ENV=production

mkdir -p "$HOME/afroreel-releases"
exec 9>"$HOME/afroreel-releases/deploy.lock"
flock -n 9 || { echo "Another AfroReel deployment is running." >&2; exit 1; }
revision=$(git rev-parse HEAD)
release=$(mktemp -d "$HOME/afroreel-releases/${revision:0:8}.XXXXXX")
echo "Preparing release $revision in $release"
bash scripts/package-cpanel.sh "$revision" "$release"
(
  cd "$release"
  NODE_ENV=development npm ci --prefix "$release" --include=dev --no-audit --no-fund
  node node_modules/typescript/bin/tsc -p server/tsconfig.json
)

# Load the same configuration as Passenger and fail before modifying the database.
node --env-file="$app/.env" -e 'require(process.argv[1])' "$release/dist/server/src/config.js"
node --env-file="$app/.env" - <<'NODE' | gzip > "$release/predeploy.sql.gz"
const { spawnSync } = require('node:child_process');
const e = process.env;
if (!e.DB_NAME || !e.DB_USER) throw Error('Database name and user are required for backup');
const args = ['--single-transaction', '--quick', '--skip-lock-tables', '--no-tablespaces',
  '--user=' + e.DB_USER, '--host=' + (e.DB_HOST || 'localhost'), '--port=' + (e.DB_PORT || '3306')];
if (e.DB_SOCKET_PATH) args.push('--socket=' + e.DB_SOCKET_PATH);
const result = spawnSync('mysqldump', [...args, e.DB_NAME], {
  stdio: 'inherit', env: { PATH: e.PATH, HOME: e.HOME, MYSQL_PWD: e.DB_PASS || '' }
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
NODE
gzip -t "$release/predeploy.sql.gz"
(
  cd "$release"
  node --env-file="$app/.env" dist/server/src/migrate.js
)

# Passenger keeps its configured entry point. Each release resolves its own
# dependencies, views and admin assets without changing cPanel's node_modules link.
entry="$app/dist/server/src/index.js"
mkdir -p "$(dirname "$entry")" "$app/tmp"
if [[ -f "$entry" ]]; then cp -p "$entry" "$release/previous-passenger-entry.js"; fi
node - "$app" "$release" <<'NODE' > "$entry.next"
const [app, release] = process.argv.slice(2);
console.log('process.loadEnvFile(' + JSON.stringify(app + '/.env') + ');');
console.log('process.chdir(' + JSON.stringify(release) + ');');
console.log('require(' + JSON.stringify(release + '/dist/server/src/index.js') + ');');
NODE
mv -f "$entry.next" "$entry"
touch "$app/tmp/restart.txt"

node --env-file="$app/.env" - <<'NODE'
const url = process.env.PUBLIC_BASE_URL.replace(/\/+$/, '') + '/health/ready';
(async () => {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (response.ok) {
        const health = await response.json();
        if (health.status === 'ready' && health.database === 'ok') {
          console.log('Production API and database ready.');
          return;
        }
      }
    } catch { /* Passenger may still be restarting. */ }
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  throw Error('Production readiness check failed: ' + url);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
NODE

# Cron and the audit CLI must resolve the same private release as Passenger.
media_entry="$app/dist/server/src/run-media.js"
if [[ -f "$media_entry" ]]; then cp -p "$media_entry" "$release/previous-media-entry.js"; fi
node - "$release" <<'NODE' > "$media_entry.next"
const release = process.argv[2];
console.log('process.chdir(' + JSON.stringify(release) + ');');
console.log('require(' + JSON.stringify(release + '/dist/server/src/run-media.js') + ');');
NODE
mv -f "$media_entry.next" "$media_entry"
