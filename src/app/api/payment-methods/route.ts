import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { paymentMethods } from '@/lib/server/db/schema';
import { getActivePaymentGateway, getQrislyConfig } from '@/lib/server/integration-settings';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const [methods, qrisly, activeGateway] = await Promise.all([
    getDatabase()
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.enabled, true))
      .orderBy(paymentMethods.createdAt),
    getQrislyConfig(),
    getActivePaymentGateway(),
  ]);
  return NextResponse.json({
    methods: methods.map((method) => ({
      id: method.id,
      type: method.type,
      label: method.label,
      bankName: method.bankName,
      accountNumber: method.accountNumber,
      accountHolder: method.accountHolder,
      qrImageUrl: method.qrImageFile
        ? `/api/payment-assets/${encodeURIComponent(method.qrImageFile)}`
        : null,
      instructions: method.instructions,
      enabled: method.enabled,
    })),
    qrislyEnabled:
      activeGateway === 'qrisly' &&
      qrisly.enabled &&
      Boolean(qrisly.apiKey && qrisly.qrisId),
  });
}
