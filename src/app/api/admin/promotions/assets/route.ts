import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isAdministrator } from '@/lib/server/authorization';
import { deleteUploadedImage, saveUploadedImage } from '@/lib/server/uploaded-image';

export const runtime = 'nodejs';

const assetPrefix = '/api/promotion-assets/';

// Banner images are stored like the other uploads, but the URL is handed back
// instead of written to a row: the banner form saves it as imageUrl on submit.
export async function POST(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > 5_500_000) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'INVALID_FORM_DATA' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size > 5_000_000) {
    return NextResponse.json({ error: 'BANNER_IMAGE_REQUIRED_OR_TOO_LARGE' }, { status: 400 });
  }

  try {
    const { filename } = await saveUploadedImage(file, 'promotions', randomUUID());
    return NextResponse.json({ imageUrl: `${assetPrefix}${encodeURIComponent(filename)}` });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'IMAGE_UPLOAD_FAILED';
    const status = code === 'IMAGE_SIZE_INVALID' ? 413 : code.startsWith('IMAGE_') ? 400 : 503;
    if (status === 503) console.error('[ADMIN_BANNER_IMAGE_UPLOAD_FAILED]', code);
    return NextResponse.json({ error: code }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const url = request.nextUrl.searchParams.get('url');
  // Only files this route produced may be deleted; an external image URL is not
  // ours to remove.
  if (!url || !url.startsWith(assetPrefix)) {
    return NextResponse.json({ error: 'INVALID_BANNER_IMAGE_URL' }, { status: 400 });
  }
  const filename = decodeURIComponent(url.slice(assetPrefix.length));
  try {
    await deleteUploadedImage('promotions', filename);
    return NextResponse.json({ imageUrl: null });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'IMAGE_DELETE_FAILED';
    if (code === 'IMAGE_NAME_INVALID') {
      return NextResponse.json({ error: 'INVALID_BANNER_IMAGE_URL' }, { status: 400 });
    }
    console.error('[ADMIN_BANNER_IMAGE_DELETE_FAILED]', code);
    return NextResponse.json({ error: 'IMAGE_DELETE_FAILED' }, { status: 503 });
  }
}
