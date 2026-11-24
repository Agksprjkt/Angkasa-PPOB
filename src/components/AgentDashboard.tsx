'use client';

import React, { useEffect, useState } from 'react';
import { usePPOB } from '@/context/PPOBContext';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Store,
} from 'lucide-react';

export default function AgentDashboard() {
  const { currentUser, balance, commissionBalance, products } = usePPOB();
  const currentUserId = currentUser?.id;
  const currentUserRole = currentUser?.role;

  const [counterName, setCounterName] = useState('BERKAH CELLULAR');
  const [counterFooter, setCounterFooter] = useState('Terima kasih atas kunjungan Anda! Layanan Pulsa 24 Jam');
  const [printMarkup, setPrintMarkup] = useState<number>(2000);
  const [overviewResult, setOverviewResult] = useState<{
    userId: string;
    data?: {
      successfulTransactions: number;
      pendingTransactions: number;
      successfulProfit: number;
    };
    error?: string;
  } | null>(null);
  const overviewResultForUser = overviewResult?.userId === currentUserId
    ? overviewResult
    : null;
  const overview = overviewResultForUser?.data ?? null;
  const overviewLoading = Boolean(
    currentUserRole === 'agent' && !overviewResultForUser,
  );
  const overviewError = overviewResultForUser?.error ?? '';

  useEffect(() => {
    if (!currentUserId || currentUserRole !== 'agent') return;
    const controller = new AbortController();
    void fetch('/api/agent/overview', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json() as {
          successfulTransactions?: unknown;
          pendingTransactions?: unknown;
          successfulProfit?: unknown;
          error?: string;
        };
        if (
          !response.ok ||
          typeof result.successfulTransactions !== 'number' ||
          typeof result.pendingTransactions !== 'number' ||
          typeof result.successfulProfit !== 'number' ||
          !Number.isSafeInteger(result.successfulTransactions) ||
          !Number.isSafeInteger(result.pendingTransactions) ||
          !Number.isSafeInteger(result.successfulProfit)
        ) {
          throw new Error(result.error ?? 'Ringkasan transaksi Member gagal dimuat.');
        }
        const data = {
          successfulTransactions: result.successfulTransactions,
          pendingTransactions: result.pendingTransactions,
          successfulProfit: result.successfulProfit,
        };
        setOverviewResult({ userId: currentUserId, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setOverviewResult({
            userId: currentUserId,
            error: error instanceof Error
              ? error.message
              : 'Ringkasan transaksi Member gagal dimuat.',
          });
        }
      })
    return () => controller.abort();
  }, [currentUserId, currentUserRole]);

  return (
    <div className="dashboard-content space-y-6">
      {/* Top Banner */}
      <div id="agent-overview" className="liquid-member-hero scroll-mt-24 flex flex-col justify-between gap-4 rounded-2xl border border-white/80 bg-white/70 p-6 text-slate-900 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.12)] backdrop-blur-xl md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="success" className="text-xs font-bold uppercase tracking-wide">
              Portal Khusus Member Reseller
            </Badge>
            <span className="text-xs font-semibold text-emerald-700">• Harga Member Aktif</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Dashboard Mitra Member - {currentUser?.name || counterName}
          </h2>
          <p className="mt-1 max-w-xl text-xs text-slate-600 sm:text-sm">
            Nikmati harga khusus member, kelola struk kasir toko Anda, dan pantau margin laba setiap transaksi.
          </p>
        </div>

        <p className="max-w-xs rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
          Penarikan komisi belum tersedia. Saldo tidak akan berubah dari dashboard ini.
        </p>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Saldo Deposit Member</CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900 font-sans">
              Rp {balance.toLocaleString('id-ID')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-emerald-600 font-medium">
              Siap dipakai transaksi instan tanpa biaya gateway
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Total Margin Keuntungan</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600 font-sans">
              {overviewLoading ? 'Memuat…' : overview ? `Rp ${overview.successfulProfit.toLocaleString('id-ID')}` : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-slate-500">
              Margin dari transaksi sukses saja · Saldo komisi Rp {commissionBalance.toLocaleString('id-ID')} (belum dapat ditarik)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Total Penjualan Konter</CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-600 font-sans">
              {overviewLoading ? 'Memuat…' : overview ? `${overview.successfulTransactions} Transaksi` : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-slate-500">
              {overview?.pendingTransactions
                ? `${overview.pendingTransactions} transaksi masih diproses`
                : 'Transaksi berhasil saja'}
            </p>
          </CardContent>
        </Card>
      </div>
      {overviewError && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {overviewError}
        </p>
      )}

      {/* Two Column Layout: Struk Setting & Price Catalog */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Custom Struk Printer Settings for Counter */}
        <div id="agent-counter" className="scroll-mt-24 lg:col-span-5 space-y-4">
          <details className="rounded-xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-slate-900">Pratinjau struk kasir</span>
                <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  Belum tersambung
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Hanya contoh tampilan. Tidak mengubah transaksi atau struk yang dicetak.
              </p>
            </summary>
            <CardContent className="border-t border-slate-100">
              <div className="space-y-3.5">
                <div className="space-y-1">
                  <Label htmlFor="counter-name">Nama Konter / Toko di Struk</Label>
                  <Input
                    id="counter-name"
                    value={counterName}
                    onChange={(e) => setCounterName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="print-markup">
                    Margin contoh (Rp)
                  </Label>
                  <Input
                    id="print-markup"
                    type="number"
                    value={printMarkup}
                    onChange={(e) => setPrintMarkup(parseInt(e.target.value, 10) || 0)}
                    required
                  />
                  <p className="text-[10px] text-slate-500">
                    Contoh perhitungan saja; tidak mengubah harga transaksi atau jumlah yang dibayar pelanggan.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="counter-footer">Catatan Kaki Struk</Label>
                  <Input
                    id="counter-footer"
                    value={counterFooter}
                    onChange={(e) => setCounterFooter(e.target.value)}
                  />
                </div>

                <Button type="button" variant="outline" className="w-full" disabled>
                  Penyimpanan struk belum tersedia
                </Button>
              </div>
            </CardContent>
          </details>

          {/* Struk Preview Card */}
          <Card className="border-dashed bg-slate-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-slate-500">
                Contoh tampilan saja · bukan struk transaksi
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center font-mono text-xs space-y-2">
              <div className="font-bold text-sm text-slate-900 uppercase">{counterName}</div>
              <div className="text-[11px] text-slate-500">Struk Pembelian Pulsa Resmi</div>
              <div className="border-t border-dashed border-slate-300 my-2 pt-2 text-left space-y-1">
                <div className="flex justify-between">
                  <span>Produk:</span>
                  <span className="font-bold">Telkomsel 25.000</span>
                </div>
                <div className="flex justify-between">
                  <span>Harga:</span>
                  <span className="font-bold">Rp {(25400 + printMarkup).toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between">
                  <span>SN:</span>
                  <span>029381029381029</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">{counterFooter}</p>
            </CardContent>
          </Card>
        </div>

        {/* Right: Member Price List */}
        <div id="agent-catalog" className="scroll-mt-24 lg:col-span-7">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-base">Katalog Harga Member</CardTitle>
                  <CardDescription>
                    Harga khusus member dibandingkan dengan harga jual
                  </CardDescription>
                </div>
                <Badge variant="success">Hemat s/d 15%</Badge>
              </div>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Produk</th>
                      <th className="py-2.5 px-3 text-right">Harga Jual</th>
                      <th className="py-2.5 px-3 text-right text-emerald-700">Harga Member</th>
                      <th className="py-2.5 px-3 text-right">Selisih Harga</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.slice(0, 10).map((p) => {
                      const memberPrice = p.sellPriceAgent ?? p.sellPriceUser;
                      const profit = p.sellPriceUser - memberPrice;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">{p.name}</div>
                            <div className="text-[10px] text-slate-400">{p.operator} • {p.category}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                            Rp {p.sellPriceUser.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                            Rp {memberPrice.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-600">
                            +Rp {profit.toLocaleString('id-ID')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
