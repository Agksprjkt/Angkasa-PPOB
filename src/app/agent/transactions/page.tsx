import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import CustomerHistoryPage from '@/components/CustomerHistoryPage';
import DashboardWorkspace from '@/components/DashboardWorkspace';
import { agentDashboardNavigation } from '@/lib/agent-dashboard-navigation';
import { parseStatusFilter } from '@/lib/history-status';
import { getAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AgentTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });

  if (!session) redirect('/');
  if (session.user.role !== 'agent') redirect('/');

  const { status } = await searchParams;

  return (
    <DashboardWorkspace
      label="Transaksi"
      userName={session.user.name}
      navigation={agentDashboardNavigation}
    >
      <CustomerHistoryPage mode="transactions" initialStatus={parseStatusFilter(status)} />
    </DashboardWorkspace>
  );
}
