import { NextRequest, NextResponse } from 'next/server';
import { testDigiflazzTransaction } from '@/lib/digiflazz';
import { getAuth } from '@/lib/server/auth';
import { getDigiflazzConfig } from '@/lib/server/integration-settings';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4_096) {
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
    Object.keys(payload).some(
      (key) => !['buyerSkuCode', 'customerNo', 'refId'].includes(key),
    )
  ) {
    return NextResponse.json({ error: 'INVALID_TEST_REQUEST' }, { status: 400 });
  }

  const { buyerSkuCode, customerNo, refId } = payload as Record<string, unknown>;
  if (
    typeof buyerSkuCode !== 'string' ||
    !buyerSkuCode.trim() ||
    buyerSkuCode.length > 100 ||
    typeof customerNo !== 'string' ||
    !customerNo.trim() ||
    customerNo.length > 100 ||
    typeof refId !== 'string' ||
    !refId.trim() ||
    refId.length > 100
  ) {
    return NextResponse.json({ error: 'INVALID_TEST_REQUEST' }, { status: 400 });
  }

  try {
    const config = await getDigiflazzConfig();
    const username = config.username;
    const apiKey = config.apiKey;
    if (!username || !apiKey) {
      return NextResponse.json(
        { error: 'DIGIFLAZZ_CREDENTIALS_NOT_CONFIGURED' },
        { status: 400 },
      );
    }

    const result = await testDigiflazzTransaction(
      {
        username,
        apiKey,
        mode: config.mode === 'production' ? 'production' : 'sandbox',
      },
      {
        buyerSkuCode: buyerSkuCode.trim(),
        customerNo: customerNo.trim(),
        refId: refId.trim(),
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      '[ADMIN_DIGIFLAZZ_TEST_FAILED]',
      error instanceof Error ? error.message : 'Unknown Digiflazz error',
    );
    return NextResponse.json(
      { error: 'DIGIFLAZZ_TEST_UNAVAILABLE' },
      { status: 502 },
    );
  }
}
