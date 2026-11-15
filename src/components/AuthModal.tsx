'use client';

import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AuthTab = 'login' | 'register';

function toInternationalPhoneNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
  if (digits.startsWith('62')) return `+${digits}`;
  if (digits.startsWith('8')) return `+62${digits}`;
  return `+${digits}`;
}

function getErrorMessage(error: { message?: string } | null | undefined) {
  return error?.message ?? 'Terjadi kesalahan. Silakan coba kembali.';
}

async function setNewPassword(password: string) {
  const response = await fetch('/api/auth/set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: password }),
  });

  if (!response.ok) {
    const result: unknown = await response.json();
    const message =
      typeof result === 'object' &&
      result !== null &&
      'message' in result &&
      typeof result.message === 'string'
        ? result.message
        : 'Tidak dapat menyimpan kata sandi.';
    throw new Error(message);
  }
}

export default function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [storeName, setStoreName] = useState('');
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | null>(null);
  const [storeLogoFailed, setStoreLogoFailed] = useState(false);
  const [storeIdentityError, setStoreIdentityError] = useState('');
  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch('/api/store-settings', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (
          !response.ok ||
          typeof result !== 'object' ||
          result === null ||
          !('storeName' in result) ||
          typeof result.storeName !== 'string' ||
          !result.storeName.trim()
        ) {
          throw new Error('Identitas aplikasi tidak dapat dimuat.');
        }
        setStoreName(result.storeName.trim());
        setStoreLogoUrl(
          'logoUrl' in result && typeof result.logoUrl === 'string'
            ? result.logoUrl
            : null,
        );
        setStoreLogoFailed(false);
        setStoreIdentityError('');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[AUTH_STORE_IDENTITY_LOAD_FAILED]', error);
        setStoreIdentityError(
          error instanceof Error
            ? error.message
            : 'Identitas aplikasi tidak dapat dimuat.',
        );
      });
    return () => controller.abort();
  }, [open]);

  const handleTabChange = (value: string) => {
    if (value !== 'login' && value !== 'register') return;
    setActiveTab(value);
    setErrorMessage('');
  };

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    try {
      const { error } = await authClient.signIn.phoneNumber({
        phoneNumber: toInternationalPhoneNumber(loginPhone),
        password: loginPassword,
      });

      if (error) {
        setErrorMessage(getErrorMessage(error));
        return;
      }

      onOpenChange(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Tidak dapat menghubungi server.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const { error } = await authClient.phoneNumber.requestPasswordReset({
        phoneNumber: toInternationalPhoneNumber(loginPhone),
      });
      if (error) {
        setErrorMessage(getErrorMessage(error));
        return;
      }
      setResetOtpSent(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Tidak dapat mengirim kode reset.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    try {
      const { error } = await authClient.phoneNumber.resetPassword({
        phoneNumber: toInternationalPhoneNumber(loginPhone),
        otp: resetCode.trim(),
        newPassword: resetPassword,
      });
      if (error) {
        setErrorMessage(getErrorMessage(error));
        return;
      }
      setResetMode(false);
      setResetOtpSent(false);
      setLoginPassword('');
      setResetCode('');
      setResetPassword('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Tidak dapat mengatur kata sandi.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    const phoneNumber = toInternationalPhoneNumber(regPhone);

    try {
      const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber });
      if (error) {
        setErrorMessage(getErrorMessage(error));
        return;
      }

      setVerifiedPhone(phoneNumber);
      setOtpSent(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'OTP WhatsApp tidak dapat dikirim.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const finishRegistration = async () => {
    await setNewPassword(regPassword);
    const { error } = await authClient.updateUser({ name: regName.trim() });
    if (error) throw new Error(getErrorMessage(error));
    onOpenChange(false);
  };

  const handleVerifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    try {
      const { error } = await authClient.phoneNumber.verify({
        phoneNumber: verifiedPhone,
        code: verificationCode.trim(),
      });
      if (error) {
        setErrorMessage(getErrorMessage(error));
        return;
      }

      setOtpVerified(true);
      await finishRegistration();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Verifikasi akun gagal.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinishRegistration = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    try {
      await finishRegistration();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Tidak dapat menyelesaikan akun.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setErrorMessage('');
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} wide>
      <DialogContent
        onClose={() => handleOpenChange(false)}
        className="max-h-[90vh] max-w-4xl overflow-hidden border-0 bg-white p-0 shadow-2xl sm:rounded-2xl"
      >
        <div className="grid max-h-[90vh] overflow-y-auto md:grid-cols-[0.9fr_1.1fr]">
          <aside className="relative hidden min-h-[610px] flex-col justify-between overflow-hidden bg-slate-950 p-8 text-white md:flex lg:p-10">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-600/30 via-slate-950 to-slate-950"
            />
            <div aria-hidden="true" className="absolute -bottom-28 -left-20 h-80 w-80 rounded-full border border-white/10" />
            <div aria-hidden="true" className="absolute -bottom-16 -left-8 h-56 w-56 rounded-full border border-white/10" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-white/10">
                {storeLogoUrl && !storeLogoFailed ? (
                  <Image
                    src={storeLogoUrl}
                    alt=""
                    width={44}
                    height={44}
                    unoptimized
                    className="h-full w-full object-contain"
                    onError={() => setStoreLogoFailed(true)}
                  />
                ) : storeName ? (
                  <span className="text-sm font-bold">{storeName.slice(0, 2).toLocaleUpperCase('id-ID')}</span>
                ) : (
                  <UserRound className="h-5 w-5 text-white/80" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{storeName || 'Akun pelanggan'}</p>
                <p className="text-xs text-slate-300">Akses akun Anda</p>
              </div>
            </div>

            <div className="relative z-10 space-y-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
                <ShieldCheck className="h-6 w-6 text-blue-200" aria-hidden="true" />
              </div>
              <div className="space-y-3">
                <p className="text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">
                  {activeTab === 'register' && !otpSent
                    ? 'Mulai langkah baru Anda.'
                    : 'Senang bertemu kembali.'}
                </p>
                <p className="max-w-sm text-sm leading-6 text-slate-300">
                  Nikmati belanja produk digital yang praktis, gunakan saldo akun, dan pantau pesanan Anda.
                </p>
              </div>
            </div>

            <div className="relative z-10 flex items-center gap-2 text-xs text-slate-300">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
              Akses akun dilindungi dan hanya untuk Anda.
            </div>
          </aside>

          <section className="min-w-0 p-5 sm:p-8 lg:p-10">
            <div className="mb-7 flex items-center gap-3 md:hidden">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {storeLogoUrl && !storeLogoFailed ? (
                  <Image
                    src={storeLogoUrl}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                    className="h-full w-full object-contain"
                    onError={() => setStoreLogoFailed(true)}
                  />
                ) : storeName ? (
                  <span className="text-sm font-bold text-slate-800">{storeName.slice(0, 2).toLocaleUpperCase('id-ID')}</span>
                ) : (
                  <UserRound className="h-5 w-5 text-slate-500" aria-hidden="true" />
                )}
              </div>
              <p className="truncate text-sm font-semibold text-slate-900">
                {storeName || 'Akun pelanggan'}
              </p>
            </div>

            <DialogHeader className="mb-6 border-0 p-0">
              <DialogTitle className="text-2xl tracking-tight">
                {resetMode
                  ? 'Pulihkan kata sandi'
                  : activeTab === 'register'
                    ? 'Buat akun baru'
                    : 'Masuk ke akun'}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {resetMode
                  ? 'Atur ulang akses akun menggunakan nomor WhatsApp.'
                  : activeTab === 'register'
                    ? 'Daftar dengan nomor WhatsApp untuk mulai menggunakan layanan.'
                    : storeName
                      ? `Masuk untuk melanjutkan ke ${storeName}.`
                      : 'Masuk menggunakan nomor WhatsApp dan kata sandi Anda.'}
              </DialogDescription>
            </DialogHeader>
            {storeIdentityError && (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
                Nama dan logo aplikasi belum dapat dimuat. Anda tetap bisa masuk atau mendaftar.
              </p>
            )}

            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="mb-5 grid h-11 w-full grid-cols-2 rounded-lg bg-slate-100 p-1">
                <TabsTrigger value="login" className="h-9 text-sm">Masuk</TabsTrigger>
                <TabsTrigger value="register" className="h-9 text-sm">Daftar</TabsTrigger>
              </TabsList>

          <TabsContent value="login">
            {resetMode ? (
              <div className="space-y-3.5">
                {!resetOtpSent ? (
                  <>
                    <p className="text-sm text-slate-600">
                      Kami akan mengirim kode pemulihan ke nomor WhatsApp akun Anda.
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-phone">Nomor WhatsApp</Label>
                      <Input
                        id="reset-phone"
                        type="tel"
                        autoComplete="tel"
                        required
                        value={loginPhone}
                        onChange={(event) => setLoginPhone(event.target.value)}
                      />
                    </div>
                    {errorMessage && (
                      <p role="alert" className="text-sm text-red-600">
                        {errorMessage}
                      </p>
                    )}
                    <Button
                      type="button"
                      disabled={isLoading || !loginPhone}
                      className="w-full"
                      onClick={() => void handleRequestPasswordReset()}
                    >
                      {isLoading ? 'Mengirim kode…' : 'Kirim kode reset'}
                    </Button>
                  </>
                ) : (
                  <form onSubmit={handlePasswordReset} className="space-y-3.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-code">Kode reset</Label>
                      <Input
                        id="reset-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        value={resetCode}
                        onChange={(event) =>
                          setResetCode(event.target.value.replace(/\D/g, ''))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-password">Kata sandi baru</Label>
                      <Input
                        id="reset-password"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                        value={resetPassword}
                        onChange={(event) => setResetPassword(event.target.value)}
                      />
                    </div>
                    {errorMessage && (
                      <p role="alert" className="text-sm text-red-600">
                        {errorMessage}
                      </p>
                    )}
                    <Button type="submit" disabled={isLoading} className="w-full">
                      {isLoading ? 'Menyimpan…' : 'Atur kata sandi baru'}
                    </Button>
                  </form>
                )}
                <button
                  type="button"
                  className="w-full text-sm text-slate-600 underline"
                  onClick={() => {
                    setResetMode(false);
                    setResetOtpSent(false);
                    setErrorMessage('');
                  }}
                >
                  Kembali ke halaman masuk
                </button>
              </div>
            ) : (
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="login-phone">Nomor WhatsApp</Label>
                <Input
                  id="login-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="08xxxxxxxxxx"
                  required
                  value={loginPhone}
                  onChange={(event) => setLoginPhone(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Kata sandi</Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
              </div>
              {errorMessage && (
                <p role="alert" className="text-sm text-red-600">
                  {errorMessage}
                </p>
              )}
              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? 'Memverifikasi…' : 'Masuk'}
              </Button>
              <button
                type="button"
                className="w-full text-sm text-slate-600 underline"
                onClick={() => {
                  setResetMode(true);
                  setErrorMessage('');
                }}
              >
                Lupa kata sandi?
              </button>
            </form>
            )}
          </TabsContent>

          <TabsContent value="register">
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name">Nama lengkap</Label>
                  <Input
                    id="reg-name"
                    autoComplete="name"
                    required
                    maxLength={100}
                    value={regName}
                    onChange={(event) => setRegName(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-phone">Nomor WhatsApp</Label>
                  <Input
                    id="reg-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="08xxxxxxxxxx"
                    required
                    value={regPhone}
                    onChange={(event) => setRegPhone(event.target.value)}
                  />
                  <p className="text-xs text-slate-500">
                    Kami akan mengirim kode verifikasi ke nomor ini.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-password">Kata sandi</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={regPassword}
                    onChange={(event) => setRegPassword(event.target.value)}
                  />
                  <p className="text-xs text-slate-500">Minimal 8 karakter.</p>
                </div>
                <p className="text-xs text-slate-500">
                  Akun baru terdaftar sebagai pelanggan. Akses member ditetapkan
                  setelah persetujuan admin.
                </p>
                {errorMessage && (
                  <p role="alert" className="text-sm text-red-600">
                    {errorMessage}
                  </p>
                )}
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? 'Mengirim kode…' : 'Kirim kode verifikasi'}
                </Button>
              </form>
            ) : otpVerified ? (
              <form onSubmit={handleFinishRegistration} className="space-y-3">
                <p className="text-sm text-slate-600">
                  Nomor WhatsApp berhasil diverifikasi. Selesaikan pembuatan akun
                  untuk mulai menggunakan {storeName || 'layanan ini'}.
                </p>
                {errorMessage && (
                  <p role="alert" className="text-sm text-red-600">
                    {errorMessage}
                  </p>
                )}
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? 'Menyimpan akun…' : 'Selesaikan pembuatan akun'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="verification-code">Kode verifikasi</Label>
                  <Input
                    id="verification-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={verificationCode}
                    onChange={(event) =>
                      setVerificationCode(event.target.value.replace(/\D/g, ''))
                    }
                  />
                  <p className="text-xs text-slate-500">
                    Masukkan kode 6 digit yang dikirim ke {verifiedPhone}.
                  </p>
                </div>
                {errorMessage && (
                  <p role="alert" className="text-sm text-red-600">
                    {errorMessage}
                  </p>
                )}
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? 'Memverifikasi…' : 'Verifikasi & buat akun'}
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-slate-600 underline"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpVerified(false);
                    setVerificationCode('');
                    setErrorMessage('');
                  }}
                >
                  Ganti nomor WhatsApp
                </button>
              </form>
            )}
          </TabsContent>
            </Tabs>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
