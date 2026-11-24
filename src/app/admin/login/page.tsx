import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminLoginForm from '@/components/AdminLoginForm';
import { Card, CardContent } from '@/components/ui/card';
import { getAuth } from '@/lib/server/auth';
import { getStoreSettings } from '@/lib/server/store-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Masuk dashboard',
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session?.user.role === 'admin') redirect('/admin');

  const settings = await getStoreSettings();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              {settings.storeName}
            </p>
            <h1 className="text-xl font-bold text-slate-900">Masuk dashboard</h1>
            <p className="text-xs text-slate-500">
              Storefront publik sedang ditutup. Hanya administrator yang dapat masuk.
            </p>
          </div>
          <AdminLoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
