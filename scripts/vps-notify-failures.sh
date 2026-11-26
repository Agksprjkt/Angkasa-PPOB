#!/bin/sh
# Report failed and stuck transactions to Telegram.
#
# Runs every five minutes from cron and stays silent when there is nothing new.
# The app already records everything this needs (status, rc, needsManualReview),
# so the script only reads; no application hook is required.
#
# Install:
#   install -m 750 scripts/vps-notify-failures.sh /opt/ppob/notify-failures.sh
#   crontab -e  ->  */5 * * * * /opt/ppob/notify-failures.sh >/dev/null 2>&1
set -eu

deploy_dir=${DEPLOY_DIR:-/opt/ppob}
backup_dir=${BACKUP_DIR:-$deploy_dir/backups}
state_file=${FAILURE_STATE:-$backup_dir/.failure-state}
log_file=${NOTIFY_LOG:-$backup_dir/notify.log}
window_minutes=${FAILURE_WINDOW_MINUTES:-5}

script_dir=$(dirname "$0")
. "$script_dir/telegram.sh"

cd "$deploy_dir"

log() {
  echo "[$(date -u +%FT%TZ)] $*"
}

if ! telegram_ready; then
  log "telegram not configured; nothing to do"
  exit 0
fi

db_user=${POSTGRES_USER:-ppob}
db_name=${POSTGRES_DB:-ppob}

# -t unaligned tuples with '|' separators so the shell can split them without jq.
# Masked destination: the chat should not become a copy of customer phone numbers.
query() {
  docker compose exec -T postgres psql -t -A -F'|' -v ON_ERROR_STOP=1 \
    -U "$db_user" -d "$db_name" -c "$1"
}

rows=$(query "
  select 'failed', t.id, to_char(t.\"createdAt\" at time zone 'UTC', 'HH24:MI'),
         t.\"productName\", t.destination, t.amount::text,
         coalesce(t.\"vendorResponse\"->>'rc', ''), coalesce(t.\"vendorResponse\"->>'message', '')
  from transactions t
  where t.status = 'failed'
    and t.\"createdAt\" > now() - interval '${window_minutes} minutes'
  union all
  select 'review', t.id, to_char(coalesce(t.\"manualReviewAt\", t.\"updatedAt\") at time zone 'UTC', 'HH24:MI'),
         t.\"productName\", t.destination, t.amount::text,
         coalesce(t.\"vendorResponse\"->>'rc', ''), coalesce(t.\"vendorResponse\"->>'message', '')
  from transactions t
  where t.\"needsManualReview\" = true
    and coalesce(t.\"manualReviewAt\", t.\"updatedAt\") > now() - interval '${window_minutes} minutes'
  order by 3
")

if [ -z "$rows" ]; then
  log "no new failures"
  exit 0
fi

# Same transaction can reappear while a retry settles; key on id so the alert is
# sent once. The state file is trimmed to the current ids to stay small.
mkdir -p "$backup_dir"
touch "$state_file"
new_rows=$(printf '%s\n' "$rows" | while IFS='|' read -r kind id rest; do
  [ -n "$id" ] || continue
  if ! grep -qxF "$id" "$state_file"; then
    printf '%s|%s|%s\n' "$kind" "$id" "$rest"
  fi
done)

if [ -z "$new_rows" ]; then
  log "all failures already reported"
  exit 0
fi

mask() {
  # Keep the last four characters so support can match a report to an order.
  printf '%s' "$1" | sed -e 's/^\(.*\)\(....\)$/\1***\2/'
}

money() {
  # amounts are stored as integer rupiah; print with thousands separators.
  printf '%s' "$1" | sed -e :a -e 's/\([0-9]\)\([0-9]\{3\}\)/\1.\2/;ta'
}

failed_count=$(printf '%s\n' "$new_rows" | grep -c '^failed|' || true)
review_count=$(printf '%s\n' "$new_rows" | grep -c '^review|' || true)

message="<b>⚠️ Transaksi bermasalah</b>"
if [ "$failed_count" -gt 0 ]; then
  message="$message
${failed_count} gagal"
fi
if [ "$review_count" -gt 0 ]; then
  message="$message
${review_count} perlu review manual"
fi
message="$message
"

message="$message
$(printf '%s\n' "$new_rows" | while IFS='|' read -r kind id time product destination amount rc detail; do
  [ -n "$id" ] || continue
  label='Gagal'
  if [ "$kind" = 'review' ]; then
    label='Review'
  fi
  printf '\n%s %s · %s · %s · Rp %s\n' \
    "$time" "$label" "$(telegram_escape "$product")" \
    "$(telegram_escape "$(mask "$destination")")" "$(money "$amount")"
  if [ -n "$rc" ] || [ -n "$detail" ]; then
    printf '  %s %s\n' "$(telegram_escape "$rc")" "$(telegram_escape "$detail")"
  fi
done)"

message="$message
<a href=\"https://srva.cloud/admin\">Buka dashboard admin</a>"

if telegram_send_message "$message" > /dev/null; then
  log "reported $failed_count failed and $review_count review"
  # Keep only ids that still exist in the window, so a later repeat of the same
  # order is reported again after it leaves the window.
  printf '%s\n' "$rows" | cut -d'|' -f2 | sort -u > "$state_file"
else
  log "telegram send failed"
  exit 1
fi

if [ -f "$log_file" ]; then
  lines=$(wc -l < "$log_file")
  if [ "$lines" -gt 2000 ]; then
    tail -n 2000 "$log_file" > "$log_file.tmp"
    mv "$log_file.tmp" "$log_file"
  fi
fi
