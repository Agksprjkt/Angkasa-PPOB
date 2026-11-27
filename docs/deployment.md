# Deployment

## Supported database modes

- Local Windows development uses SQLite (`DATABASE_PROVIDER=sqlite`) and
  stores the database and uploaded files under `.data`.
- The Docker Compose stack defaults to PostgreSQL (`DATABASE_PROVIDER=postgres`)
  and Redis. PostgreSQL is the authoritative database; Redis is only used for
  short-lived rate limits and worker coordination.
- The running app is single-instance. Do not scale the web app or reconciler
  horizontally until their file storage, scheduling, and deployment behavior
  have been designed and tested for that setup.

The database mode is selected at process startup. A mode file, when configured,
overrides `DATABASE_PROVIDER`; changing either setting does not copy data,
create a backup, or safely switch a running deployment. The admin Sistem tab can
save a new mode, but it only takes effect after a restart and it never moves
data. **Do not switch the database of a live deployment without a complete
backup, restore, and cutover procedure rehearsed in staging.** Keep payments
disabled until that procedure has passed.

## Admin > Pengaturan > Sistem

The dashboard stores its choices in `.data/system-config.json` (override the
path with `SYSTEM_CONFIG_FILE`). It is a file rather than a database row on
purpose: the database connection settings must be readable before a connection
exists. Secrets inside it (database password, Redis password, S3 keys, Neon API
key) are encrypted with `BETTER_AUTH_SECRET`, so rotating that secret requires
re-entering them.

Environment variables always win over the dashboard, exactly like the
integration settings panel:

| Dashboard card | Environment override |
| --- | --- |
| Database provider | `DATABASE_PROVIDER` |
| Database URL | `DATABASE_URL` / `DATABASE_URL_FILE` |
| Migration URL | `DATABASE_URL_DIRECT` / `DATABASE_URL_DIRECT_FILE` |
| Startup migrations | `DATABASE_MIGRATE_ON_STARTUP` |
| Redis | `REDIS_URL`, `REDIS_PASSWORD_FILE` |
| Storage | none (dashboard only) |
| Storefront | none (dashboard only) |

- **Database** changes apply after a restart. Nothing is migrated between
  SQLite and PostgreSQL; take a backup and run a cutover before switching a
  deployment with data.
- **Redis** is optional. When disabled or unreachable, rate limiting falls back
  to the `order_lookup_rate_limits` table instead of allowing every request.
- **Storage** switches between the local filesystem and an S3-compatible bucket
  (AWS S3, Cloudflare R2, MinIO, Supabase). It takes effect on the next upload,
  without a restart. Existing files are not copied, so keep the old backend
  readable until the files have been moved. Local paths must stay inside the
  project directory; absolute paths and `..` are rejected.
- **Storefront** turns the built-in store on or off. When it is off,
  `src/proxy.ts` redirects every public page to `/admin/login`. `/admin*`,
  `/api/*`, `/_next/*`, and static assets stay reachable, so an external
  frontend that consumes the API is unaffected. The change applies on the next
  request; no restart is needed. Because the built-in store has no other login
  screen, `/admin/login` is the only way back in — make sure an admin account
  exists before switching it off.

### Store profile and contacts

`store_settings` holds three separate image slots plus the operational contacts:

| Field | Used for |
| --- | --- |
| `logoFile` | Header brand mark |
| `iconFile` | PWA manifest and `apple-touch-icon` |
| `faviconFile` | Browser tab icon |
| `ogImageFile` | Open Graph / Twitter card image (1200×630 recommended) |
| `socialLinks` | JSON array of `{ type, label, value }` shown in the home footer |
| `supportPhone` | Legacy help number, still used by payment and receipt screens |
| `seoTitle` / `seoDescription` | Search result title and description |
| `ogTitle` / `ogDescription` | Link preview copy; empty falls back to the SEO copy |
| `seoNoIndex` | `true` hides the store from crawlers and empties `robots.txt` |
| `googleSiteVerification` / `bingSiteVerification` | Webmaster meta tokens |
| `indexNowKey` | Serves `/<key>.txt` and drives the IndexNow submission |

Icons fall back down the chain `faviconFile → iconFile → logoFile → bundled
default`, so uploading one file still improves every surface. The home footer
renders only normalized links: WhatsApp becomes `wa.me`, email becomes
`mailto:`, and social URLs must point at the real service domain, which prevents
the footer from becoming an open redirect. When `socialLinks` is empty,
`supportPhone` is promoted to a single WhatsApp entry so existing stores keep a
working contact link.

### Neon

Two independent options, either can be used alone:

1. **Preset** (no API key): forces `sslmode=require`, keeps startup migrations
   off, and stores the pooled URL for runtime plus the direct URL for
   migrations. Migrations then run through `npm run db:migrate` as a deploy step.
2. **Neon API** (`NEON_API_KEY`): the dashboard can call
   `GET /projects/{id}/connection_uri` to fill both URLs. The role password is
   never sent to the browser; the server writes the URIs directly. With an
   organization ID it also shows 30-day consumption from
   `consumption_history/v2/projects`, falling back to the legacy
   `consumption_history/projects` endpoint. A `403` is shown as "metrics are not
   available for this plan" rather than an error.


## Managed PostgreSQL (Neon)

PostgreSQL can run on a managed provider such as Neon instead of the Compose
`postgres` service. The application supports this without code changes, but
three settings matter:

1. **Use the pooled URL for the app and the direct URL for migrations.** Neon
   exposes a PgBouncer endpoint (hostname contains `-pooler`) and a direct
   endpoint. The app detects the `-pooler` hostname and disables prepared
   statements automatically, because PgBouncer in transaction mode rejects
   them. Set `DATABASE_URL` (or `DATABASE_URL_FILE`) to the pooled URL, and run
   migrations with the direct URL by overriding `DATABASE_URL` for that one
   command.
2. **Keep TLS on.** Append `?sslmode=require` to the connection string. Neon
   refuses unencrypted connections.
3. **Do not migrate during startup on a managed database.** Set
   `DATABASE_MIGRATE_ON_STARTUP=false` and run `npm run db:migrate` as an
   explicit deploy step. Startup migrations race with `__drizzle_migrations`
   when more than one instance starts at once, and Neon's scale-to-zero can
   make the first connection exceed the app's startup window. The default is
   `true`, which preserves the existing self-hosted behavior.

Neon's free tier suspends an idle database after a few minutes. The first query
after a suspend pays a cold-start penalty; the app's `connect_timeout` of 10
seconds covers it. Connection limits are low on the free tier, so keep
`postgres` pool `max` at 10 or lower (the app already uses 10).

Neon is a good fit for **ephemeral per-PR branches and load testing**. It is not
a substitute for a staging environment that matches production: if production
runs the Compose `postgres` service, keep staging self-hosted too, because
network hops, cold starts, pooling, and connection ceilings differ. If
production moves to Neon, staging must move with it.

Redis is still required by the Compose stack for rate limits and worker
coordination. A managed Neon deployment needs its own Redis (or
`REDIS_URL`) if you rely on those features.

## Docker Compose setup

1. Use a supported Linux VPS (Docker Engine with the Compose v2 plugin) with a
   stable public egress IP, persistent disk, and an x86-64/amd64 CPU. Install
   security updates and configure the host firewall to allow SSH only from
   trusted addresses where practical, plus public HTTPS. Do not expose ports
   3000, 5432, or 6379 directly.
2. Point a domain's DNS record at the VPS. Put a TLS reverse proxy such as
   Caddy or Nginx in front of the app; the Compose app port is bound to
   `127.0.0.1:3000`. If a provider requires IP allowlisting, register the VPS's
   stable outbound IP (not just the DNS address).
3. Push the repository to GitHub and wait for CI to pass on `main`. The
   `publish-image` job then builds the Docker image on GitHub Actions and
   publishes `latest` and `sha-<full-commit>` tags to GHCR. On the first
   publication, GHCR may create the package as private: change its package
   visibility to **Public** in GitHub package settings before expecting an
   unauthenticated VPS pull to work. Ensure repository Actions policy permits
   `GITHUB_TOKEN` to publish packages. A public image exposes the packaged app
   contents; `.dockerignore` excludes local secret and backup folders, but
   never put credentials or private keys in tracked files or build arguments.
4. On the VPS, create a deployment directory containing `docker-compose.yml`,
   `.env`, and the secret files. The VPS does not need the application source
   tree or a GitHub token to pull a public image. Copy `.env.example` to `.env`,
   set `APP_IMAGE` to `ghcr.io/<owner>/<repository>:sha-<full-commit>`, set a
   unique `BETTER_AUTH_SECRET`, set `BETTER_AUTH_URL` to the public HTTPS URL,
   and set a random `PAYMENT_RECONCILER_SECRET` of at least 32 bytes. Keep
   `.env` out of source control.
5. Create the secret files referenced by
   `DATABASE_URL_SECRET_FILE`, `POSTGRES_PASSWORD_SECRET_FILE`, and
   `REDIS_PASSWORD_SECRET_FILE`. The PostgreSQL password in the database URL
   must match `postgres_password`. Use URL-safe password characters or
   percent-encode reserved characters in the URL. Restrict access to the
   deployment directory and secret files.
6. Configure only the provider credentials needed for the planned H2H
   connectivity test. Keep credentials in the VPS `.env` or secret files, not
   GitHub Actions, the Dockerfile, or image labels. First use the Admin
   Digiflazz settings to sync the price list; this calls the provider and
   updates the staging catalog without submitting an order. The authenticated
   `POST /api/admin/digiflazz/test` route can exercise the transaction API with
   its `testing: true` flag; use only provider-approved test SKU/customer data
   and confirm the provider-side testing behavior before calling it. Keep
   `ENABLE_REAL_TRANSACTIONS` unset/false and `QRISLY_ENABLED=false` unless a
   separately approved, controlled live-transaction test is intended.
7. Pull and start the pinned image with `docker compose pull` followed by
   `docker compose up -d --no-build`. Inspect `docker compose ps` and
   `docker compose logs --tail=100 app payment-reconciler`. PostgreSQL
   migrations run as part of application startup. Never use `docker compose
   down -v` for a routine update.
8. Set `BOOTSTRAP_ADMIN_ENABLED=true` only for first-time setup, provide the
   bootstrap admin values, and turn it off immediately after the account is
   created.

## Fresh VPS install, start to finish

This is the exact sequence used to provision a new host. Every step is
idempotent except the admin bootstrap, which must be switched off afterwards.

### 1. Pre-flight (no changes)

```sh
uname -m                 # must be x86_64
free -h; df -h /
ss -lntp                 # confirm 22/80/443 are free
docker --version 2>/dev/null || echo "docker not installed"
```

### 2. Docker Engine and Compose v2

Install from Docker's official repository, not a `curl | sh` script, so package
updates stay auditable:

```sh
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"    # re-login for this to take effect
```

Use `ubuntu` instead of `debian` in the repository URL on Ubuntu.

### 3. Firewall

```sh
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp        # HTTP/3
sudo ufw enable
```

Ports 3000, 5432, and 6379 must stay closed: Postgres and Redis live on the
internal `ppob-private` network, and the app is bound to host loopback.

### 4. Deployment directory and secrets

```sh
sudo mkdir -p /opt/ppob/secrets
sudo chown "$USER":"$USER" /opt/ppob
chmod 750 /opt/ppob
chmod 700 /opt/ppob/secrets
cd /opt/ppob
```

Copy `docker-compose.yml`, `Caddyfile`, and `.env.example` from the repository,
then generate every secret on the server. Never reuse a value from a local
`.env.local`: a shared `BETTER_AUTH_SECRET` makes local sessions invalid and
leaves locally stored integration credentials undecryptable on the server.

```sh
umask 077
openssl rand -hex 32 > secrets/postgres_password
openssl rand -hex 32 > secrets/redis_password
# The URL must carry the same password as postgres_password, percent-encoded.
printf 'postgres://ppob:%s@postgres:5432/ppob\n' "$(cat secrets/postgres_password)" > secrets/database_url
# 600 is not enough: the app container runs as its own non-root user, so a
# root- or host-user-owned file is unreadable and startup fails with EACCES.
# The 700 directory still keeps the values private.
chmod 644 secrets/*
```

Generate `BETTER_AUTH_SECRET` and `PAYMENT_RECONCILER_SECRET` into `.env`:

```sh
openssl rand -base64 48 | tr -d '\n'; echo
```

`.env` must contain at least:

```ini
APP_IMAGE=ghcr.io/agksprjkt/angkasa-ppob:sha-<full-commit>
BETTER_AUTH_URL=https://<domain>
BETTER_AUTH_SECRET=<new random value>
PAYMENT_RECONCILER_SECRET=<new random value, at least 32 bytes>
PPOB_SITE_ADDRESS=<domain>
PPOB_ACME_EMAIL=<your email>
```

`PPOB_SITE_ADDRESS` accepts a comma-separated list, so `example.com, www.example.com`
serves both names from one Caddy site block. Use `http://<ip>` before DNS is
ready: Caddy then serves plain HTTP and requests no certificate.

### 5. Start

```sh
docker compose pull
docker compose --profile tls up -d --no-build
docker compose ps
docker compose logs --tail=100 app payment-reconciler
```

The `tls` profile starts Caddy, which obtains a certificate automatically. DNS
must already resolve to this host and ports 80/443 must be reachable, otherwise
the certificate request fails and Caddy retries with backoff.

### 6. Bootstrap the admin

```sh
# add to .env temporarily
BOOTSTRAP_ADMIN_ENABLED=true
BOOTSTRAP_ADMIN_PHONE=+6281234567890
BOOTSTRAP_ADMIN_NAME=Store Administrator
BOOTSTRAP_ADMIN_PASSWORD=<unique strong password>

docker compose up -d app     # re-creates app with the new env
docker compose logs app | grep -i bootstrap

# then remove the four lines and restart, keeping the flag off
docker compose up -d app
```

### 7. Verify

```sh
curl -I https://<domain>/                    # 200 + security headers
curl -I https://<domain>/admin               # redirect to /admin/login
curl -s https://<domain>/api/store-settings  # valid JSON
docker compose exec postgres pg_isready      # accepting connections
docker compose logs app | grep -i migration  # no failure
ss -lntp | grep -E ':(3000|5432|6379)\b'     # must print nothing
```

A webhook endpoint with no configured secret answers `503`, and one with a
secret but a bad signature answers `401`. A `500` means something else is wrong.

### 8. Backups

`scripts/vps-backup.sh` in the repository dumps Postgres and archives the
`ppob-data` volume into `/opt/ppob/backups`, verifies the archive, sends it to
Telegram, and keeps the seven most recent local copies. It resolves the real
volume name through `docker compose config`, so it works regardless of the
Compose project name.

The maintenance scripts share one Telegram client (`scripts/telegram.sh`) and read
their credentials from a file outside the repository. Create the bot with
`@BotFather`, send it a message, then read the chat id from
`https://api.telegram.org/bot<token>/getUpdates`:

```sh
sudo install -d -m 700 /opt/ppob/secrets
sudo tee /opt/ppob/secrets/backup.env >/dev/null <<'EOF'
TELEGRAM_BOT_TOKEN=123456:replace-me
TELEGRAM_CHAT_ID=123456789
TELEGRAM_RETENTION=30
EOF
sudo chown "$USER":"$USER" /opt/ppob/secrets/backup.env
chmod 600 /opt/ppob/secrets/backup.env
```

Install the three scripts and schedule them. `17:00` UTC is `00:00` WIB; the
recap runs at `23:00` WIB so it arrives before the backup:

```sh
sudo mkdir -p /opt/ppob/backups && sudo chown "$USER":"$USER" /opt/ppob/backups
install -m 750 scripts/telegram.sh            /opt/ppob/telegram.sh
install -m 750 scripts/vps-backup.sh          /opt/ppob/backup.sh
install -m 750 scripts/vps-notify-failures.sh /opt/ppob/notify-failures.sh
install -m 750 scripts/vps-daily-report.sh    /opt/ppob/daily-report.sh
( crontab -l 2>/dev/null
  echo '*/5 * * * * /opt/ppob/notify-failures.sh >> /opt/ppob/backups/notify.log 2>&1'
  echo '0 16 * * * /opt/ppob/daily-report.sh >> /opt/ppob/backups/report.log 2>&1'
  echo '0 17 * * * /opt/ppob/backup.sh >> /opt/ppob/backups/backup.log 2>&1'
) | crontab -
```

Run each script once by hand before trusting the schedule. `backup.sh` must end
with `backup finished` in the log and the archive must appear in the Telegram
chat. A missing `TELEGRAM_BOT_TOKEN` only skips the upload; the local archive is
still written. A failed upload exits non-zero so cron records it in `backup.log`.

The three jobs are:

| Script | When (UTC) | Sends |
| --- | --- | --- |
| `notify-failures.sh` | every 5 min | failed and manual-review transactions, silent when none are new |
| `daily-report.sh` | `0 16` | 24-hour recap: counts, amounts, margin, deposits, attention items, disk, backup age |
| `backup.sh` | `0 17` | the archive as a Telegram document |

`notify-failures.sh` keeps reported transaction ids in `backups/.failure-state`, so
a transaction is announced once. Destinations are masked to the last four
characters before they leave the host.

Restore is rehearsed into a scratch directory, never straight over production:

```sh
cd /opt/ppob/backups
tar -tzf ppob-<stamp>.tar.gz | head        # inspect before extracting
mkdir -p /tmp/restore && tar -xzf ppob-<stamp>.tar.gz -C /tmp/restore
docker compose exec -T postgres createdb -U ppob ppob_restore_check
gunzip -c /tmp/restore/database.sql.gz | docker compose exec -T postgres psql -U ppob -d ppob_restore_check
docker compose exec -T postgres dropdb -U ppob ppob_restore_check
```

When the only copy left is the Telegram message, download it and continue the same
way:

```sh
token=$(sed -n 's/^TELEGRAM_BOT_TOKEN=//p' /opt/ppob/secrets/backup.env)
file_id=$(curl -fsS "https://api.telegram.org/bot$token/getUpdates" | grep -o '"file_id":"[^"]*"' | tail -n1 | cut -d'"' -f4)
path=$(curl -fsS "https://api.telegram.org/bot$token/getFile?file_id=$file_id" | grep -o '"file_path":"[^"]*"' | cut -d'"' -f4)
curl -fsS -o ppob-restored.tar.gz "https://api.telegram.org/file/bot$token/$path"
```

The `data.tar.gz` member restores into the `ppob-data` volume; mount it with a
throwaway container the same way the backup script does. A backup that has never
been restored is not a backup.

### Backup and restore from the dashboard

Admin > Pengaturan > Sistem has a **Backup & restore database** card. It writes
every table (users, products, transactions, deposits, balance ledger, settings)
into one gzipped JSON file and restores that file in a single transaction.

```sh
curl -fsS -b cookies.txt https://<domain>/api/admin/backup -o ppob-backup.json.gz
```

- The dump is dialect-tagged (`sqlite` or `postgres`) and rejected if it does not
  match the running database or the current table/column set, so a file from a
  different app version fails loudly instead of restoring partially.
- Restore requires typing `RESTORE`, deletes every row first, then inserts in
  foreign-key order. Nothing is committed unless the whole transaction succeeds.
- The `session` table is restored too, so every admin is logged out afterwards.
- It does **not** touch `.data/uploads`, `.env`, or `system-config.json`. File
  uploads still need `backup.sh` above, and provider credentials still live in
  `.env`/secrets.
- Prefer the dashboard file for day-to-day snapshots, but keep the nightly
  `backup.sh` archive as the off-site copy: the JSON file lives on the host you
  are restoring, which is exactly the host that can be lost.

The archive does not include `/opt/ppob/.env` or `/opt/ppob/secrets/`. Without
`BETTER_AUTH_SECRET` the encrypted fields in `.data/system-config.json` cannot be
decrypted, and without `secrets/postgres_password` the dump cannot be restored into
a fresh cluster. Store those values once in a password manager.


## Manual updates without building on the VPS

1. Wait until the `publish-image` job succeeds for the commit you want to test.
   Record its full commit SHA; its version-specific image tag is
   `ghcr.io/<owner>/<repository>:sha-<full-commit>`.
2. Before every update to a deployment with data to preserve, create a
   consistent backup. The following example briefly stops the app and worker
   so the database and `ppob-data` volume represent the same point in time:

   ```sh
   mkdir -p backups
   chmod 700 backups
   stamp="$(date -u +%Y%m%dT%H%M%SZ)"
   app_container="$(docker compose ps -q app)"
   test -n "$app_container"
   docker compose stop app payment-reconciler
   docker compose exec -T postgres sh -ec \
     'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
     > "backups/postgres-$stamp.dump"
   docker run --rm --volumes-from "$app_container:ro" \
     -v "$PWD/backups:/backup" alpine:3.22 \
     sh -ec "tar -czf /backup/ppob-data-$stamp.tar.gz -C /app/.data ."
   test -s "backups/postgres-$stamp.dump"
   test -s "backups/ppob-data-$stamp.tar.gz"
   ```

   Leave the app and worker stopped until the selected image has been pulled
   and is ready to start. If a backup command fails, do not update; run
   `docker compose start app payment-reconciler` to restore service and resolve
   the backup error first. Copy verified backups off-host before continuing.
3. In the VPS deployment `.env`, set `APP_IMAGE` to the selected SHA tag. Then
   validate the Compose configuration and run:

   ```sh
   docker compose config --quiet
   docker compose pull app payment-reconciler
   docker compose up -d --no-build app payment-reconciler
   docker compose ps
   docker compose logs --tail=100 app payment-reconciler
   ```

4. Confirm the app is healthy, sign in, and verify the flows in scope before
   considering the update complete. PostgreSQL and Redis keep their existing
   volumes; image updates do not reset application data.
5. To roll back application code, set `APP_IMAGE` to the previous known-good
   SHA tag, then repeat the pull and `up` commands. If the new image applied an
   incompatible database migration, restoring only the old image may not work:
   stop the app and worker and restore the matching pre-update database and
   `ppob-data` backups before starting the old image. Do not delete volumes as a
   rollback shortcut.

The VPS performs no `docker build`; GitHub Actions is the image builder. The
VPS only pulls the exact tag selected in `.env`. Prefer version-specific
`sha-...` tags over `latest` so an update is reproducible and can be rolled
back.

## Digiflazz product auto-sync

Product auto-sync is disabled by default. In the Admin dashboard's Digiflazz
settings, enable it and confirm an interval of 7, 14, or 30 days. The first
scheduled sync runs after the selected interval; manual sync remains available.
Successful syncs update the Digiflazz base price and recalculate customer and
Member prices using their separate markup rules. Newly imported products remain
inactive.

The `payment-reconciler` worker checks whether a product sync is due once a
minute. Keep that worker running for scheduled sync to work. In Docker Compose,
check it with `docker compose ps`; it uses `PAYMENT_RECONCILER_SECRET`, which
must be the same secret used by the app and contain at least 32 bytes.

For local development, set `PAYMENT_RECONCILER_SECRET` in `.env`, uncomment
the two local worker URLs in `.env`, and run `npm run worker:payments` in a
separate terminal while the app is running. Provider errors are recorded in
the Digiflazz settings and retried on the next selected interval; they do not
silently replace the last successful catalog.

## Digiflazz webhook

`POST /api/digiflazz/webhook` receives realtime prepaid transaction updates.
Configure it in the Digiflazz member panel under **Atur Koneksi > API >
Webhook**, using the public URL of this app and a secret of at least 16 bytes
that you also set as `DIGIFLAZZ_WEBHOOK_SECRET`. Digiflazz signs the raw request
body with HMAC-SHA1 and sends `X-Hub-Signature: sha1=<hex>`; an unsigned or
mismatched request gets `401`, and an empty secret makes the endpoint answer
`503`.

The handler acknowledges `ping` events without touching data. Each
`X-Digiflazz-Event` + reference combination is stored in `webhook_events`, so a
repeated delivery returns `{"replayed":true}` instead of crediting twice. A
callback for an already-settled transaction, a postpaid/hotel callback, and a
callback for a pending order older than 89 days are all acknowledged without
acting: Digiflazz re-creates a transaction when a status check runs past 90 days,
so those orders are parked for admin review instead.

Status is never taken from the request body alone. When the signed payload
carries a definitive `status`/`rc`, that value is applied through a
compare-and-set on `status = 'pending'`, so the webhook and the one-minute
reconciler cannot both refund the same order. Failed transactions are refunded
with the idempotency key `refund:<referenceId>`.

## Qrisly payment webhook

`POST /api/payment-gateway/callback` lets Qrisly notify the app instead of
waiting for the one-minute reconciler. Configure the provider to send the shared
secret in the `x-webhook-secret` header and set the same value as
`QRISLY_WEBHOOK_SECRET` (at least 32 bytes). When the variable is empty the
endpoint answers `503` and the reconciler stays the only payment trigger.

The payload is treated as a hint only: the handler looks up the invoice or
deposit by `history_id`, then re-reads the payment status and amount from Qrisly
with our own API key. A forged body therefore cannot mark anything paid. Each
`event_id` is stored in `webhook_events` (unique on provider + event id), so a
replayed delivery returns `{"replayed":true}` without reprocessing. Failures
leave the event unprocessed and return `503`, so a provider retry can finish the
reconciliation.

The app is published only on host loopback port 3000. Put a TLS-terminating
reverse proxy in front of it and expose only HTTPS to users. PostgreSQL and
Redis have no published host ports and use the private Compose network. Do not
mount the Docker socket into the app.

## Host and network requirements

A VPS with a stable public egress IP is the primary production target. Allowlist
that address with payment/provider services where supported. Homelab deployment
is suitable only when it has equally reliable public connectivity, a stable
egress address, persistent storage, monitored power/network, and tested
off-host backups. Terminate TLS at the public edge; do not expose database or
Redis ports to the Internet.

## Backups and recovery

Back up both the PostgreSQL database and the `ppob-data` volume. The latter
contains the selected-mode configuration and local uploads/assets (including
legacy deposit receipts). Keep encrypted copies off the host and periodically
test a restore into an isolated staging deployment. A database-only backup is
not sufficient to restore the complete application.

The nightly archive excludes `/opt/ppob/.env` and `/opt/ppob/secrets/` on purpose:
they hold the keys that decrypt everything else, so they belong in a password
manager rather than in a chat. Without `BETTER_AUTH_SECRET` the encrypted fields
in `.data/system-config.json` are unreadable, and without
`secrets/postgres_password` the dump cannot be restored into a fresh cluster.

For moving the deployment to another VPS, follow the dedicated
[VPS migration guide](./vps-migration.md). It covers a consistent final
snapshot, restoring PostgreSQL and `ppob-data`, DNS cutover, and rollback.

Before deploying schema changes, retain a verified database backup. PostgreSQL
backups should be made with `pg_dump` in custom format and restored with
`pg_restore` into a clean database. SQLite backups must be taken while the app
is stopped or with a SQLite-consistent backup mechanism; do not copy a live
database file as if it were guaranteed consistent. Restore uploads from the
same backup point as their database references.

The app does not currently provide a database-switch UI, automatic database
copy, encrypted backup orchestration, or automatic rollback after a failed
cutover. Treat a database migration as a separately rehearsed maintenance
operation. Do not point the app at a populated target database or switch modes
until data parity, wallet balances/ledger invariants, authentication, and
rollback have been verified in staging.

## Manual deposits and payment activation

Set the store's support phone to an active WhatsApp number in admin settings.
Users create a pending manual deposit in the app, then open a pre-filled
WhatsApp chat containing the deposit ID and amount and attach their payment
screenshot there. Opening WhatsApp does not credit the wallet. Admins must
verify the chat and payment before approving or rejecting the deposit in the
dashboard.

New manual deposits do not upload proof images to the application. The legacy
proof endpoint remains available for deposits that already have a stored
receipt; include local uploads in backups while those records are retained.

Only Qrisly is implemented for automatic payment. DOKU, Midtrans, and Xendit
remain unavailable. Qrisly payment status is verified by server-side polling;
the Compose payment worker reconciles pending Qrisly orders and wallet
deposits, plus pending Digiflazz wallet transactions. Keep live payment
activation disabled until provider connectivity, reconciliation, deposit
review, backup/restore, and the complete database migration path have passed
staging verification.

Mobile Legends orders require a numeric Zone / Server ID. The app stores it
separately from the player ID and combines both only in the Digiflazz request.
PLN token entry validates only the meter/customer-number format on the server;
this check does not perform a live customer lookup. Postpaid bill inquiry and
payment remain unavailable until a real provider inquiry is integrated.
