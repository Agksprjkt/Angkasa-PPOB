// Neon and other PgBouncer transaction-mode poolers reject prepared statements.
export function isPooledEndpoint(url: string) {
  try {
    return new URL(url).hostname.includes('-pooler');
  } catch {
    return false;
  }
}

export function parseMigrateOnStartup(value: string | undefined) {
  const configured = value?.trim().toLowerCase();
  if (!configured) return true;
  if (configured === 'true' || configured === '1') return true;
  if (configured === 'false' || configured === '0') return false;
  throw new Error('DATABASE_MIGRATE_ON_STARTUP must be "true" or "false"');
}

// The environment wins over the dashboard; the database config supplies the
// default. Resolved database URLs already disable startup migrations for Neon.
export function resolveMigrateOnStartup(
  environmentValue: string | undefined,
  configValue: boolean,
) {
  const configured = environmentValue?.trim();
  return configured ? parseMigrateOnStartup(configured) : configValue;
}
