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
create a backup, or safely switch a running deployment. **Database switching
from the admin dashboard is not implemented. Do not edit the mode file on a
live deployment to switch databases.** Keep payments disabled until a complete
backup, restore, and cutover procedure has passed in staging.

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
