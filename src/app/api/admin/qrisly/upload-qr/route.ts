import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getQrislyConfig } from '@/lib/server/integration-settings';
import { uploadQrislyMerchantQr } from '@/lib/server/qrisly';
import { validateUploadedImage } from '@/lib/server/uploaded-image';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (session?.user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > 5 * 1024 * 1024 + 16_384) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'INVALID_FORM_DATA' }, { status: 400 });
  }
  const name = form.get('name');
  const file = form.get('file');
  if (
    typeof name !== 'string' || !name.trim() || name.trim().length > 100 ||
    !(file instanceof File)
  ) {
    return NextResponse.json({ error: 'INVALID_QRISLY_UPLOAD' }, { status: 400 });
  }

  try {
    await validateUploadedImage(file);
    const config = await getQrislyConfig();
    if (!config.apiKey) {
      return NextResponse.json({ error: 'QRISLY_API_KEY_NOT_CONFIGURED' }, { status: 400 });
    }
    const qrisId = await uploadQrislyMerchantQr(
      { apiKey: config.apiKey, mode: config.mode },
      name.trim(),
      file,
    );
    return NextResponse.json({ qrisId });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'QRISLY_UPLOAD_FAILED';
    const status = code === 'IMAGE_SIZE_INVALID'
      ? 413
      : code.startsWith('IMAGE_') || code === 'QRISLY_API_KEY_NOT_CONFIGURED'
        ? 400
        : 502;
    if (status === 502) {
      console.error('[ADMIN_QRISLY_QR_UPLOAD_FAILED]', code);
    }
    return NextResponse.json(
      { error: code },
      { status },
    );
  }
}
