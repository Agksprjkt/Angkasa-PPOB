import 'server-only';

import { eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/server/db/client';
import { legalDocuments } from '@/lib/server/db/schema';
import {
  defaultLegalContent,
  isLegalDocumentId,
  legalDocumentIds,
  legalDocumentLabels,
  type LegalDocumentId,
} from '@/lib/legal-content';
import { getStoreSettings } from '@/lib/server/store-settings';

export type LegalDocument = {
  id: LegalDocumentId;
  title: string;
  content: string;
  updatedAt: Date | null;
};

async function seedDefaults() {
  const db = getDatabase();
  const existing = await db
    .select({ id: legalDocuments.id })
    .from(legalDocuments);
  const known = new Set(existing.map((row) => row.id));
  const missing = legalDocumentIds.filter((id) => !known.has(id));
  if (!missing.length) return;

  const settings = await getStoreSettings();
  await db
    .insert(legalDocuments)
    .values(missing.map((id) => ({
      id,
      title: legalDocumentLabels[id],
      content: defaultLegalContent(id, settings.storeName),
    })))
    .onConflictDoNothing({ target: legalDocuments.id });
}

export async function listLegalDocuments(): Promise<LegalDocument[]> {
  await seedDefaults();
  const rows = await getDatabase().select().from(legalDocuments);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return legalDocumentIds.map((id) => {
    const row = byId.get(id);
    return {
      id,
      title: row?.title || legalDocumentLabels[id],
      content: row?.content ?? '',
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function getLegalDocument(id: string): Promise<LegalDocument | null> {
  if (!isLegalDocumentId(id)) return null;
  const documents = await listLegalDocuments();
  return documents.find((document) => document.id === id) ?? null;
}

export async function updateLegalDocument(
  id: string,
  input: { title: string; content: string; updatedBy?: string | null },
): Promise<LegalDocument | null> {
  if (!isLegalDocumentId(id)) return null;
  await seedDefaults();
  await getDatabase()
    .update(legalDocuments)
    .set({
      title: input.title,
      content: input.content,
      updatedBy: input.updatedBy ?? null,
      updatedAt: new Date(),
    })
    .where(eq(legalDocuments.id, id));
  return getLegalDocument(id);
}
