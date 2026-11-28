#!/bin/sh
# Daily recap to Telegram at 23:00 WIB (16:00 UTC).
#
# Sent an hour before the nightly backup so a failed report still leaves time to
# notice before the next cycle.
#
# Install:
#   install -m 750 scripts/vps-daily-report.sh /opt/ppob/daily-report.sh
#   crontab -e  ->  0 16 * * * /opt/ppob/daily-report.sh >/dev/null 2>&1
set -eu

deploy_dir=${DEPLOY_DIR:-/opt/ppob}
backup_dir=${BACKUP_DIR:-$deploy_dir/backups}
log_file=${REPORT_LOG:-$backup_dir/report.log}

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

query() {
  docker compose exec -T postgres psql -t -A -F'|' -v ON_ERROR_STOP=1 \
    -U "$db_user" -d "$db_name" -c "$1"
}

# Jakarta is UTC+7 all year; the reporting day is the last 24 hours ending now.
# A calendar day would miss transactions near midnight when cron runs at 23:00.
tx=$(query "
  select
    count(*) filter (where status = 'success'),
    coalesce(sum(amount) filter (where status = 'success'), 0),
    count(*) filter (where status = 'failed'),
    coalesce(sum(amount) filter (where status = 'failed'), 0),
    count(*) filter (where status = 'pending'),
    coalesce(sum(amount) filter (where status = 'pending'), 0),
    coalesce(sum(profit) filter (where status = 'success'), 0)
  from transactions
  where \"createdAt\" > now() - interval '24 hours'
")

deposits=$(query "
  select
    count(*) filter (where status = 'approved'),
    coalesce(sum(amount) filter (where status = 'approved'), 0),
    count(*) filter (where status = 'pending' and \"createdAt\" < now() - interval '24 hours')
  from deposits
  where \"createdAt\" > now() - interval '24 hours'
  or (status = 'pending' and \"createdAt\" < now() - interval '24 hours')
")

attention=$(query "
  select
    (select count(*) from transactions where \"needsManualReview\" = true),
    (select count(*) from transactions
       where status = 'pending' and \"createdAt\" < now() - interval '30 minutes')
")

IFS='|' read -r ok_count ok_amount fail_count fail_amount pend_count pend_amount margin <<EOF
$tx
EOF

IFS='|' read -r dep_count dep_amount dep_stale <<EOF
$deposits
EOF

IFS='|' read -r review_count stale_count <<EOF
$attention
EOF

# A quiet day should not ping the phone. Skip only when the whole recap would be
# zeros: no transactions at all and nothing waiting on a human.
if [ "$ok_count" -eq 0 ] && [ "$fail_count" -eq 0 ] && [ "$pend_count" -eq 0 ] \
  && [ "$dep_count" -eq 0 ] && [ "$dep_stale" -eq 0 ] \
  && [ "$review_count" -eq 0 ] && [ "$stale_count" -eq 0 ]; then
  log "no transactions in the last 24 hours; recap skipped"
  exit 0
fi

money() {
  printf '%s' "$1" | sed -e :a -e 's/\([0-9]\)\([0-9]\{3\}\)/\1.\2/;ta'
}

# Only the last 24 hours of structured error codes; the app already logs them as
# [SOME_CODE] so a grep is enough.
error_codes=''
app_container=$(docker compose ps -q app 2>/dev/null || true)
if [ -n "$app_container" ]; then
  error_codes=$(docker compose logs --since 24h app 2>/dev/null \
    | grep -oE '\[[A-Z][A-Z_]+\]' | sort | uniq -c | sort -rn | head -n 3 \
    | awk '{printf "%s (%s) ", $2, $1}')
fi

latest_backup=$(ls -1t "$backup_dir"/ppob-*.tar.gz 2>/dev/null | head -n 1 || true)
if [ -n "$latest_backup" ]; then
  backup_age_h=$(( ( $(date +%s) - $(stat -c %Y "$latest_backup") ) / 3600 ))
  backup_line="$backup_age_h jam lalu · $(du -h "$latest_backup" | cut -f1)"
else
  backup_line='belum ada'
fi

disk=$(df --output=pcent / | tail -n 1 | tr -dc '0-9')
today=$(TZ=Asia/Jakarta date '+%d %b %Y')

message="<b>📊 Rekap $(telegram_escape "$today")</b>
<i>24 jam terakhir</i>

<b>Transaksi</b>
Sukses   ${ok_count}   Rp $(money "$ok_amount")
Gagal    ${fail_count}   Rp $(money "$fail_amount")
Pending  ${pend_count}   Rp $(money "$pend_amount")
Margin   Rp $(money "$margin")

<b>Deposit</b>
Disetujui  ${dep_count}   Rp $(money "$dep_amount")
Menunggu &gt; 24 jam  ${dep_stale}

<b>Perlu perhatian</b>
Review manual  ${review_count}
Pending &gt; 30 mnt  ${stale_count}"

if [ -n "$error_codes" ]; then
  message="$message
Error  $(telegram_escape "$error_codes")"
fi

message="$message

<b>Sistem</b>
Backup  $(telegram_escape "$backup_line")
Disk    ${disk}%
<a href=\"https://srva.cloud/admin\">Buka dashboard</a>"

if telegram_send_message "$message" > /dev/null; then
  log "daily report sent"
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
