#!/bin/sh
# Restore the database and photos from a backup in deploy/backups.
#   ./restore.sh 2026-10-16_0200
# The app is stopped during the restore. Everything entered after that backup is lost.
set -eu
cd "$(dirname "$0")"
stamp=${1:?Usage: ./restore.sh YYYY-MM-DD_HHMM  (see the files in backups/)}
db="backups/db-$stamp.dump"; files="backups/files-$stamp.tar.gz"
[ -f "$db" ] && [ -f "$files" ] || { echo "Backup $stamp not found in backups/"; exit 1; }
printf 'This replaces ALL current data with the backup from %s. Type RESTORE to continue: ' "$stamp"
read -r answer; [ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }
docker compose stop app
docker compose exec -T backup pg_restore --clean --if-exists --no-owner -d heavyworks "/backups/db-$stamp.dump"
docker compose run --rm --no-deps -v "$PWD/backups:/backups:ro" --user root --entrypoint sh app -c \
  "rm -rf /data/storage && tar -xzf /backups/files-$stamp.tar.gz -C /data && chown -R node:node /data/storage"
docker compose start app
echo "Restored $stamp."
