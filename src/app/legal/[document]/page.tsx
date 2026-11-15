import LegalDocumentPage from '@/components/LegalDocumentPage';

export default async function LegalDocumentRoute({
  params,
}: {
  params: Promise<{ document: string }>;
}) {
  const { document } = await params;
  return <LegalDocumentPage documentId={document} />;
}
