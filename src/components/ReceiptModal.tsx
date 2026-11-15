'use client';

import React, { useEffect, useState } from 'react';
import type { Transaction } from '@/types/ppob';
import { DEFAULT_STORE_NAME } from '@/lib/store-branding';
import {
  X,
  Printer,
  Share2,
  Copy,
  Check,
  CheckCircle2,
  FileText,
} from 'lucide-react';

interface ReceiptModalProps {
  transaction: Transaction | null;
  onClose: () => void;
}

type StoreIdentity = {
  storeName: string;
  supportPhone: string;
  logoUrl: string | null;
};

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const pieces = context.measureText(word).width > maxWidth
      ? word.match(new RegExp(`.{1,${Math.max(1, Math.floor(maxWidth / 14))}}`, 'g')) ?? [word]
      : [word];
    for (const piece of pieces) {
      const candidate = line ? `${line} ${piece}` : piece;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = piece;
      } else {
        line = candidate;
      }
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function loadReceiptLogo(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function createReceiptImage(
  transaction: Transaction,
  store: StoreIdentity,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const width = 720;
  const padding = 52;
  const contentWidth = width - padding * 2;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser tidak dapat membuat gambar struk.');

  const rows = [
    ['Waktu Transaksi', new Date(transaction.createdAt).toLocaleString('id-ID')],
    ['No. Referensi', transaction.referenceId],
    ['Kategori', `${transaction.operator} • ${transaction.category}`],
    ['Produk', transaction.productName],
    ['No. Tujuan', transaction.destination],
    ...(transaction.serverZoneId ? [['Server ID', transaction.serverZoneId]] : []),
    ...(transaction.customerName ? [['Nama Pelanggan', transaction.customerName]] : []),
  ].map(([label, value]) => {
    context.font = '22px Arial, sans-serif';
    return {
      label,
      value,
      lines: wrapCanvasText(context, value, contentWidth),
    };
  });
  context.font = '21px Arial, sans-serif';
  const serialLines = transaction.sn
    ? wrapCanvasText(context, transaction.sn, contentWidth - 36)
    : [];
  const rowsHeight = rows.reduce((height, row) => height + 58 + row.lines.length * 29, 0);
  const serialHeight = transaction.sn ? 82 + serialLines.length * 28 : 0;
  const height = 340 + rowsHeight + serialHeight + 180;
  canvas.width = width;
  canvas.height = height;

  context.fillStyle = '#f1f5f9';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  context.fillRect(20, 20, width - 40, height - 40);

  let y = 52;
  const logo = await loadReceiptLogo(store.logoUrl);
  if (logo) {
    const maxWidth = 250;
    const maxHeight = 86;
    const scale = Math.min(maxWidth / logo.naturalWidth, maxHeight / logo.naturalHeight, 1);
    const logoWidth = logo.naturalWidth * scale;
    const logoHeight = logo.naturalHeight * scale;
    context.drawImage(logo, (width - logoWidth) / 2, y, logoWidth, logoHeight);
    y += maxHeight + 12;
  } else {
    context.fillStyle = '#0f172a';
    context.font = 'bold 30px Arial, sans-serif';
    context.textAlign = 'center';
    const nameLines = wrapCanvasText(context, store.storeName || DEFAULT_STORE_NAME, contentWidth);
    for (const line of nameLines.slice(0, 2)) {
      context.fillText(line, width / 2, y + 32);
      y += 36;
    }
    y += 8;
  }

  context.fillStyle = '#64748b';
  context.font = '18px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(
    transaction.status === 'success' ? 'Bukti Pembayaran Transaksi' : 'Detail Transaksi',
    width / 2,
    y + 4,
  );
  y += 28;

  const statusLabel = transaction.status === 'success'
    ? 'LUNAS / BERHASIL'
    : transaction.status === 'pending'
      ? 'SEDANG DIPROSES'
      : 'GAGAL';
  const statusColor = transaction.status === 'success'
    ? '#047857'
    : transaction.status === 'pending'
      ? '#b45309'
      : '#be123c';
  context.font = 'bold 16px Arial, sans-serif';
  const statusWidth = context.measureText(statusLabel).width + 36;
  context.fillStyle = transaction.status === 'success'
    ? '#d1fae5'
    : transaction.status === 'pending'
      ? '#fef3c7'
      : '#ffe4e6';
  context.fillRect((width - statusWidth) / 2, y, statusWidth, 32);
  context.fillStyle = statusColor;
  context.fillText(statusLabel, width / 2, y + 22);
  y += 56;

  const drawSeparator = () => {
    context.setLineDash([6, 6]);
    context.strokeStyle = '#cbd5e1';
    context.beginPath();
    context.moveTo(padding, y);
    context.lineTo(width - padding, y);
    context.stroke();
    context.setLineDash([]);
    y += 24;
  };
  drawSeparator();

  for (const row of rows) {
    context.textAlign = 'left';
    context.fillStyle = '#64748b';
    context.font = '16px Arial, sans-serif';
    context.fillText(row.label, padding, y + 16);
    y += 28;
    context.fillStyle = '#0f172a';
    context.font = '22px Arial, sans-serif';
    for (const line of row.lines) {
      context.fillText(line, padding, y + 20);
      y += 29;
    }
    y += 20;
  }

  if (transaction.sn) {
    drawSeparator();
    context.textAlign = 'center';
    context.fillStyle = '#64748b';
    context.font = 'bold 15px Arial, sans-serif';
    context.fillText(
      transaction.category === 'pln' ? '20 DIGIT TOKEN LISTRIK' : 'SERIAL NUMBER (SN)',
      width / 2,
      y + 15,
    );
    y += 30;
    context.fillStyle = '#0f172a';
    context.fillRect(padding, y, contentWidth, serialLines.length * 28 + 24);
    context.fillStyle = '#ffffff';
    context.font = 'bold 21px monospace';
    for (const line of serialLines) {
      context.fillText(line, width / 2, y + 31);
      y += 28;
    }
    y += 22;
  }

  drawSeparator();
  context.textAlign = 'left';
  context.fillStyle = '#334155';
  context.font = 'bold 20px Arial, sans-serif';
  context.fillText('Total Pembayaran', padding, y + 25);
  context.textAlign = 'right';
  context.fillStyle = '#0f172a';
  context.font = 'bold 28px Arial, sans-serif';
  context.fillText(`Rp ${transaction.amount.toLocaleString('id-ID')}`, width - padding, y + 27);
  y += 72;
  if (store.supportPhone) {
    context.textAlign = 'center';
    context.fillStyle = '#64748b';
    context.font = '16px Arial, sans-serif';
    context.fillText(`Bantuan: ${store.supportPhone}`, width / 2, y);
    y += 26;
  }
  context.textAlign = 'center';
  context.fillStyle = '#94a3b8';
  context.font = '14px Arial, sans-serif';
  context.fillText('Simpan struk ini sebagai bukti transaksi.', width / 2, y + 4);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Gambar struk tidak dapat dibuat.'));
    }, 'image/png');
  });
}

export default function ReceiptModal({ transaction, onClose }: ReceiptModalProps) {
  const [copiedSn, setCopiedSn] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [storeIdentityError, setStoreIdentityError] = useState('');
  const [storeIdentity, setStoreIdentity] = useState<StoreIdentity>({
    storeName: DEFAULT_STORE_NAME,
    supportPhone: '',
    logoUrl: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/store-settings', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as Partial<StoreIdentity> & { error?: string };
        if (!response.ok || typeof body.storeName !== 'string') {
          throw new Error(body.error ?? 'Identitas toko gagal dimuat.');
        }
        setStoreIdentity({
          storeName: body.storeName,
          supportPhone: typeof body.supportPhone === 'string' ? body.supportPhone : '',
          logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl : null,
        });
        setStoreIdentityError('');
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setStoreIdentityError(error instanceof Error ? error.message : 'Identitas toko gagal dimuat.');
        }
      });
    return () => controller.abort();
  }, []);

  if (!transaction) return null;

  const handleCopySn = async () => {
    if (transaction.sn) {
      try {
        await navigator.clipboard.writeText(transaction.sn);
        setShareMessage('SN/Token berhasil disalin.');
      } catch {
        setShareMessage('SN/Token tidak dapat disalin otomatis. Pilih dan salin teksnya secara manual.');
      }
      setCopiedSn(true);
      setTimeout(() => setCopiedSn(false), 2000);
    }
  };

  const handleShare = async () => {
    setIsSharing(true);
    setShareMessage('');
    const textToShare = `BUKTI TRANSAKSI ${storeIdentity.storeName}\nRef: ${transaction.referenceId}\nProduk: ${transaction.productName}\nTujuan: ${transaction.destination}\nTotal: Rp ${transaction.amount.toLocaleString('id-ID')}\nStatus: ${transaction.status.toUpperCase()}\nSN/Token: ${transaction.sn || '-'}`;
    try {
      const blob = await createReceiptImage(transaction, storeIdentity);
      const file = new File([blob], `struk-${transaction.referenceId}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'Struk Transaksi',
          text: textToShare,
          files: [file],
        });
        setShareMessage('Gambar struk berhasil dibagikan.');
        return;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (navigator.share) {
        await navigator.share({ title: 'Struk Transaksi', text: textToShare });
        setShareMessage('Perangkat belum mendukung berbagi gambar. Gambar struk diunduh dan teks transaksi dibagikan.');
      } else {
        try {
          await navigator.clipboard.writeText(textToShare);
          setShareMessage('Perangkat belum mendukung berbagi gambar. Gambar struk diunduh dan teks transaksi disalin.');
        } catch {
          setShareMessage('Gambar struk diunduh. Silakan bagikan file tersebut dari perangkat Anda.');
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareMessage(error instanceof Error ? error.message : 'Struk gagal dibagikan.');
    } finally {
      setIsSharing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };
  const statusLabel = transaction.status === 'success'
    ? 'LUNAS / BERHASIL'
    : transaction.status === 'pending'
      ? 'SEDANG DIPROSES'
      : 'GAGAL';
  const statusClassName = transaction.status === 'success'
    ? 'bg-emerald-100 text-emerald-800'
    : transaction.status === 'pending'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-rose-100 text-rose-800';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Top Actions */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            {transaction.status === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <FileText className="w-4 h-4 text-blue-600" />
            )}
            <span>{transaction.status === 'success' ? 'Struk Resmi Digital' : 'Detail Transaksi'}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Struk Body */}
        <div className="p-6 overflow-y-auto print:p-0 print:m-0" id="receipt-print-area">
          <div className="text-center pb-4 border-b border-dashed border-slate-300">
            {storeIdentity.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={storeIdentity.logoUrl}
                alt={storeIdentity.storeName}
                onError={() => setStoreIdentity((current) => ({ ...current, logoUrl: null }))}
                className="mx-auto mb-2 max-h-14 max-w-48 object-contain"
              />
            ) : (
              <h2 className="mb-2 text-base font-bold tracking-tight text-slate-900">
                {storeIdentity.storeName}
              </h2>
            )}
            <p className="text-[11px] text-slate-500">
              {transaction.status === 'success'
                ? 'Bukti Pembayaran Transaksi Resmi'
                : 'Informasi status dan rincian transaksi'}
            </p>
            <div className={`mt-2 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusClassName}`}>
              {statusLabel}
            </div>
          </div>

          {/* Struk Line Details */}
          <div className="py-4 space-y-2.5 text-xs border-b border-dashed border-slate-300">
            <div className="flex justify-between text-slate-500">
              <span>Waktu Transaksi</span>
              <span className="text-slate-900 font-medium font-mono text-[11px]">
                {new Date(transaction.createdAt).toLocaleString('id-ID')}
              </span>
            </div>

            <div className="flex justify-between text-slate-500">
              <span>No. Referensi</span>
              <span className="text-slate-900 font-medium font-mono text-[11px]">
                {transaction.referenceId}
              </span>
            </div>

            <div className="flex justify-between text-slate-500">
              <span>Kategori</span>
              <span className="text-slate-900 font-medium uppercase">
                {transaction.operator} • {transaction.category}
              </span>
            </div>

            <div className="flex justify-between text-slate-500">
              <span>Produk</span>
              <span className="text-slate-900 font-bold text-right max-w-[60%]">
                {transaction.productName}
              </span>
            </div>

            <div className="flex justify-between text-slate-500">
              <span>No. Tujuan</span>
              <span className="text-slate-900 font-mono font-bold">
                {transaction.destination}
              </span>
            </div>

            {transaction.serverZoneId && (
              <div className="flex justify-between text-slate-500">
                <span>Server ID</span>
                <span className="text-slate-900 font-mono font-bold">
                  {transaction.serverZoneId}
                </span>
              </div>
            )}

            {transaction.customerName && (
              <div className="flex justify-between text-slate-500">
                <span>Nama Pelanggan</span>
                <span className="text-slate-900 font-semibold text-right">
                  {transaction.customerName}
                </span>
              </div>
            )}
          </div>

          {/* Serial Number (SN) / PLN Token Highlight */}
          {transaction.sn && (
            <div className="py-4 border-b border-dashed border-slate-300">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 text-center">
                {transaction.category === 'pln' ? '20 DIGIT TOKEN LISTRIK' : 'SERIAL NUMBER (SN)'}
              </div>
              <div className="p-3 rounded-xl bg-slate-900 text-white font-mono text-center font-bold text-sm tracking-widest break-all select-all flex items-center justify-between gap-2">
                <span className="flex-1">{transaction.sn}</span>
                <button
                  type="button"
                  onClick={handleCopySn}
                  className="print:hidden p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex-shrink-0"
                  title="Salin SN"
                  aria-label="Salin SN atau token"
                >
                  {copiedSn ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              {copiedSn && (
                <p className="text-[10px] text-center text-emerald-600 font-medium mt-1">
                  SN/Token berhasil disalin ke clipboard!
                </p>
              )}
            </div>
          )}

          {/* Price Total */}
          <div className="pt-4 flex justify-between items-baseline">
            <span className="text-xs font-semibold text-slate-600">Total Pembayaran</span>
            <span className="text-lg font-bold text-slate-900 font-sans">
              Rp {transaction.amount.toLocaleString('id-ID')}
            </span>
          </div>

          <p className="text-[10px] text-slate-400 text-center mt-4 leading-tight">
            Simpan struk ini sebagai bukti transaksi.
            {storeIdentity.supportPhone ? ` Bantuan: ${storeIdentity.supportPhone}` : ''}
          </p>
          {storeIdentityError && (
            <p role="status" className="mt-2 text-center text-[10px] text-amber-700">
              Identitas toko tidak dapat dimuat; struk memakai nama toko sementara.
            </p>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="border-t border-slate-100 bg-slate-50 p-4">
          {shareMessage && (
            <p role="status" className="mb-2 text-center text-xs text-slate-600">
              {shareMessage}
            </p>
          )}
          <div className="flex gap-2">
          <button
            onClick={handleShare}
            disabled={isSharing}
            className="flex-1 py-2 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:cursor-wait disabled:opacity-60"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{isSharing ? 'Menyiapkan…' : 'Bagikan struk'}</span>
          </button>

          <button
            onClick={handlePrint}
            aria-label="Cetak struk atau simpan sebagai PDF"
            className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak PDF</span>
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
