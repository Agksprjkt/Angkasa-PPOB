'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

function toInternationalPhoneNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
  if (digits.startsWith('62')) return `+${digits}`;
  if (digits.startsWith('8')) return `+62${digits}`;
  return `+${digits}`;
}

export default function AdminLoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const { error: signInError } = await authClient.signIn.phoneNumber({
        phoneNumber: toInternationalPhoneNumber(phone),
        password,
      });
      if (signInError) {
        setError(signInError.message ?? 'Nomor atau kata sandi salah.');
        return;
      }
      const session = await authClient.getSession();
      if (session.data?.user.role !== 'admin') {
        setError('Akun ini bukan administrator.');
        return;
      }
      router.replace('/admin');
      router.refresh();
    } catch {
      setError('Tidak dapat menghubungi server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="admin-phone">Nomor handphone</Label>
        <Input
          id="admin-phone"
          type="tel"
          autoComplete="username"
          placeholder="081234567890"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="admin-password">Kata sandi</Label>
        <Input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Memeriksa…' : 'Masuk ke dashboard'}
      </Button>
    </form>
  );
}
