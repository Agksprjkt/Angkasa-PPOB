import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { paymentMethods } from '@/lib/server/db/schema';
import { deleteUploadedImage } from '@/lib/server/uploaded-image';

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id || !/^[\da-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'INVALID_PAYMENT_METHOD_ID' }, { status: 400 });
  }

  try {
    const [existing] = await getDatabase()
      .select({ qrImageFile: paymentMethods.qrImageFile })
      .from(paymentMethods)
      .where(eq(paymentMethods.id, id))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: 'PAYMENT_METHOD_NOT_FOUND' }, { status: 404 });
    }
    await getDatabase()
      .update(paymentMethods)
      .set({ qrImageFile: null, updatedAt: new Date() })
      .where(eq(paymentMethods.id, id));
    if (existing.qrImageFile) {
      await deleteUploadedImage('payment-methods', existing.qrImageFile);
    }
    return NextResponse.json({ qrImageFile: null, qrImageUrl: null });
  } catch (error) {
    console.error(
      '[ADMIN_PAYMENT_QR_DELETE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'PAYMENT_QR_DELETE_FAILED' }, { status: 503 });
  }
}
