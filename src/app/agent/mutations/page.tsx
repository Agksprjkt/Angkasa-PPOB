import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import CustomerHistoryPage from '@/components/CustomerHistoryPage';
import DashboardWorkspace from '@/components/DashboardWorkspace';
import { agentDashboardNavigation } from '@/lib/agent-dashboard-navigation';
import { getAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AgentMutationsPage() {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });

  if (!session) redirect('/');
  if (session.user.role !== 'agent') redirect('/');

  return (
    <DashboardWorkspace
      label="Mutasi"
      userName={session.user.name}
      navigation={agentDashboardNavigation}
    >
      <CustomerHistoryPage mode="wallet" />
    </DashboardWorkspace>
  );
}
