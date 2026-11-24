'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, KeyRound, LockKeyhole } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { LoadingOverlay } from '@/components/ui/crystal-loader';

export type RecoveryPurpose = 'password' | 'pin';

const errorMessages: Record<string, string> = {
  INVALID_PHONE_NUMBER: 'Masukkan nomor WhatsApp yang valid.',
  INVALID_OTP: 'Kode verifikasi salah.',
  OTP_NOT_FOUND: 'Kode tidak ditemukan atau sudah kedaluwarsa. Kirim ulang kode.',
  TOO_MANY_ATTEMPTS: 'Terlalu banyak percobaan. Kirim ulang kode.',
  RATE_LIMITED: 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.',
  WHATSAPP_UNAVAILABLE: 'Kode gagal dikirim lewat WhatsApp. Coba lagi nanti.',
  RECOVERY_GRANT_INVALID: 'Sesi reset sudah berakhir. Mulai ulang dari awal.',
};

function messageFor(code?: string) {
  return code ? errorMessages[code] ?? code : 'Permintaan gagal. Coba lagi.';
}

export function RecoveryFlow({ purpose }: { purpose: RecoveryPurpose }) {
  const router = useRouter();
  const isPassword = purpose === 'password';
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/recovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose, ...body }),
    });
    const result = await response.json() as { error?: string; phoneNumber?: string; grant?: string };
    if (!response.ok) throw new Error(result.error ?? 'UNKNOWN');
    return result;
  };

  const requestOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsBusy(true);
    try {
      const result = await post({ step: 'request', phoneNumber });
      setPhoneNumber(result.phoneNumber ?? phoneNumber);
      setStep('otp');
      setOtp('');
      setMessage(
        `Bila nomor ${result.phoneNumber ?? phoneNumber} terdaftar, kode verifikasi sudah dikirim lewat WhatsApp.`,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? messageFor(requestError.message) : messageFor());
    } finally {
      setIsBusy(false);
    }
  };

  const verifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!/^\d{6}$/.test(otp)) {
      setError('Kode verifikasi terdiri dari 6 angka.');
      return;
    }
    setIsBusy(true);
    try {
      const result = await post({ step: 'verify', phoneNumber, otp });
      if (!result.grant) throw new Error('RECOVERY_GRANT_INVALID');
      // The grant is handed to the reset page through the URL, so a refresh on
      // that page still works while the grant is alive.
      const path = isPassword ? '/lupa-sandi/reset' : '/lupa-pin/reset';
      router.push(`${path}?grant=${encodeURIComponent(result.grant)}`);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? messageFor(verifyError.message) : messageFor());
      setOtp('');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <Link
        href={isPassword ? '/dashboard/settings' : '/dashboard/settings'}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-sky-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali
      </Link>

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-sky-700">
          {isPassword ? <KeyRound className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
        </span>
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {isPassword ? 'Lupa kata sandi' : 'Lupa PIN transaksi'}
          </h1>
          <p className="text-xs text-slate-500">
            Kode verifikasi dikirim ke WhatsApp yang terdaftar di akun Anda.
          </p>
        </div>
      </div>

      <form onSubmit={requestOtp} className="space-y-4">
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Nomor WhatsApp
          <Input
            type="tel"
            autoComplete="tel"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="08xxxxxxxxxx"
            required
            disabled={isBusy || step === 'otp'}
          />
        </label>
        <Button type="submit" className="w-full" disabled={isBusy || step === 'otp'}>
          {isBusy && step === 'phone' ? 'Mengirim…' : 'Kirim kode verifikasi'}
        </Button>
      </form>

      {step === 'otp' && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            Kode verifikasi WhatsApp
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6 angka"
              required
              autoFocus
              disabled={isBusy}
            />
          </label>
          <Button type="submit" className="w-full" disabled={isBusy || otp.length !== 6}>
            {isBusy ? 'Memeriksa…' : 'Konfirmasi kode'}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setOtp('');
              setMessage('');
              setError('');
            }}
            className="w-full text-xs font-semibold text-slate-500 underline"
            disabled={isBusy}
          >
            Ganti nomor atau kirim ulang kode
          </button>
        </form>
      )}

      {message && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {isBusy && <LoadingOverlay message={step === 'phone' ? 'Mengirim kode…' : 'Memeriksa kode…'} />}
    </main>
  );
}

export function RecoveryResetForm({ purpose }: { purpose: RecoveryPurpose }) {
  const router = useRouter();
  const isPassword = purpose === 'password';
  const searchParams = useSearchParams();
  const grant = searchParams.get('grant');
  const [secret, setSecret] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!grant) {
      setError(messageFor('RECOVERY_GRANT_INVALID'));
      return;
    }
    if (isPassword && secret.length < 8) {
      setError('Kata sandi minimal 8 karakter.');
      return;
    }
    if (!isPassword && !/^\d{6}$/.test(secret)) {
      setError('PIN harus terdiri dari 6 angka.');
      return;
    }
    if (secret !== confirmation) {
      setError(isPassword ? 'Konfirmasi kata sandi tidak cocok.' : 'Konfirmasi PIN tidak cocok.');
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch('/api/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose,
          step: 'reset',
          grant,
          ...(isPassword ? { newPassword: secret } : { newPin: secret }),
        }),
      });
      const result = await response.json() as { error?: string; phoneNumber?: string; email?: string };
      if (!response.ok) throw new Error(result.error ?? 'UNKNOWN');

      if (isPassword && result.email) {
        const signIn = await authClient.signIn.email({
          email: result.email,
          password: secret,
        });
        router.replace(signIn.error ? '/' : '/dashboard');
        return;
      }
      router.replace('/dashboard/settings');
    } catch (resetError) {
      setError(resetError instanceof Error ? messageFor(resetError.message) : messageFor());
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-sky-700">
          {isPassword ? <KeyRound className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
        </span>
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {isPassword ? 'Kata sandi baru' : 'PIN transaksi baru'}
          </h1>
          <p className="text-xs text-slate-500">
            Kode verifikasi sudah dikonfirmasi. Tentukan {isPassword ? 'kata sandi' : 'PIN'} baru Anda.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          {isPassword ? 'Kata sandi baru' : 'PIN baru'}
          <PasswordInput
            inputMode={isPassword ? undefined : 'numeric'}
            autoComplete="new-password"
            maxLength={isPassword ? undefined : 6}
            value={secret}
            onChange={(event) => setSecret(
              isPassword ? event.target.value : event.target.value.replace(/\D/g, '').slice(0, 6),
            )}
            required
            disabled={isBusy}
            className={isPassword ? undefined : 'tracking-[0.3em]'}
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          {isPassword ? 'Konfirmasi kata sandi baru' : 'Konfirmasi PIN baru'}
          <PasswordInput
            inputMode={isPassword ? undefined : 'numeric'}
            autoComplete="new-password"
            maxLength={isPassword ? undefined : 6}
            value={confirmation}
            onChange={(event) => setConfirmation(
              isPassword ? event.target.value : event.target.value.replace(/\D/g, '').slice(0, 6),
            )}
            required
            disabled={isBusy}
            className={isPassword ? undefined : 'tracking-[0.3em]'}
          />
        </label>
        <Button type="submit" className="w-full" disabled={isBusy || !grant}>
          {isBusy ? 'Menyimpan…' : isPassword ? 'Simpan kata sandi' : 'Simpan PIN'}
        </Button>
      </form>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {isBusy && <LoadingOverlay message="Menyimpan…" />}
    </main>
  );
}
