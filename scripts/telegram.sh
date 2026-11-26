#!/bin/sh
# Thin Telegram Bot API client for the VPS maintenance scripts.
#
# Sourced, not executed: `. scripts/telegram.sh`. Credentials come from
# secrets/backup.env so they never live in the repo or in crontab.
#
# Telegram caps bot uploads at 50 MB. The archive is ~3 MB today; if uploads grow
# past that, switch to a local Bot API server or object storage instead of
# raising this limit.
set -eu

telegram_env=${TELEGRAM_ENV_FILE:-/opt/ppob/secrets/backup.env}
if [ -f "$telegram_env" ]; then
  # The file is plain KEY=VALUE; values may contain ':' and '-'.
  set -a
  . "$telegram_env"
  set +a
fi

telegram_ready() {
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]
}

# Every call is bounded: a hung request must not stall the cron job forever.
telegram_api() {
  method=$1
  shift
  curl -fsS --max-time 60 --retry 2 --retry-delay 3 \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}" "$@"
}

# Echoes the message_id so callers can prune it later.
# The response is captured first: piping curl into sed would report sed's exit
# status, so a 401 from Telegram would look like success.
telegram_send_message() {
  text=$1
  response=$(telegram_api sendMessage \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    --data-urlencode "parse_mode=HTML" \
    --data-urlencode "disable_web_page_preview=true") || return 1
  printf '%s' "$response" | sed -n 's/.*"message_id":\([0-9]*\).*/\1/p'
}

telegram_send_document() {
  file=$1
  caption=$2
  response=$(telegram_api sendDocument \
    -F "chat_id=${TELEGRAM_CHAT_ID}" \
    -F "document=@${file}" \
    -F "caption=${caption}") || return 1
  printf '%s' "$response" | sed -n 's/.*"message_id":\([0-9]*\).*/\1/p'
}

telegram_delete_message() {
  message_id=$1
  telegram_api deleteMessage \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "message_id=${message_id}" > /dev/null
}

# Escape text for parse_mode=HTML. Only the three characters Telegram parses.
telegram_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}
