'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePPOB } from '@/context/PPOBContext';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/crystal-loader';
import { FileText, Save } from 'lucide-react';
import {
  legalDocumentIds,
  legalDocumentLabels,
  parseLegalContent,
  type LegalDocumentId,
} from '@/lib/legal-content';

type LegalDocument = {
  id: LegalDocumentId;
  title: string;
  content: string;
  updatedAt: string | null;
};

export default function LegalDocumentsPanel() {
  const { addToast } = usePPOB();
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [activeId, setActiveId] = useState<LegalDocumentId>('tentang');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/admin/legal-documents', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { documents?: LegalDocument[]; error?: string };
        if (!response.ok || !Array.isArray(body.documents)) {
          throw new Error(body.error ?? 'Dokumen legal gagal dimuat.');
        }
        return body.documents;
      })
      .then((result) => {
        if (!active) return;
        setDocuments(result);
        const first = result.find((document) => document.id === activeId) ?? result[0];
        if (first) {
          setTitle(first.title);
          setContent(first.content);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        addToast(
          'Dokumen legal gagal dimuat',
          error instanceof Error ? error.message : 'Silakan muat ulang halaman.',
          'error',
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addToast]);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeId) ?? null,
    [activeId, documents],
  );
  const previewBlocks = useMemo(() => parseLegalContent(content), [content]);

  const selectDocument = (document: LegalDocument) => {
    setActiveId(document.id);
    setTitle(document.title);
    setContent(document.content);
  };

  const save = async () => {
    if (!title.trim()) {
      addToast('Judul wajib diisi', 'Judul dokumen tidak boleh kosong.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/legal-documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeId, title, content }),
      });
      const body = await response.json() as { document?: LegalDocument; error?: string };
      if (!response.ok || !body.document) {
        throw new Error(body.error ?? 'Dokumen gagal disimpan.');
      }
      const saved = body.document;
      setDocuments((current) => current.map((document) =>
        document.id === saved.id ? saved : document,
      ));
      addToast('Dokumen tersimpan', `${saved.title} berhasil diperbarui.`, 'success');
    } catch (error) {
      addToast(
        'Dokumen gagal disimpan',
        error instanceof Error ? error.message : 'Silakan coba kembali.',
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5">
          <LoadingState message="Memuat dokumen legal…" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Dokumen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-3 pt-0">
          {legalDocumentIds.map((id) => {
            const document = documents.find((item) => item.id === id);
            const active = id === activeId;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => document && selectDocument(document)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{document?.title || legalDocumentLabels[id]}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Edit Dokumen Legal</CardTitle>
              <CardDescription>
                Setiap dokumen disimpan terpisah. Gunakan <code className="rounded bg-slate-100 px-1">## Judul</code> untuk
                membuat subjudul dan baris kosong antar paragraf.
              </CardDescription>
            </div>
            <Badge variant="blue">
              {activeDocument?.updatedAt
                ? `Diperbarui ${new Date(activeDocument.updatedAt).toLocaleString('id-ID')}`
                : 'Belum disimpan'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="legal-title">Judul dokumen</Label>
            <Input
              id="legal-title"
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="legal-content">Isi dokumen</Label>
            <textarea
              id="legal-content"
              rows={18}
              maxLength={40_000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
            <p className="text-xs text-slate-500">{content.length.toLocaleString('id-ID')} / 40.000 karakter</p>
          </div>

          <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Pratinjau</summary>
            <div className="mt-3 space-y-3">
              {previewBlocks.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada isi.</p>
              ) : previewBlocks.map((block, index) => (
                <div key={`${block.heading ?? 'block'}-${index}`} className="space-y-1">
                  {block.heading && <p className="text-sm font-semibold text-slate-900">{block.heading}</p>}
                  {block.paragraphs.map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex} className="text-xs leading-6 text-slate-600">{paragraph}</p>
                  ))}
                </div>
              ))}
            </div>
          </details>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button type="button" onClick={() => void save()} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {isSaving ? 'Menyimpan…' : 'Simpan dokumen'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
