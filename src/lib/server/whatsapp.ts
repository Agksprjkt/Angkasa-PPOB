import 'server-only';
import { createOpenWaTextRequest } from './openwa-request';
import { getWhatsAppConfig } from './integration-settings';
import { getStoreSettings } from './store-settings';

type WhatsAppProvider = 'fonnte' | 'openwa';
type JsonRecord = Record<string, unknown>;

function requiredValue(name: string, value: string | undefined): string {
  const resolved = value?.trim();
  if (!resolved) {
    throw new Error(`Configure ${name} in the server environment or admin dashboard`);
  }
  return resolved;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function assertProviderAccepted(response: Response, provider: string) {
  if (!response.ok) {
    throw new Error(
      `${provider} WhatsApp provider returned HTTP ${response.status}`,
    );
  }

  const result: unknown = await response.json();
  if (isRecord(result) && result.status === false) {
    throw new Error(`${provider} WhatsApp provider rejected the OTP message`);
  }
  if (isRecord(result) && result.success === false) {
    throw new Error(`${provider} WhatsApp provider rejected the OTP message`);
  }
}

export async function sendWhatsAppMessage(phoneNumber: string, message: string) {
  const config = await getWhatsAppConfig();
  const provider = config.provider as WhatsAppProvider | undefined;
  const signal = AbortSignal.timeout(10_000);

  if (provider === 'fonnte') {
    const body = new FormData();
    body.set('target', phoneNumber.replace(/^\+/, ''));
    body.set('countryCode', '0');
    body.set('message', message);

    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: requiredValue('FONNTE_TOKEN', config.fonnteToken),
      },
      body,
      signal,
    });

    await assertProviderAccepted(response, 'Fonnte');
    return;
  }

  if (provider === 'openwa') {
    const request = createOpenWaTextRequest(phoneNumber, message, {
      apiUrl: config.openwaApiUrl,
      apiKey: config.openwaApiKey,
      sessionId: config.openwaSessionId,
    });
    const response = await fetch(request.url, {
      ...request.init,
      signal,
    });

    await assertProviderAccepted(response, 'OpenWA');
    return;
  }

  throw new Error(
    'Set WHATSAPP_PROVIDER to either "fonnte" or "openwa" before sending WhatsApp messages',
  );
}

export async function sendWhatsAppOtp(phoneNumber: string, code: string) {
  const storeSettings = await getStoreSettings();
  const message = `Kode verifikasi ${storeSettings.storeName}: ${code}. Berlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.`;
  await sendWhatsAppMessage(phoneNumber, message);
}

export async function sendWhatsAppRecoveryOtp(
  purpose: 'password' | 'pin',
  phoneNumber: string,
  code: string,
) {
  const storeSettings = await getStoreSettings();
  const label = purpose === 'password' ? 'kata sandi' : 'PIN transaksi';
  const message = `Kode reset ${label} ${storeSettings.storeName}: ${code}. Berlaku 5 menit. Abaikan pesan ini bila Anda tidak memintanya.`;
  await sendWhatsAppMessage(phoneNumber, message);
}