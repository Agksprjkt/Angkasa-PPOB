import { NextRequest, NextResponse } from 'next/server';
import { validatePlnMeterNumber } from '@/lib/order-input-validation';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  if (Number(request.headers.get('content-length') ?? 0) > 1_024) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  if (
    !isRecord(payload) ||
    Object.keys(payload).some((key) => key !== 'meterNumber')
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST_BODY' }, { status: 400 });
  }

  const meterNumber = payload.meterNumber;
  if (typeof meterNumber !== 'string' || meterNumber.length > 32) {
    return NextResponse.json({ error: 'INVALID_PLN_METER_NUMBER' }, { status: 400 });
  }

  const valid = validatePlnMeterNumber(meterNumber);
  return NextResponse.json(
    valid ? { valid: true } : { valid: false, error: 'INVALID_PLN_METER_NUMBER' },
    { status: valid ? 200 : 400, headers: { 'Cache-Control': 'no-store' } },
  );
}
