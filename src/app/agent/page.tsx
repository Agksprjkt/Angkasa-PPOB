import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AgentDashboard from '@/components/AgentDashboard';
import DashboardWorkspace from '@/components/DashboardWorkspace';
import { agentDashboardNavigation } from '@/lib/agent-dashboard-navigation';
import { getAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AgentPage() {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== 'agent') {
    redirect('/');
  }

  return (
    <DashboardWorkspace
      label="Portal Member"
      userName={session.user.name}
      navigation={agentDashboardNavigation}
    >
      <AgentDashboard />
    </DashboardWorkspace>
  );
}
