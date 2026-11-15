import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'PAYMENT_WEBHOOK_NOT_CONFIGURED',
      message: 'No verified payment gateway callback handler is configured.',
    },
    { status: 503 },
  );
}
