# Authentication setup

PAYKU authentication uses Better Auth and a local SQLite database.
Customers sign in with their WhatsApp number and password; new numbers must be
verified by OTP. Password recovery also uses a WhatsApp OTP.
Passwords must contain at least 8 characters.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Generate a secret with:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

3. Generate a random secret and set it as `BETTER_AUTH_SECRET`. Keep the admin
   login and integration credentials in `.env.local`, not in source files.
4. Run `npm run dev`. The app creates `.data/app.db`, applies local schema
   migrations, and creates the admin account from the bootstrap environment
   values when enabled.

`BETTER_AUTH_SECRET` is a private server-side key Better Auth uses to protect
authentication data; it is not the admin login password. Keep it in `.env.local`
or a deployment secret manager, never in source code or client-side variables.
The existing local `.env.local` secret can be retained; rotating it invalidates
existing sessions and makes dashboard-stored integration credentials unreadable.
The local database lives at `.data/app.db`, which is ignored by Git.

## Provision the initial administrator

The application does not ship with a default admin password. For the first
administrator only, set these values in `.env.local` (local development) or
the deployment's server-side secret manager:

- `BOOTSTRAP_ADMIN_ENABLED=true`
- `BOOTSTRAP_ADMIN_PHONE` in E.164 format, such as `+6281234567890`
- `BOOTSTRAP_ADMIN_NAME`
- `BOOTSTRAP_ADMIN_PASSWORD` with at least 8 characters

Set `BOOTSTRAP_ADMIN_ENABLED=true`, `BOOTSTRAP_ADMIN_PHONE`,
`BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` in `.env.local`. The
password must be at least 8 characters. `npm run dev` provisions this account
the first time; a phone/email conflict is left unchanged, so this does not
reset an existing password. The local phone can be entered as `08...` or
`+628...`. Sign in with that phone and password. Regular customers still
register through the normal OTP flow.

Never commit `.env.local` or put real credentials in `.env.example`. After the
admin exists, set `BOOTSTRAP_ADMIN_ENABLED=false`. The SQLite database is local
development storage; do not use it as a production financial ledger or rely on
it for multi-instance deployments. Database schema changes are applied locally
when the app starts; `npm run db:generate` creates the next SQLite migration.
Do not treat demo balances or transactions as real financial records.

The `.env.example` Digiflazz variables are server-side only. Configure valid
sandbox credentials before testing wallet purchases; production transactions
also require `ENABLE_REAL_TRANSACTIONS=true`. The app does not fall back to
simulated success if the provider is unreachable. Add product records from the
admin workspace after provisioning the initial administrator.

## WhatsApp providers

Set the selected provider and credentials in the server environment, or leave
those variables empty and configure them from **Admin → Integrasi API**. The
dashboard supports Fonnte, OpenWA, Digiflazz, and Qrisly credentials.
Environment values take precedence over dashboard values; the dashboard
indicates when a setting is locked by the environment. Qrisly can be enabled
for wallet deposits and product checkout after its API key and merchant QR ID
are configured. Qrisly payments are checked by server-side status polling and
credited or fulfilled only after an exact amount match. Inbound webhook
processing remains disabled: the published webhook example does not document
signature verification and uses a different history-ID field/format than the
QR-generation and status examples. Do not trust webhook payloads to fulfill an
order until Qrisly confirms a verifiable contract.

Manual bank-transfer and static-QR deposits require an uploaded proof and admin
approval before the balance changes. Merchant QR images and deposit proofs are
stored under `.data/uploads` on the local filesystem and served through
authenticated routes. This is development-only storage; use private persistent
object storage before a multi-instance or production deployment.

Dashboard credentials are encrypted in the local SQLite database with AES-256-GCM. The
encryption key is derived from `BETTER_AUTH_SECRET`; preserve that secret across
local restarts or saved integration credentials cannot be decrypted. The API
never returns secret values to the browser.

For OpenWA, create a session in the OpenWA server, start it, and pair the
WhatsApp account using its QR flow. Copy that session's ID into
`OPENWA_SESSION_ID`. Create an API key restricted to the session when OpenWA
allows session-scoped keys, and store it only in server-side environment
configuration. The app sends OTP messages to
`/api/sessions/{sessionId}/messages/send-text` with the `chatId` and `text`
fields. `OPENWA_API_URL` is the OpenWA server origin (the documented default is
`http://localhost:2785`); the API key is sent in the `X-API-Key` header.

OpenWA is an unofficial WhatsApp Web automation project and may result in
account restrictions, including in production. You chose to continue with it
for OTP delivery; monitor the linked account and have a migration path to an
approved provider if access is restricted. Never put provider tokens in
client-side configuration.

## Admin and agent access

Public registration only creates a customer account. Users cannot choose or
edit their role. Admins can promote registered accounts to agent/admin roles
from the admin panel. If access to the panel is unavailable, promote a verified
account through a controlled local SQLite operation:

```sql
UPDATE "user" SET role = 'admin' WHERE "phoneNumber" = '+6281234567890';
```

Run it only from a local SQLite client against `.data/app.db`, and confirm the
affected row before exposing the account. `/admin` and `/agent` validate the
session and role on the server; unauthenticated or mismatched sessions are
redirected to `/`.

## Current scope

Auth, catalog, and transaction schema use local SQLite for development. Public
catalog reads, admin product changes, customer transaction history, wallet and
Qrisly order creation, and admin deposit review are server-side. Guest checkout
is Qrisly-only and requires a contact phone number; its access token is required
to check the invoice status. Signed-in customers can pay with wallet balance or
Qrisly. Manual bank-transfer and static-QR payments are deposit-only. Manual
deposits create a pending record; the ledger is credited only after admin
approval. Qrisly wallet deposits are credited once, in the same database
transaction as their approved status, only after server polling confirms the
exact amount. Paid Qrisly checkout invoices are fulfilled once using their
stored product and price snapshot. Admin user listing,
role changes, and balance adjustments are also persisted server-side. The admin
workspace can search and paginate transaction history and retry a failed
wallet transaction. A retry debits the user's balance again and records the
admin and provider attempt; an explicit provider failure is refunded. An
unclear provider outcome remains pending while the payment worker checks
Digiflazz using the original vendor reference; confirmed failures are refunded
once. Orders that cannot be queried (for example, because credentials or the
provider mode changed) still require admin review. Do not use checkout,
balances, or deposits for real money.

Customers (role `user`) and agents (shown as `Member` in the UI) must create
and enter a six-digit transaction PIN for every wallet-balance purchase. The
PIN is salted and hashed server-side using a key derived from
`BETTER_AUTH_SECRET`; the secret must remain stable or saved PINs cannot be
verified. Five incorrect PIN attempts lock verification for 15 minutes. Admins
are not subject to this check.

At present, the generic payment-gateway and Digiflazz callback endpoints return
HTTP 503 rather than accepting unverified events. Gateway providers other than
Qrisly are not configured for checkout. Wallet orders require a verified
account, an active database product, and server-side Digiflazz credentials.
Qrisly checkout invoices are tracked separately from wallet deposits and
require an active database product plus server-side Qrisly and Digiflazz
credentials. Provider timeouts leave a paid checkout pending for background
reconciliation; prolonged or ambiguous outcomes still require admin review.

The auth and role routes use the Node.js runtime and local SQLite. Cloudflare
Workers and D1 are not configured in this stage.
