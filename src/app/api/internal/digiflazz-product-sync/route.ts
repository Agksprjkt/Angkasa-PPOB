import { NextRequest, NextResponse } from 'next/server';
import { isInternalJobAuthorized } from '@/lib/server/internal-job-auth';
import { runDigiflazzProductSync } from '@/lib/server/digiflazz-product-sync';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = process.env.PAYMENT_RECONCILER_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    return NextResponse.json(
      { error: 'PAYMENT_RECONCILER_NOT_CONFIGURED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!isInternalJobAuthorized(request)) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const outcome = await runDigiflazzProductSync('scheduled');
    if ('skipped' in outcome) {
      return NextResponse.json(
        { skipped: outcome.skipped },
        { status: outcome.skipped === 'SYNC_ALREADY_RUNNING' ? 202 : 200 },
      );
    }
    return NextResponse.json(
      { result: outcome.result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      '[DIGIFLAZZ_SCHEDULED_SYNC_FAILED]',
      error instanceof Error ? error.message : 'Unknown sync error',
    );
    return NextResponse.json(
      { error: 'DIGIFLAZZ_SCHEDULED_SYNC_FAILED' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
