#!/bin/sh
# Nightly backup for the Compose deployment.
#
# Dumps Postgres and archives the ppob-data volume (uploads, system-config, the
# SQLite fallback) into one tarball per run, then prunes everything beyond the
# retention count. Run from /opt/ppob, where docker-compose.yml lives.
#
# Install:
#   install -m 750 scripts/vps-backup.sh /opt/ppob/backup.sh
#   crontab -e  ->  0 3 * * * /opt/ppob/backup.sh >> /opt/ppob/backups/backup.log 2>&1
set -eu

deploy_dir=${DEPLOY_DIR:-/opt/ppob}
backup_dir=${BACKUP_DIR:-$deploy_dir/backups}
retention=${BACKUP_RETENTION:-7}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$backup_dir/ppob-$stamp.tar.gz"

cd "$deploy_dir"
mkdir -p "$backup_dir"

# Fail loudly rather than writing an empty archive: a silent failure here means
# the only copy of the data is the live volume.
if ! docker compose ps --status running --services | grep -qx postgres; then
  echo "[$(date -u +%FT%TZ)] postgres is not running; refusing to back up" >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "[$(date -u +%FT%TZ)] dumping database"
# POSTGRES_USER/POSTGRES_DB come from .env; fall back to the Compose defaults.
db_user=${POSTGRES_USER:-ppob}
db_name=${POSTGRES_DB:-ppob}
docker compose exec -T postgres \
  pg_dump --clean --if-exists --no-owner -U "$db_user" -d "$db_name" \
  | gzip -9 > "$work/database.sql.gz"

echo "[$(date -u +%FT%TZ)] archiving ppob-data volume"
# Resolve the real volume name: Compose prefixes it with the project name, which
# depends on the directory, so hardcoding "ppob_ppob-data" would break elsewhere.
volume=$(docker compose config --format json \
  | sed -n 's/.*"source": *"\([^"]*ppob-data\)".*/\1/p' | head -n1)
if [ -z "$volume" ]; then
  echo "[$(date -u +%FT%TZ)] could not resolve the ppob-data volume name" >&2
  exit 1
fi

# A throwaway container mounts the volume read-only so the archive is consistent
# even while the app is writing.
docker run --rm \
  -v "$volume":/data:ro \
  -v "$work":/out \
  alpine:3 sh -c 'cd /data && tar -czf /out/data.tar.gz .'

tar -czf "$archive" -C "$work" database.sql.gz data.tar.gz
chmod 600 "$archive"
echo "[$(date -u +%FT%TZ)] wrote $archive ($(du -h "$archive" | cut -f1))"

# Keep the newest N archives. Sorting by name works because the stamp is
# lexicographically ordered.
count=$(ls -1 "$backup_dir"/ppob-*.tar.gz 2>/dev/null | wc -l)
if [ "$count" -gt "$retention" ]; then
  ls -1 "$backup_dir"/ppob-*.tar.gz | sort | head -n "-$retention" | while read -r old; do
    echo "[$(date -u +%FT%TZ)] pruning $old"
    rm -f "$old"
  done
fi

echo "[$(date -u +%FT%TZ)] backup finished"
