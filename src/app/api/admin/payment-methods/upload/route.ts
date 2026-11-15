import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { saveUploadedImage } from '@/lib/server/uploaded-image';

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
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'IMAGE_REQUIRED' }, { status: 400 });
  }
  try {
    const image = await saveUploadedImage(file, 'payment-methods');
    return NextResponse.json({
      qrImageFile: image.filename,
      qrImageUrl: `/api/payment-assets/${encodeURIComponent(image.filename)}`,
    }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'IMAGE_UPLOAD_FAILED';
    const status = code === 'IMAGE_SIZE_INVALID' ? 413 : code.startsWith('IMAGE_') ? 400 : 503;
    if (status === 503) {
      console.error('[ADMIN_PAYMENT_IMAGE_UPLOAD_FAILED]', code);
    }
    return NextResponse.json({ error: code }, { status });
  }
}
