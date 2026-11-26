#!/bin/sh
# Nightly backup for the Compose deployment.
#
# Dumps Postgres and archives the ppob-data volume (uploads, system-config, the
# SQLite fallback) into one tarball per run, verifies the archive, sends it to
# Telegram, then prunes everything beyond the retention count. Run from
# /opt/ppob, where docker-compose.yml lives.
#
# Install:
#   install -m 750 scripts/vps-backup.sh /opt/ppob/backup.sh
#   install -m 750 scripts/telegram.sh   /opt/ppob/telegram.sh
#   crontab -e  ->  0 17 * * * /opt/ppob/backup.sh >> /opt/ppob/backups/backup.log 2>&1
set -eu

deploy_dir=${DEPLOY_DIR:-/opt/ppob}
backup_dir=${BACKUP_DIR:-$deploy_dir/backups}
retention=${BACKUP_RETENTION:-7}
telegram_retention=${TELEGRAM_RETENTION:-30}
telegram_ids="$backup_dir/.telegram-ids"
log_file=${BACKUP_LOG:-$backup_dir/backup.log}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$backup_dir/ppob-$stamp.tar.gz"

script_dir=$(dirname "$0")
. "$script_dir/telegram.sh"

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
# Resolve the real volume name from the running container's mounts. Compose
# prefixes the volume with the project name, and `docker compose config` reports
# the *key* ("ppob-data") in the service section, not the volume it resolves to —
# matching that key silently archives an empty volume that happens to share the
# name.
app_container=$(docker compose ps -q app)
if [ -z "$app_container" ]; then
  echo "[$(date -u +%FT%TZ)] app container not found; cannot resolve ppob-data" >&2
  exit 1
fi
volume=$(docker inspect "$app_container" \
  --format '{{range .Mounts}}{{if eq .Destination "/app/.data"}}{{.Name}}{{end}}{{end}}')
if [ -z "$volume" ]; then
  echo "[$(date -u +%FT%TZ)] could not resolve the ppob-data volume name" >&2
  exit 1
fi
echo "[$(date -u +%FT%TZ)] volume=$volume"

# A throwaway container mounts the volume read-only so the archive is consistent
# even while the app is writing.
docker run --rm \
  -v "$volume":/data:ro \
  -v "$work":/out \
  alpine:3 sh -c 'cd /data && tar -czf /out/data.tar.gz .'

# An empty volume archives to a tarball holding only "./" — that looks like a
# successful run while the only real copy of the uploads is still on the host.
if [ "$(tar -tzf "$work/data.tar.gz" | grep -vc '^\./$')" -eq 0 ]; then
  echo "[$(date -u +%FT%TZ)] data archive is empty; wrong volume $volume?" >&2
  exit 1
fi

tar -czf "$archive" -C "$work" database.sql.gz data.tar.gz
chmod 600 "$archive"

# A truncated archive is worse than no upload: it looks like a backup and is not
# one. Verify before anything leaves the host.
if ! tar -tzf "$archive" > /dev/null 2>&1; then
  echo "[$(date -u +%FT%TZ)] archive failed verification: $archive" >&2
  exit 1
fi
echo "[$(date -u +%FT%TZ)] wrote $archive ($(du -h "$archive" | cut -f1))"

# Off-site copy. A missing token only skips the upload; the local archive above
# is already safe, so a half-configured bot must not fail the nightly job.
if telegram_ready; then
  size=$(du -h "$archive" | cut -f1)
  db_size=$(du -h "$work/database.sql.gz" | cut -f1)
  data_size=$(du -h "$work/data.tar.gz" | cut -f1)
  caption="Backup $stamp · $size (DB $db_size + data $data_size)"
  if message_id=$(telegram_send_document "$archive" "$caption"); then
    if [ -n "$message_id" ]; then
      echo "[$(date -u +%FT%TZ)] sent to telegram (message $message_id)"
      echo "$message_id" >> "$telegram_ids"
      # Prune the oldest messages first; the file name order is not the message
      # order once a retry re-sends an older archive.
      sent=$(wc -l < "$telegram_ids")
      if [ "$sent" -gt "$telegram_retention" ]; then
        head -n "-$telegram_retention" "$telegram_ids" | while read -r old_id; do
          [ -n "$old_id" ] || continue
          if telegram_delete_message "$old_id"; then
            echo "[$(date -u +%FT%TZ)] pruned telegram message $old_id"
          else
            echo "[$(date -u +%FT%TZ)] could not prune telegram message $old_id" >&2
          fi
        done
        tail -n "$telegram_retention" "$telegram_ids" > "$telegram_ids.tmp"
        mv "$telegram_ids.tmp" "$telegram_ids"
      fi
    else
      echo "[$(date -u +%FT%TZ)] telegram accepted the upload but returned no message id" >&2
    fi
  else
    echo "[$(date -u +%FT%TZ)] telegram upload failed; local archive kept" >&2
    exit 1
  fi
else
  echo "[$(date -u +%FT%TZ)] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing; skipped upload"
fi

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

# Keep the log bounded; cron appends to it forever otherwise.
if [ -f "$log_file" ]; then
  lines=$(wc -l < "$log_file")
  if [ "$lines" -gt 2000 ]; then
    tail -n 2000 "$log_file" > "$log_file.tmp"
    mv "$log_file.tmp" "$log_file"
  fi
fi
