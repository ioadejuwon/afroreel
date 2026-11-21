#!/usr/bin/env bash
# Run on cPanel from the active checkout after its staging smoke test.
set -euo pipefail
umask 077
app=$(pwd -P)
node_bin=$(command -v node)
[[ -f "$app/dist/server/src/run-media.js" && -f "$app/.env" ]] || { echo "Build the application and configure .env first." >&2; exit 1; }
# Cron gives '%' and newlines special meaning, including inside shell quotes.
case "$app$node_bin" in *"'"*|*'%'*|*$'\n'*) echo "Unsupported cron path." >&2; exit 1;; esac
entry="*/5 * * * * cd '$app' && '$node_bin' --env-file=.env dist/server/src/run-media.js cleanup # AfroReel media $app"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
if ! LC_ALL=C crontab -l > "$work/current" 2>"$work/error"; then
  if ! grep -Eq '^no crontab for ' "$work/error"; then cat "$work/error" >&2; exit 1; fi
fi
awk -v marker="# AfroReel media $app" 'length($0) < length(marker) || substr($0, length($0)-length(marker)+1) != marker' "$work/current" > "$work/new"
printf '%s\n' "$entry" >> "$work/new"
if ! cmp -s "$work/current" "$work/new"; then crontab "$work/new"; fi
