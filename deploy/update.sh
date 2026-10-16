#!/bin/sh
# Install the latest version: backup first, then pull, rebuild and restart (about 1 minute of downtime).
set -eu
cd "$(dirname "$0")"
docker compose exec -T backup sh /backup.sh now
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
echo "Updated. Check: docker compose ps"
