import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminPanel from '@/components/AdminPanel';
import DashboardWorkspace from '@/components/DashboardWorkspace';
import { getAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== 'admin') {
    redirect('/admin/login');
  }

  return (
    <DashboardWorkspace label="Dashboard Admin" userName={session.user.name}>
      <AdminPanel />
    </DashboardWorkspace>
  );
}
