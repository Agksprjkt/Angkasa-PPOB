import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import {
  getIntegrationConfig,
  getDigiflazzAutoSyncConfig,
  getTokoVoucherAutoSyncConfig,
  integrationSettingNames,
  isIntegrationSettingEnvironmentOverridden,
  isInternalIntegrationSetting,
  isIntegrationSettingName,
  saveIntegrationSettings,
  type IntegrationSettingName,
  type IntegrationSettingValues,
} from '@/lib/server/integration-settings';

export const runtime = 'nodejs';

// Webhook URLs are shown to the admin to paste into the vendor panel. They are
// built from the configured public origin, not from the request, so the value is
// correct even when the dashboard is opened over localhost.
function resolveWebhookBaseUrl() {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  try {
    return new URL(configured ?? 'http://localhost:3000').origin;
  } catch {
    return 'http://localhost:3000';
  }
}

function snapshotResponse(
  config: Awaited<ReturnType<typeof getIntegrationConfig>>,
  autoSync: Awaited<ReturnType<typeof getDigiflazzAutoSyncConfig>>,
  tokoVoucherAutoSync: Awaited<ReturnType<typeof getTokoVoucherAutoSyncConfig>>,
  webhookBaseUrl: string,
) {
  const { values, sources } = config;
  const status = (name: IntegrationSettingName) => ({
    configured: Boolean(values[name]),
    source: sources[name],
    editable: sources[name] !== 'environment',
  });

  return {
    whatsapp: {
      provider: values.whatsappProvider ?? '',
      providerSource: sources.whatsappProvider,
      providerEditable: sources.whatsappProvider !== 'environment',
      fonnteToken: status('fonnteToken'),
      openwaApiUrl: values.openwaApiUrl ?? '',
      openwaApiUrlSource: sources.openwaApiUrl,
      openwaApiUrlEditable: sources.openwaApiUrl !== 'environment',
      openwaApiKey: status('openwaApiKey'),
      openwaSessionId: values.openwaSessionId ?? '',
      openwaSessionIdSource: sources.openwaSessionId,
      openwaSessionIdEditable: sources.openwaSessionId !== 'environment',
    },
    digiflazz: {
      username: values.digiflazzUsername ?? '',
      usernameSource: sources.digiflazzUsername,
      usernameEditable: sources.digiflazzUsername !== 'environment',
      apiKey: status('digiflazzApiKey'),
      mode: values.digiflazzMode ?? 'sandbox',
      modeSource: sources.digiflazzMode,
      modeEditable: sources.digiflazzMode !== 'environment',
      enableRealTransactions: values.enableRealTransactions === 'true',
      enableRealTransactionsSource: sources.enableRealTransactions,
      enableRealTransactionsEditable:
        sources.enableRealTransactions !== 'environment',
      enabled: values.digiflazzEnabled !== 'false',
      enabledSource: sources.digiflazzEnabled,
      enabledEditable: sources.digiflazzEnabled !== 'environment',
      showProducts: values.digiflazzShowProducts !== 'false',
      showProductsSource: sources.digiflazzShowProducts,
      showProductsEditable: sources.digiflazzShowProducts !== 'environment',
      webhookSecret: status('digiflazzWebhookSecret'),
      webhookUrl: `${webhookBaseUrl}/api/digiflazz/webhook`,
      autoSync,
    },
    qrisly: {
      apiKey: status('qrislyApiKey'),
      qrisId: values.qrislyQrisId ?? '',
      qrisIdSource: sources.qrislyQrisId,
      qrisIdEditable: sources.qrislyQrisId !== 'environment',
      mode: values.qrislyMode ?? 'sandbox',
      modeSource: sources.qrislyMode,
      modeEditable: sources.qrislyMode !== 'environment',
      enabled: values.qrislyEnabled === 'true',
      enabledSource: sources.qrislyEnabled,
      enabledEditable: sources.qrislyEnabled !== 'environment',
      activePaymentGateway: values.activePaymentGateway ?? 'qrisly',
      activePaymentGatewaySource: sources.activePaymentGateway,
      activePaymentGatewayEditable: sources.activePaymentGateway !== 'environment',
    },
    tokovoucher: {
      memberCode: values.tokovoucherMemberCode ?? '',
      memberCodeSource: sources.tokovoucherMemberCode,
      memberCodeEditable: sources.tokovoucherMemberCode !== 'environment',
      secret: status('tokovoucherSecret'),
      defaultSignature: status('tokovoucherDefaultSignature'),
      mode: values.tokovoucherMode === 'production' ? 'production' : 'sandbox',
      modeSource: sources.tokovoucherMode,
      modeEditable: sources.tokovoucherMode !== 'environment',
      enableRealTransactions: values.tokovoucherEnableRealTransactions === 'true',
      enableRealTransactionsSource: sources.tokovoucherEnableRealTransactions,
      enableRealTransactionsEditable:
        sources.tokovoucherEnableRealTransactions !== 'environment',
      enabled: values.tokovoucherEnabled === 'true',
      enabledSource: sources.tokovoucherEnabled,
      enabledEditable: sources.tokovoucherEnabled !== 'environment',
      showProducts: values.tokovoucherShowProducts !== 'false',
      showProductsSource: sources.tokovoucherShowProducts,
      showProductsEditable: sources.tokovoucherShowProducts !== 'environment',
      webhookSecret: status('tokovoucherWebhookSecret'),
      webhookUrl: `${webhookBaseUrl}/api/tokovoucher/webhook`,
      autoSync: tokoVoucherAutoSync,
    },
  };
}

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  try {
    const [config, autoSync, tokoVoucherAutoSync] = await Promise.all([
      getIntegrationConfig(),
      getDigiflazzAutoSyncConfig(),
      getTokoVoucherAutoSyncConfig(),
    ]);
    return NextResponse.json(snapshotResponse(config, autoSync, tokoVoucherAutoSync, resolveWebhookBaseUrl()));
  } catch (error) {
    console.error(
      '[ADMIN_INTEGRATION_SETTINGS_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown settings error',
    );
    return NextResponse.json(
      { error: 'INTEGRATION_SETTINGS_UNAVAILABLE' },
      { status: 503 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 16_384) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    Object.keys(payload).some((key) => key !== 'values' && key !== 'clear') ||
    !('values' in payload) ||
    typeof payload.values !== 'object' ||
    payload.values === null ||
    Array.isArray(payload.values) ||
    ('clear' in payload &&
      (!Array.isArray(payload.clear) ||
        payload.clear.some((item) => typeof item !== 'string')))
  ) {
    return NextResponse.json({ error: 'INVALID_SETTINGS_BODY' }, { status: 400 });
  }

  const inputValues = payload.values as Record<string, unknown>;
  const clearInput = 'clear' in payload ? payload.clear as string[] : [];
  const allowedFields = new Set(integrationSettingNames);
  if (
    Object.keys(inputValues).some((name) =>
      !allowedFields.has(name as IntegrationSettingName) ||
      isInternalIntegrationSetting(name as IntegrationSettingName),
    ) ||
    clearInput.some((name) =>
      !isIntegrationSettingName(name) ||
      isInternalIntegrationSetting(name),
    )
  ) {
    return NextResponse.json({ error: 'UNKNOWN_SETTING' }, { status: 400 });
  }

  const updates: IntegrationSettingValues = {};
  for (const [rawName, rawValue] of Object.entries(inputValues)) {
    if (typeof rawValue !== 'string' || rawValue.length > 4096) {
      return NextResponse.json({ error: 'INVALID_SETTING_VALUE' }, { status: 400 });
    }
    const name = rawName as IntegrationSettingName;
    const value = rawValue.trim();
    if (!value) continue;

    if (isIntegrationSettingEnvironmentOverridden(name)) {
      return NextResponse.json(
        { error: 'SETTING_OVERRIDDEN_BY_ENVIRONMENT', setting: name },
        { status: 409 },
      );
    }

    if (name === 'whatsappProvider' && value !== 'fonnte' && value !== 'openwa') {
      return NextResponse.json({ error: 'INVALID_WHATSAPP_PROVIDER' }, { status: 400 });
    }
    if (name === 'digiflazzMode' && value !== 'sandbox' && value !== 'production') {
      return NextResponse.json({ error: 'INVALID_DIGIFLAZZ_MODE' }, { status: 400 });
    }
    if (
      name === 'enableRealTransactions' &&
      value !== 'true' &&
      value !== 'false'
    ) {
      return NextResponse.json({ error: 'INVALID_TRANSACTION_FLAG' }, { status: 400 });
    }
    if (
      name === 'digiflazzAutoSyncIntervalDays' &&
      !['7', '14', '30'].includes(value)
    ) {
      return NextResponse.json({ error: 'INVALID_AUTO_SYNC_INTERVAL' }, { status: 400 });
    }
    if (name === 'tokovoucherMode' && value !== 'sandbox' && value !== 'production') {
      return NextResponse.json({ error: 'INVALID_TOKOVOUCHER_MODE' }, { status: 400 });
    }
    if (
      name === 'tokovoucherEnableRealTransactions' &&
      value !== 'true' &&
      value !== 'false'
    ) {
      return NextResponse.json({ error: 'INVALID_TRANSACTION_FLAG' }, { status: 400 });
    }
    if (
      name === 'tokovoucherAutoSyncEnabled' &&
      value !== 'true' &&
      value !== 'false'
    ) {
      return NextResponse.json({ error: 'INVALID_TRANSACTION_FLAG' }, { status: 400 });
    }
    if (
      name === 'tokovoucherAutoSyncIntervalDays' &&
      !['7', '14', '30'].includes(value)
    ) {
      return NextResponse.json({ error: 'INVALID_AUTO_SYNC_INTERVAL' }, { status: 400 });
    }
    if (
      (name === 'digiflazzEnabled' || name === 'tokovoucherEnabled') &&
      value !== 'true' &&
      value !== 'false'
    ) {
      return NextResponse.json({ error: 'INVALID_VENDOR_SWITCH' }, { status: 400 });
    }
    if (
      (name === 'digiflazzShowProducts' || name === 'tokovoucherShowProducts') &&
      value !== 'true' &&
      value !== 'false'
    ) {
      return NextResponse.json({ error: 'INVALID_VENDOR_SWITCH' }, { status: 400 });
    }
    if (
      (name === 'digiflazzWebhookSecret' || name === 'tokovoucherWebhookSecret') &&
      value.length < 16
    ) {
      return NextResponse.json({ error: 'WEBHOOK_SECRET_TOO_SHORT' }, { status: 400 });
    }
    if (
      (name === 'qrislyMode' && value !== 'sandbox' && value !== 'production') ||
      ((name === 'qrislyEnabled') && value !== 'true' && value !== 'false')
    ) {
      return NextResponse.json({ error: 'INVALID_QRISLY_SETTING' }, { status: 400 });
    }
    if (
      name === 'activePaymentGateway' &&
      !['none', 'qrisly'].includes(value)
    ) {
      return NextResponse.json(
        { error: 'PAYMENT_GATEWAY_NOT_IMPLEMENTED' },
        { status: 400 },
      );
    }
    if (name === 'openwaApiUrl') {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return NextResponse.json({ error: 'INVALID_OPENWA_URL' }, { status: 400 });
      }
      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        return NextResponse.json({ error: 'INVALID_OPENWA_URL' }, { status: 400 });
      }
    }

    updates[name] = value;
  }

  const clear = [...new Set(clearInput)] as IntegrationSettingName[];
  for (const name of clear) {
    if (name in updates) {
      return NextResponse.json(
        { error: 'SETTING_CANNOT_BE_UPDATED_AND_CLEARED' },
        { status: 400 },
      );
    }
    if (isIntegrationSettingEnvironmentOverridden(name)) {
      return NextResponse.json(
        { error: 'SETTING_OVERRIDDEN_BY_ENVIRONMENT', setting: name },
        { status: 409 },
      );
    }
  }

  try {
    const current = await getIntegrationConfig();
    const effective = { ...current.values, ...updates };
    for (const name of clear) delete effective[name];
    if (effective.enableRealTransactions === 'true') {
      if (
        effective.digiflazzMode !== 'production' ||
        !effective.digiflazzUsername ||
        !effective.digiflazzApiKey
      ) {
        return NextResponse.json(
          { error: 'PRODUCTION_REQUIRES_DIGIFLAZZ_CREDENTIALS' },
          { status: 400 },
        );
      }
    }
    if (effective.qrislyEnabled === 'true') {
      if (!effective.qrislyApiKey || !effective.qrislyQrisId) {
        return NextResponse.json(
          { error: 'QRISLY_REQUIRES_CREDENTIALS_AND_QRIS_ID' },
          { status: 400 },
        );
      }
    }
    if (
      effective.activePaymentGateway === 'qrisly' &&
      (!effective.qrislyApiKey || !effective.qrislyQrisId)
    ) {
      return NextResponse.json(
        { error: 'QRISLY_CHECKOUT_REQUIRES_CREDENTIALS' },
        { status: 400 },
      );
    }

    await saveIntegrationSettings(session.user.id, updates, clear);
    const [config, autoSync, tokoVoucherAutoSync] = await Promise.all([
      getIntegrationConfig(),
      getDigiflazzAutoSyncConfig(),
      getTokoVoucherAutoSyncConfig(),
    ]);
    return NextResponse.json(snapshotResponse(config, autoSync, tokoVoucherAutoSync, resolveWebhookBaseUrl()));
  } catch (error) {
    console.error(
      '[ADMIN_INTEGRATION_SETTINGS_SAVE_FAILED]',
      error instanceof Error ? error.message : 'Unknown settings error',
    );
    return NextResponse.json(
      { error: 'INTEGRATION_SETTINGS_COULD_NOT_BE_SAVED' },
      { status: 503 },
    );
  }
}
