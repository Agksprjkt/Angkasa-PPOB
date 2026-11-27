import { NextRequest, NextResponse } from 'next/server';
import { fetchDigiflazzPriceList } from '@/lib/digiflazz';
import { getAuth } from '@/lib/server/auth';
import { getDigiflazzConfig } from '@/lib/server/integration-settings';
import { invalidateCatalog } from '@/lib/server/catalog-cache';
import {
  runDigiflazzProductSync,
  syncDigiflazzPostpaidProducts,
} from '@/lib/server/digiflazz-product-sync';

export const runtime = 'nodejs';

async function getConfig() {
  const config = await getDigiflazzConfig();
  if (!config.username || !config.apiKey) {
    throw new Error('DIGIFLAZZ_CREDENTIALS_NOT_CONFIGURED');
  }
  return {
    username: config.username,
    apiKey: config.apiKey,
    mode: config.mode === 'production' ? 'production' as const : 'sandbox' as const,
  };
}

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  try {
    const config = await getConfig();
    const result = await fetchDigiflazzPriceList(config);
    return NextResponse.json({ total: result.total, products: result.products.slice(0, 200) });
  } catch (error) {
    if (error instanceof Error && error.message === 'DIGIFLAZZ_CREDENTIALS_NOT_CONFIGURED') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const detail = error instanceof Error
      ? error.message
      : 'Digiflazz gagal memberikan daftar produk.';
    console.error(
      '[ADMIN_DIGIFLAZZ_PRICE_LIST_FAILED]',
      detail,
    );
    return NextResponse.json(
      { error: 'DIGIFLAZZ_PRICE_LIST_UNAVAILABLE', detail },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // ?scope=pasca syncs the postpaid price list instead of the prepaid one.
  const scope = request.nextUrl.searchParams.get('scope');
  try {
    if (scope === 'pasca') {
      const result = await syncDigiflazzPostpaidProducts();
      await invalidateCatalog();
      return NextResponse.json(result);
    }
    const outcome = await runDigiflazzProductSync('manual');
    if ('skipped' in outcome) {
      return NextResponse.json({ error: outcome.skipped }, { status: 409 });
    }
    return NextResponse.json(outcome.result);
  } catch (error) {
    if (error instanceof Error && error.message === 'DIGIFLAZZ_CREDENTIALS_NOT_CONFIGURED') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const detail = error instanceof Error
      ? error.message
      : 'Sinkronisasi produk Digiflazz gagal.';
    console.error(
      '[ADMIN_DIGIFLAZZ_PRODUCT_SYNC_FAILED]',
      detail,
    );
    return NextResponse.json(
      { error: 'DIGIFLAZZ_PRODUCT_SYNC_FAILED', detail },
      { status: 502 },
    );
  }
}
