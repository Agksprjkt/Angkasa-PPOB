import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { paymentMethods } from '@/lib/server/db/schema';
import { uploadedImageExists } from '@/lib/server/uploaded-image';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function presentMethod(method: typeof paymentMethods.$inferSelect) {
  return {
    id: method.id,
    type: method.type,
    label: method.label,
    bankName: method.bankName,
    accountNumber: method.accountNumber,
    accountHolder: method.accountHolder,
    qrImageFile: method.qrImageFile,
    qrImageUrl: method.qrImageFile
      ? `/api/payment-assets/${encodeURIComponent(method.qrImageFile)}`
      : null,
    instructions: method.instructions,
    enabled: method.enabled,
  };
}

export async function GET(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const methods = await getDatabase()
    .select()
    .from(paymentMethods)
    .orderBy(paymentMethods.createdAt);
  return NextResponse.json({ methods: methods.map(presentMethod) });
}

export async function PUT(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > 65_536) {
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
    Object.keys(payload).length !== 1 ||
    !Array.isArray(payload.methods) ||
    payload.methods.length > 20
  ) {
    return NextResponse.json({ error: 'INVALID_PAYMENT_METHODS' }, { status: 400 });
  }

  const ids = new Set<string>();
  const methods: Array<typeof paymentMethods.$inferInsert> = [];
  for (const raw of payload.methods) {
    if (!isRecord(raw)) {
      return NextResponse.json({ error: 'INVALID_PAYMENT_METHOD' }, { status: 400 });
    }
    const {
      id, type, label, bankName, accountNumber, accountHolder,
      qrImageFile, instructions, enabled,
    } = raw;
    if (
      typeof id !== 'string' ||
      !/^[\da-f-]{36}$/i.test(id) ||
      ids.has(id) ||
      (type !== 'bank_transfer' && type !== 'ewallet' && type !== 'static_qris') ||
      typeof label !== 'string' || !label.trim() || label.trim().length > 80 ||
      typeof instructions !== 'string' || instructions.length > 500 ||
      typeof enabled !== 'boolean'
    ) {
      return NextResponse.json({ error: 'INVALID_PAYMENT_METHOD' }, { status: 400 });
    }
    ids.add(id);

    if (type === 'bank_transfer' || type === 'ewallet') {
      if (
        typeof bankName !== 'string' || !bankName.trim() || bankName.trim().length > 80 ||
        typeof accountNumber !== 'string' || !accountNumber.trim() || accountNumber.trim().length > 50 ||
        typeof accountHolder !== 'string' || !accountHolder.trim() || accountHolder.trim().length > 100
      ) {
        return NextResponse.json({ error: 'INVALID_BANK_DETAILS' }, { status: 400 });
      }
      methods.push({
        id,
        type,
        label: label.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountHolder: accountHolder.trim(),
        qrImageFile: null,
        instructions: instructions.trim(),
        enabled,
      });
    } else {
      if (typeof qrImageFile !== 'string') {
        return NextResponse.json({ error: 'QR_IMAGE_REQUIRED' }, { status: 400 });
      }
      if (!(await uploadedImageExists('payment-methods', qrImageFile))) {
        return NextResponse.json({ error: 'QR_IMAGE_NOT_FOUND' }, { status: 400 });
      }
      methods.push({
        id,
        type,
        label: label.trim(),
        bankName: null,
        accountNumber: null,
        accountHolder: null,
        qrImageFile,
        instructions: instructions.trim(),
        enabled,
      });
    }
  }

  try {
    const db = getDatabase();
    await db.transaction(async (tx) => {
      for (const method of methods) {
        await tx
          .insert(paymentMethods)
          .values(method)
          .onConflictDoUpdate({
            target: paymentMethods.id,
            set: { ...method, updatedAt: new Date() },
          });
      }
    });
    const saved = await db.select().from(paymentMethods).orderBy(paymentMethods.createdAt);
    return NextResponse.json({ methods: saved.map(presentMethod) });
  } catch (error) {
    console.error(
      '[ADMIN_PAYMENT_METHODS_SAVE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'PAYMENT_METHODS_SAVE_FAILED' }, { status: 503 });
  }
}

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
    const [removed] = await getDatabase()
      .delete(paymentMethods)
      .where(eq(paymentMethods.id, id))
      .returning({ id: paymentMethods.id });
    if (!removed) {
      return NextResponse.json({ error: 'PAYMENT_METHOD_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ id: removed.id });
  } catch (error) {
    console.error(
      '[ADMIN_PAYMENT_METHOD_DELETE_FAILED]',
      error instanceof Error ? error.message : 'Unknown database error',
    );
    return NextResponse.json({ error: 'PAYMENT_METHOD_DELETE_FAILED' }, { status: 503 });
  }
}
