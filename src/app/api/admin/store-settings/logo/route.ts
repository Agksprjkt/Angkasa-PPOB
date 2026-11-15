import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { storeSettings } from '@/lib/server/db/schema';
import { getStoreSettings } from '@/lib/server/store-settings';
import { saveUploadedImage } from '@/lib/server/uploaded-image';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'INVALID_FORM_DATA' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size > 1_000_000) {
    return NextResponse.json({ error: 'LOGO_REQUIRED_OR_TOO_LARGE' }, { status: 400 });
  }
  try {
    const { filename } = await saveUploadedImage(file, 'store-profile', randomUUID());
    await getStoreSettings();
    await getDatabase()
      .update(storeSettings)
      .set({ logoFile: filename, updatedAt: new Date() })
      .where(eq(storeSettings.id, 'default'));
    return NextResponse.json({ logoUrl: `/api/store-assets/${encodeURIComponent(filename)}` });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'LOGO_UPLOAD_FAILED';
    const status = code === 'IMAGE_SIZE_INVALID' ? 413 : code.startsWith('IMAGE_') ? 400 : 503;
    if (status === 503) console.error('[ADMIN_STORE_LOGO_UPLOAD_FAILED]', error);
    return NextResponse.json({ error: code }, { status });
  }
}
