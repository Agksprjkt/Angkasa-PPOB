'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { normalizePhone } from '@/lib/phone';
import { isSyntheticEmail } from '@/lib/synthetic-email';
import { usePPOB } from '@/context/PPOBContext';
import { PasswordInput } from '@/components/ui/password-input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface CustomerAccountSettingsProps {
  initialName: string;
  email: string;
  initialPhone: string;
}

export default function CustomerAccountSettings({
  initialName,
  email,
  initialPhone,
}: CustomerAccountSettingsProps) {
  const { currentUser } = usePPOB();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [nameMessage, setNameMessage] = useState('');
  const [nameError, setNameError] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  const [phone, setPhone] = useState(initialPhone);
  const [pendingPhone, setPendingPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneMessage, setPhoneMessage] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [isSendingPhoneCode, setIsSendingPhoneCode] = useState(false);
  const [isVerifyingPhone, setIsVerifyingPhone] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMessage, setPinMessage] = useState('');
  const [pinError, setPinError] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [pinStatusError, setPinStatusError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/user/transaction-pin', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json() as { configured?: unknown; error?: string };
        if (!response.ok || typeof result.configured !== 'boolean') {
          throw new Error(result.error ?? 'Status PIN transaksi gagal dimuat.');
        }
        setPinConfigured(result.configured);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setPinStatusError(
            error instanceof Error ? error.message : 'Status PIN transaksi gagal dimuat.',
          );
        }
      });
    return () => controller.abort();
  }, []);

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    setNameError('');
    setNameMessage('');
    if (nextName.length < 2) {
      setNameError('Nama tampilan minimal 2 karakter.');
      return;
    }

    setIsSavingName(true);
    try {
      const { error } = await authClient.updateUser({ name: nextName });
      if (error) throw new Error(error.message ?? 'Nama tampilan gagal diperbarui.');
      setName(nextName);
      setSavedName(nextName);
      setNameMessage('Nama tampilan berhasil diperbarui.');
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'Nama tampilan gagal diperbarui.');
    } finally {
      setIsSavingName(false);
    }
  };

  const requestPhoneCode = async () => {
    setPhoneError('');
    setPhoneMessage('');
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setPhoneError('Masukkan nomor HP Indonesia yang valid.');
      return;
    }
    if (normalized === currentUser?.phone) {
      setPhoneError('Nomor HP tersebut sudah terpasang di akun ini.');
      return;
    }

    setIsSendingPhoneCode(true);
    try {
      const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: normalized });
      if (error) throw new Error(error.message ?? 'OTP gagal dikirim.');
      setPendingPhone(normalized);
      setPhoneCode('');
      setPhoneMessage(`Kode verifikasi dikirim ke ${normalized}.`);
    } catch (error) {
      setPhoneError(error instanceof Error ? error.message : 'OTP gagal dikirim.');
    } finally {
      setIsSendingPhoneCode(false);
    }
  };

  const verifyPhoneCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPhoneError('');
    setPhoneMessage('');
    if (!pendingPhone || !phoneCode.trim()) {
      setPhoneError('Masukkan kode OTP yang dikirim ke nomor baru.');
      return;
    }

    setIsVerifyingPhone(true);
    try {
      const { error } = await authClient.phoneNumber.verify({
        phoneNumber: pendingPhone,
        code: phoneCode.trim(),
        updatePhoneNumber: true,
      });
      if (error) throw new Error(error.message ?? 'Nomor HP gagal diperbarui.');
      setPhone(pendingPhone);
      setPendingPhone('');
      setPhoneCode('');
      setPhoneMessage('Nomor HP berhasil diverifikasi dan diperbarui.');
    } catch (error) {
      setPhoneError(error instanceof Error ? error.message : 'Nomor HP gagal diperbarui.');
    } finally {
      setIsVerifyingPhone(false);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    if (newPassword.length < 8) {
      setPasswordError('Kata sandi baru minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      if (error) throw new Error(error.message ?? 'Kata sandi gagal diubah.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Kata sandi berhasil diubah.');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Kata sandi gagal diubah.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const savePin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPinError('');
    setPinMessage('');
    if (!/^\d{6}$/.test(newPin)) {
      setPinError('PIN harus terdiri dari 6 angka.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('Konfirmasi PIN tidak cocok.');
      return;
    }
    if (pinConfigured && !/^\d{6}$/.test(currentPin)) {
      setPinError('Masukkan PIN saat ini yang terdiri dari 6 angka.');
      return;
    }

    setIsSavingPin(true);
    try {
      const response = await fetch('/api/user/transaction-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: newPin,
          ...(pinConfigured ? { currentPin } : {}),
        }),
      });
      const result = await response.json() as { configured?: boolean; error?: string };
      if (!response.ok || result.configured !== true) {
        throw new Error(result.error ?? 'PIN transaksi gagal disimpan.');
      }
      setPinConfigured(true);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setPinMessage('PIN transaksi berhasil disimpan.');
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'PIN transaksi gagal disimpan.');
    } finally {
      setIsSavingPin(false);
    }
  };

  const displayedEmail = isSyntheticEmail(email) ? 'Belum diatur' : email;

  return (
    <div className="dashboard-content space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profil akun</CardTitle>
          <CardDescription>Perbarui nama dan nomor HP yang terhubung dengan akun.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={saveName} className="space-y-3">
            <label htmlFor="account-display-name" className="block text-sm font-medium text-slate-700">
              Nama tampilan
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="account-display-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
                className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="submit"
                disabled={isSavingName || name.trim() === savedName}
                className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingName ? 'Menyimpan…' : 'Simpan nama'}
              </button>
            </div>
            {nameMessage && <p role="status" className="text-xs text-emerald-700">{nameMessage}</p>}
            {nameError && <p role="alert" className="text-xs text-rose-700">{nameError}</p>}
          </form>

          <div className="grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <div>
              <label htmlFor="account-email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="account-email"
                value={displayedEmail}
                readOnly
                disabled
                className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Perubahan email tersedia setelah verifikasi email diaktifkan.
              </p>
            </div>
            <div>
              <label htmlFor="account-phone" className="block text-sm font-medium text-slate-700">
                Nomor HP
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="account-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                  placeholder="+6281234567890"
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => void requestPhoneCode()}
                  disabled={isSendingPhoneCode}
                  className="min-h-11 shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {isSendingPhoneCode ? 'Mengirim…' : 'Kirim OTP'}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Nomor baru hanya disimpan setelah kode OTP WhatsApp berhasil diverifikasi.
              </p>
            </div>
          </div>
          {pendingPhone && (
            <form onSubmit={verifyPhoneCode} className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <label htmlFor="account-phone-otp" className="block text-sm font-medium text-slate-700">
                Kode verifikasi untuk {pendingPhone}
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="account-phone-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={phoneCode}
                  onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="submit"
                  disabled={isVerifyingPhone || phoneCode.trim().length < 4}
                  className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
                >
                  {isVerifyingPhone ? 'Memverifikasi…' : 'Verifikasi'}
                </button>
              </div>
            </form>
          )}
          {phoneMessage && <p role="status" className="text-xs text-emerald-700">{phoneMessage}</p>}
          {phoneError && <p role="alert" className="text-xs text-rose-700">{phoneError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kata sandi</CardTitle>
          <CardDescription>Masukkan kata sandi saat ini untuk membuat perubahan.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="current-password" className="text-sm font-medium text-slate-700">Kata sandi saat ini</label>
              <PasswordInput
                id="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="new-password" className="text-sm font-medium text-slate-700">Kata sandi baru</label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">Konfirmasi kata sandi baru</label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            {passwordMessage && <p role="status" className="text-xs text-emerald-700 sm:col-span-2">{passwordMessage}</p>}
            {passwordError && <p role="alert" className="text-xs text-rose-700 sm:col-span-2">{passwordError}</p>}
            <button
              type="submit"
              disabled={isChangingPassword}
              className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
            >
              {isChangingPassword ? 'Menyimpan…' : 'Ubah kata sandi'}
            </button>
            <Link
              href="/lupa-sandi"
              className="text-xs font-semibold text-blue-700 underline sm:col-span-2 sm:justify-self-start"
            >
              Lupa kata sandi? Reset lewat WhatsApp
            </Link>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">PIN transaksi saldo</CardTitle>
          <CardDescription>
            PIN 6 angka dibutuhkan setiap kali Anda membayar pesanan menggunakan saldo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pinStatusError ? (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {pinStatusError}
            </p>
          ) : pinConfigured === null ? (
            <p role="status" className="text-sm text-slate-500">Memeriksa status PIN…</p>
          ) : (
            <form onSubmit={savePin} className="grid gap-4 sm:grid-cols-2">
              {pinConfigured && (
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="current-pin" className="text-sm font-medium text-slate-700">PIN saat ini</label>
                  <PasswordInput
                    id="current-pin"
                    inputMode="numeric"
                    autoComplete="current-password"
                    value={currentPin}
                    onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    required
                    className="tracking-[0.3em]"
                  />
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="new-pin" className="text-sm font-medium text-slate-700">PIN baru</label>
                <PasswordInput
                  id="new-pin"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={newPin}
                  onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required
                  className="tracking-[0.3em]"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="confirm-pin" className="text-sm font-medium text-slate-700">Konfirmasi PIN baru</label>
                <PasswordInput
                  id="confirm-pin"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={confirmPin}
                  onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required
                  className="tracking-[0.3em]"
                />
              </div>
              {pinMessage && <p role="status" className="text-xs text-emerald-700 sm:col-span-2">{pinMessage}</p>}
              {pinError && <p role="alert" className="text-xs text-rose-700 sm:col-span-2">{pinError}</p>}
              <button
                type="submit"
                disabled={isSavingPin}
                className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
              >
                {isSavingPin ? 'Menyimpan…' : pinConfigured ? 'Ganti PIN transaksi' : 'Atur PIN transaksi'}
              </button>
              <Link
                href="/lupa-pin"
                className="text-xs font-semibold text-blue-700 underline sm:col-span-2 sm:justify-self-start"
              >
                Lupa PIN transaksi? Reset lewat WhatsApp
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
