import { NextRequest, NextResponse } from 'next/server';
import { checkDigiflazzBalance } from '@/lib/digiflazz';
import { checkTokoVoucherBalance } from '@/lib/tokovoucher';
import { getAuth } from '@/lib/server/auth';
import { getDigiflazzConfig, getTokoVoucherConfig } from '@/lib/server/integration-settings';

export const runtime = 'nodejs';

type ProviderBalance = {
  id: string;
  name: string;
  mode: string;
  balance: number | null;
  status: 'available' | 'unavailable';
  error?: string;
  checkedAt: string;
  fetchedAt?: string;
};

function readDigiflazzBalance(response: unknown): number {
  if (typeof response !== 'object' || response === null || Array.isArray(response)) {
    throw new Error('Respons saldo Digiflazz tidak valid.');
  }
  const root = response as Record<string, unknown>;
  const data = typeof root.data === 'object' && root.data !== null && !Array.isArray(root.data)
    ? root.data as Record<string, unknown>
    : root;
  const value = data.deposit;
  const balance = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(balance) || balance < 0) {
    throw new Error('Respons saldo Digiflazz tidak berisi nominal yang valid.');
  }
  return balance;
}

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  try {
    const config = await getDigiflazzConfig();
    const tokoVoucherConfig = await getTokoVoucherConfig();
    const providers: ProviderBalance[] = [];
    if (config.username && config.apiKey) {
      try {
        const response = await checkDigiflazzBalance({
          username: config.username,
          apiKey: config.apiKey,
          mode: config.mode === 'production' ? 'production' : 'sandbox',
        });
        const balance = readDigiflazzBalance(response);
        const checkedAt = new Date().toISOString();
        providers.push({
          id: 'digiflazz',
          name: 'Digiflazz',
          mode: config.mode === 'production' ? 'Produksi' : 'Sandbox',
          balance,
          status: 'available',
          checkedAt,
          fetchedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(
          '[ADMIN_DIGIFLAZZ_BALANCE_FAILED]',
          error instanceof Error ? error.message : 'Unknown provider error',
        );
        const checkedAt = new Date().toISOString();
        providers.push({
          id: 'digiflazz',
          name: 'Digiflazz',
          mode: config.mode === 'production' ? 'Produksi' : 'Sandbox',
          balance: null,
          status: 'unavailable',
          error: 'Saldo belum dapat diambil. Periksa koneksi dan kredensial H2H.',
          checkedAt,
        });
      }
    }

    if (tokoVoucherConfig.memberCode && tokoVoucherConfig.secret) {
      try {
        const { balance } = await checkTokoVoucherBalance(tokoVoucherConfig);
        providers.push({
          id: 'tokovoucher',
          name: 'TokoVoucher',
          mode: tokoVoucherConfig.mode === 'production' ? 'Produksi' : 'Sandbox',
          balance,
          status: 'available',
          checkedAt: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(
          '[ADMIN_TOKOVOUCHER_BALANCE_FAILED]',
          error instanceof Error ? error.message : 'Unknown provider error',
        );
        providers.push({
          id: 'tokovoucher',
          name: 'TokoVoucher',
          mode: tokoVoucherConfig.mode === 'production' ? 'Produksi' : 'Sandbox',
          balance: null,
          status: 'unavailable',
          error: 'Saldo belum dapat diambil. Periksa koneksi dan kredensial TokoVoucher.',
          checkedAt: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({ providers, checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error(
      '[ADMIN_PROVIDER_BALANCES_FAILED]',
      error instanceof Error ? error.message : 'Unknown configuration error',
    );
    return NextResponse.json({ error: 'PROVIDER_BALANCES_UNAVAILABLE' }, { status: 503 });
  }
}