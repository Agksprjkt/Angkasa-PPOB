import { NextRequest, NextResponse } from 'next/server';
import { fetchTokoVoucherProducts } from '@/lib/tokovoucher';
import { getAuth } from '@/lib/server/auth';
import { getTokoVoucherConfig } from '@/lib/server/integration-settings';
import { runTokoVoucherProductSync } from '@/lib/server/tokovoucher-product-sync';

export const runtime = 'nodejs';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function getConfig() {
  const config = await getTokoVoucherConfig();
  if (!config.memberCode || !config.secret) {
    throw new Error('TOKOVOUCHER_CREDENTIALS_NOT_CONFIGURED');
  }
  return {
    memberCode: config.memberCode,
    secret: config.secret,
    defaultSignature: config.defaultSignature,
    mode: config.mode,
  };
}

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') return noStore({ error: 'FORBIDDEN' }, 403);

  try {
    const config = await getConfig();
    const result = await fetchTokoVoucherProducts(config);
    return noStore({ total: result.total, products: result.products.slice(0, 200) });
  } catch (error) {
    if (error instanceof Error && error.message === 'TOKOVOUCHER_CREDENTIALS_NOT_CONFIGURED') {
      return noStore({ error: error.message }, 400);
    }
    const detail = error instanceof Error
      ? error.message
      : 'TokoVoucher gagal memberikan daftar produk.';
    console.error('[ADMIN_TOKOVOUCHER_PRICE_LIST_FAILED]', detail);
    return noStore({ error: 'TOKOVOUCHER_PRICE_LIST_UNAVAILABLE', detail }, 502);
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') return noStore({ error: 'FORBIDDEN' }, 403);

  try {
    const outcome = await runTokoVoucherProductSync('manual');
    if ('skipped' in outcome) return noStore({ error: outcome.skipped }, 409);
    return noStore(outcome.result);
  } catch (error) {
    if (error instanceof Error && error.message === 'TOKOVOUCHER_CREDENTIALS_NOT_CONFIGURED') {
      return noStore({ error: error.message }, 400);
    }
    const detail = error instanceof Error
      ? error.message
      : 'Sinkronisasi produk TokoVoucher gagal.';
    console.error('[ADMIN_TOKOVOUCHER_PRODUCT_SYNC_FAILED]', detail);
    return noStore({ error: 'TOKOVOUCHER_PRODUCT_SYNC_FAILED', detail }, 502);
  }
}
