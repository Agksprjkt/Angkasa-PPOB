import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'DIGIFLAZZ_WEBHOOK_NOT_CONFIGURED',
      message: 'No verified Digiflazz callback handler is configured.',
    },
    { status: 503 },
  );
}
