import 'server-only';

import { eq } from 'drizzle-orm';
import { decryptIntegrationSetting, encryptIntegrationSetting } from './integration-settings-crypto';
import { resolveIntegrationSetting } from './integration-settings-resolver';
import { getDatabase } from './db/client';
import { integrationSettings } from './db/schema';
import {
  digiflazzAutoSyncIntervals,
  type DigiflazzAutoSyncInterval,
} from '@/lib/digiflazz-product-sync-schedule';

const settingNames = [
  'whatsappProvider',
  'fonnteToken',
  'openwaApiUrl',
  'openwaApiKey',
  'openwaSessionId',
  'digiflazzUsername',
  'digiflazzApiKey',
  'digiflazzMode',
  'enableRealTransactions',
  'digiflazzAutoSyncEnabled',
  'digiflazzAutoSyncIntervalDays',
  'digiflazzAutoSyncNextRunAt',
  'digiflazzAutoSyncLastRunAt',
  'digiflazzAutoSyncLastStatus',
  'digiflazzAutoSyncLastError',
  'digiflazzAutoSyncLastResult',
  'qrislyApiKey',
  'qrislyQrisId',
  'qrislyMode',
  'qrislyEnabled',
  'activePaymentGateway',
] as const;

export type IntegrationSettingName = (typeof settingNames)[number];
export type IntegrationSettingValues = Partial<
  Record<IntegrationSettingName, string>
>;
export type IntegrationSettingSource = 'environment' | 'dashboard' | 'unset';

export type IntegrationConfig = {
  values: IntegrationSettingValues;
  sources: Record<IntegrationSettingName, IntegrationSettingSource>;
};

export const integrationSettingEnvironmentNames: Record<
  IntegrationSettingName,
  string | null
> = {
  whatsappProvider: 'WHATSAPP_PROVIDER',
  fonnteToken: 'FONNTE_TOKEN',
  openwaApiUrl: 'OPENWA_API_URL',
  openwaApiKey: 'OPENWA_API_KEY',
  openwaSessionId: 'OPENWA_SESSION_ID',
  digiflazzUsername: 'DIGIFLAZZ_USERNAME',
  digiflazzApiKey: 'DIGIFLAZZ_API_KEY',
  digiflazzMode: 'DIGIFLAZZ_MODE',
  enableRealTransactions: 'ENABLE_REAL_TRANSACTIONS',
  digiflazzAutoSyncEnabled: 'DIGIFLAZZ_AUTO_SYNC_ENABLED',
  digiflazzAutoSyncIntervalDays: 'DIGIFLAZZ_AUTO_SYNC_INTERVAL_DAYS',
  digiflazzAutoSyncNextRunAt: null,
  digiflazzAutoSyncLastRunAt: null,
  digiflazzAutoSyncLastStatus: null,
  digiflazzAutoSyncLastError: null,
  digiflazzAutoSyncLastResult: null,
  qrislyApiKey: 'QRISLY_API_KEY',
  qrislyQrisId: 'QRISLY_ID',
  qrislyMode: 'QRISLY_MODE',
  qrislyEnabled: 'QRISLY_ENABLED',
  activePaymentGateway: 'ACTIVE_PAYMENT_GATEWAY',
};

export function isIntegrationSettingName(
  value: string,
): value is IntegrationSettingName {
  return settingNames.includes(value as IntegrationSettingName);
}

export async function getIntegrationConfig(): Promise<IntegrationConfig> {
  const rows = await getDatabase().select().from(integrationSettings);
  const stored: IntegrationSettingValues = {};
  for (const row of rows) {
    if (isIntegrationSettingName(row.name)) {
      stored[row.name] = decryptIntegrationSetting(row.name, row.encryptedValue);
    }
  }

  const values: IntegrationSettingValues = {};
  const sources = {} as Record<
    IntegrationSettingName,
    IntegrationSettingSource
  >;
  for (const name of settingNames) {
    const environmentName = integrationSettingEnvironmentNames[name];
    const resolved = resolveIntegrationSetting(
      environmentName ? process.env[environmentName] : undefined,
      stored[name],
    );
    if (resolved.value !== undefined) values[name] = resolved.value;
    sources[name] = resolved.source;
  }

  return { values, sources };
}

export async function saveIntegrationSettings(
  actorId: string | null,
  updates: IntegrationSettingValues,
  clear: IntegrationSettingName[],
) {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    for (const name of clear) {
      await tx.delete(integrationSettings).where(eq(integrationSettings.name, name));
    }
    for (const [name, value] of Object.entries(updates)) {
      if (!isIntegrationSettingName(name) || value === undefined) continue;
      const encryptedValue = encryptIntegrationSetting(name, value);
      await tx
        .insert(integrationSettings)
        .values({
          name,
          encryptedValue,
          updatedBy: actorId,
        })
        .onConflictDoUpdate({
          target: integrationSettings.name,
          set: {
            encryptedValue,
            updatedBy: actorId,
            updatedAt: new Date(),
          },
        });
    }
  });
}

export function isIntegrationSettingEnvironmentOverridden(
  name: IntegrationSettingName,
) {
  const environmentName = integrationSettingEnvironmentNames[name];
  return Boolean(environmentName && process.env[environmentName]?.trim());
}

export const internalIntegrationSettingNames = [
  'digiflazzAutoSyncEnabled',
  'digiflazzAutoSyncIntervalDays',
  'digiflazzAutoSyncNextRunAt',
  'digiflazzAutoSyncLastRunAt',
  'digiflazzAutoSyncLastStatus',
  'digiflazzAutoSyncLastError',
  'digiflazzAutoSyncLastResult',
] as const satisfies readonly IntegrationSettingName[];

export function isInternalIntegrationSetting(
  name: IntegrationSettingName,
): name is (typeof internalIntegrationSettingNames)[number] {
  return (internalIntegrationSettingNames as readonly string[]).includes(name);
}

export type DigiflazzAutoSyncResult = {
  total: number;
  synced: number;
  created: number;
  updated: number;
  skipped: number;
};

export async function getDigiflazzAutoSyncConfig() {
  const { values, sources } = await getIntegrationConfig();
  const intervalValue = Number(values.digiflazzAutoSyncIntervalDays);
  const intervalDays = (values.digiflazzAutoSyncIntervalDays
    ? intervalValue
    : 7) as DigiflazzAutoSyncInterval;
  if (
    !digiflazzAutoSyncIntervals.includes(
      intervalDays as DigiflazzAutoSyncInterval,
    )
  ) {
    throw new Error('INVALID_DIGIFLAZZ_AUTO_SYNC_INTERVAL');
  }
  let lastResult: DigiflazzAutoSyncResult | null = null;
  if (values.digiflazzAutoSyncLastResult) {
    try {
      const parsed: unknown = JSON.parse(values.digiflazzAutoSyncLastResult);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        ['total', 'synced', 'created', 'updated', 'skipped'].every(
          (key) =>
            Number.isSafeInteger((parsed as Record<string, unknown>)[key]) &&
            Number((parsed as Record<string, unknown>)[key]) >= 0,
        )
      ) {
        lastResult = parsed as DigiflazzAutoSyncResult;
      }
    } catch {
      lastResult = null;
    }
  }
  return {
    enabled: values.digiflazzAutoSyncEnabled === 'true',
    intervalDays,
    enabledSource: sources.digiflazzAutoSyncEnabled,
    intervalSource: sources.digiflazzAutoSyncIntervalDays,
    enabledEditable: sources.digiflazzAutoSyncEnabled !== 'environment',
    intervalEditable: sources.digiflazzAutoSyncIntervalDays !== 'environment',
    nextRunAt: values.digiflazzAutoSyncNextRunAt ?? null,
    lastRunAt: values.digiflazzAutoSyncLastRunAt ?? null,
    lastStatus: values.digiflazzAutoSyncLastStatus ?? null,
    lastError: values.digiflazzAutoSyncLastError ?? null,
    lastResult,
  };
}

export async function saveDigiflazzAutoSyncState(values: {
  enabled?: boolean;
  intervalDays?: DigiflazzAutoSyncInterval;
  nextRunAt?: string;
  lastRunAt?: string;
  lastStatus?: 'scheduled' | 'running' | 'success' | 'failed';
  lastError?: string;
  lastResult?: DigiflazzAutoSyncResult;
  clearLastError?: boolean;
  clearLastResult?: boolean;
  clearNextRunAt?: boolean;
}) {
  const updates: IntegrationSettingValues = {};
  const clear: IntegrationSettingName[] = [];
  if (values.enabled !== undefined) {
    updates.digiflazzAutoSyncEnabled = String(values.enabled);
  }
  if (values.intervalDays !== undefined) {
    updates.digiflazzAutoSyncIntervalDays = String(values.intervalDays);
  }
  if (values.nextRunAt !== undefined) {
    updates.digiflazzAutoSyncNextRunAt = values.nextRunAt;
  }
  if (values.lastRunAt !== undefined) {
    updates.digiflazzAutoSyncLastRunAt = values.lastRunAt;
  }
  if (values.lastStatus !== undefined) {
    updates.digiflazzAutoSyncLastStatus = values.lastStatus;
  }
  if (values.lastError !== undefined) {
    updates.digiflazzAutoSyncLastError = values.lastError;
  }
  if (values.lastResult !== undefined) {
    updates.digiflazzAutoSyncLastResult = JSON.stringify(values.lastResult);
  }
  if (values.clearLastError) clear.push('digiflazzAutoSyncLastError');
  if (values.clearLastResult) clear.push('digiflazzAutoSyncLastResult');
  if (values.clearNextRunAt) clear.push('digiflazzAutoSyncNextRunAt');
  await saveIntegrationSettings(null, updates, clear);
}

export async function getDigiflazzConfig() {
  const { values } = await getIntegrationConfig();
  return {
    username: values.digiflazzUsername,
    apiKey: values.digiflazzApiKey,
    mode: values.digiflazzMode ?? 'sandbox',
    enableRealTransactions: values.enableRealTransactions === 'true',
  };
}

export async function getWhatsAppConfig() {
  const { values } = await getIntegrationConfig();
  return {
    provider: values.whatsappProvider,
    fonnteToken: values.fonnteToken,
    openwaApiUrl: values.openwaApiUrl,
    openwaApiKey: values.openwaApiKey,
    openwaSessionId: values.openwaSessionId,
  };
}

export async function getQrislyConfig() {
  const { values } = await getIntegrationConfig();
  return {
    apiKey: values.qrislyApiKey,
    qrisId: values.qrislyQrisId,
    mode: values.qrislyMode === 'production' ? 'production' as const : 'sandbox' as const,
    enabled: values.qrislyEnabled === 'true',
  };
}

export async function getActivePaymentGateway() {
  const { values } = await getIntegrationConfig();
  const gateway = values.activePaymentGateway?.toLowerCase();
  if (!gateway || gateway === 'qrisly') return 'qrisly' as const;
  if (gateway === 'none') return 'none' as const;
  if (gateway === 'doku' || gateway === 'midtrans' || gateway === 'xendit') {
    return gateway;
  }
  throw new Error('ACTIVE_PAYMENT_GATEWAY_INVALID');
}

export { settingNames as integrationSettingNames };
