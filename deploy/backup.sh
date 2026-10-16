#!/bin/sh
# Every night at 02:00 (Malaysia time): database dump + photos/signatures archive into deploy/backups.
# Keeps KEEP_DAYS days. Copy the backups folder off the server too (see docs/GO-LIVE.md).
set -eu
run() {
  stamp=$(date +%Y-%m-%d_%H%M)
  pg_dump -Fc -f "/backups/db-$stamp.dump"
  tar -czf "/backups/files-$stamp.tar.gz" -C /data storage 2>/dev/null || tar -czf "/backups/files-$stamp.tar.gz" -T /dev/null
  find /backups -name 'db-*.dump' -mtime +"$KEEP_DAYS" -delete
  find /backups -name 'files-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
  echo "Backup done: $stamp"
}
if [ "${1:-}" = "now" ]; then run; exit 0; fi
while true; do
  now=$(date +%s)
  next=$(date -d "$(date +%Y-%m-%d) 02:00" +%s 2>/dev/null || echo 0)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  [ "$next" -le "$now" ] && next=$((now + 86400))
  sleep $((next - now))
  run || echo "Backup FAILED at $(date)"
done
