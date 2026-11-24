import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import CustomerHistoryPage from '@/components/CustomerHistoryPage';
import DashboardWorkspace from '@/components/DashboardWorkspace';
import { customerDashboardNavigation } from '@/lib/customer-dashboard-navigation';
import { getAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CustomerMutationsPage() {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });

  if (!session) redirect('/');
  if (session.user.role === 'admin') redirect('/admin');
  if (session.user.role === 'agent') redirect('/agent');
  if (session.user.role !== 'user') redirect('/');

  return (
    <DashboardWorkspace
      label="Mutasi"
      userName={session.user.name}
      navigation={customerDashboardNavigation}
    >
      <CustomerHistoryPage mode="wallet" />
    </DashboardWorkspace>
  );
}
