import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import CustomerAccountSettings from '@/components/CustomerAccountSettings';
import DashboardWorkspace from '@/components/DashboardWorkspace';
import { agentDashboardNavigation } from '@/lib/agent-dashboard-navigation';
import { getAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AgentSettingsPage() {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });

  if (!session) redirect('/');
  if (session.user.role !== 'agent') redirect('/');

  return (
    <DashboardWorkspace
      label="Pengaturan"
      userName={session.user.name}
      navigation={agentDashboardNavigation}
    >
      <CustomerAccountSettings
        initialName={session.user.name}
        email={session.user.email}
        initialPhone={session.user.phoneNumber ?? ''}
      />
    </DashboardWorkspace>
  );
}
