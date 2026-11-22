#!/usr/bin/env bash
set -euo pipefail

# Both CI and cPanel unpack the committed revision into a fresh directory.
revision=${1:?Provide a Git revision}
destination=${2:?Provide an empty release directory}
git archive "$revision" admin server database/migrations package.json package-lock.json | tar -x -C "$destination"

for migration in 000_base 001_production_foundation 002_stream_uploads 003_images_posters 004_media_cleanup 005_daily_viewers 006_episode_defaults 007_series_workflow 008_monetization 009_admin_team; do
  if [[ ! -s "$destination/database/migrations/$migration.sql" ]]; then
    echo "Release is missing migration $migration.sql" >&2
    exit 1
  fi
done
