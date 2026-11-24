import { NextResponse } from 'next/server';
import { listLegalDocuments } from '@/lib/server/legal-documents';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const documents = await listLegalDocuments();
    return NextResponse.json(
      {
        documents: documents.map(({ id, title, content, updatedAt }) => ({
          id,
          title,
          content,
          updatedAt,
        })),
      },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    console.error('[LEGAL_DOCUMENTS_GET_FAILED]', error);
    return NextResponse.json({ error: 'LEGAL_DOCUMENTS_UNAVAILABLE' }, { status: 503 });
  }
}
