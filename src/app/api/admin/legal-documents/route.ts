import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { isLegalDocumentId } from '@/lib/legal-content';
import { listLegalDocuments, updateLegalDocument } from '@/lib/server/legal-documents';

export const runtime = 'nodejs';

const maxTitleLength = 120;
const maxContentLength = 40_000;

async function isAdmin(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.role === 'admin' ? session.user.id : null;
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  try {
    return NextResponse.json({ documents: await listLegalDocuments() });
  } catch (error) {
    console.error('[ADMIN_LEGAL_DOCUMENTS_GET_FAILED]', error);
    return NextResponse.json({ error: 'LEGAL_DOCUMENTS_UNAVAILABLE' }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const adminId = await isAdmin(request);
  if (!adminId) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > maxContentLength + 4096) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'INVALID_LEGAL_DOCUMENT' }, { status: 400 });
  }

  const { id, title, content } = payload as Record<string, unknown>;
  if (
    typeof id !== 'string' ||
    !isLegalDocumentId(id) ||
    typeof title !== 'string' ||
    !title.trim() ||
    title.trim().length > maxTitleLength ||
    typeof content !== 'string' ||
    content.length > maxContentLength
  ) {
    return NextResponse.json({ error: 'INVALID_LEGAL_DOCUMENT' }, { status: 400 });
  }

  try {
    const document = await updateLegalDocument(id, {
      title: title.trim(),
      content,
      updatedBy: adminId,
    });
    if (!document) {
      return NextResponse.json({ error: 'LEGAL_DOCUMENT_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ document });
  } catch (error) {
    console.error('[ADMIN_LEGAL_DOCUMENT_SAVE_FAILED]', error);
    return NextResponse.json({ error: 'LEGAL_DOCUMENT_SAVE_FAILED' }, { status: 503 });
  }
}
