import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Boxes, LayoutDashboard, Store } from 'lucide-react';
import AgentDashboard from '@/components/AgentDashboard';
import DashboardWorkspace from '@/components/DashboardWorkspace';
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
      navigation={[
        { label: 'Ringkasan', href: '#agent-overview', icon: LayoutDashboard },
        { label: 'Konter & struk', href: '#agent-counter', icon: Store },
        { label: 'Katalog member', href: '#agent-catalog', icon: Boxes },
      ]}
    >
      <AgentDashboard />
    </DashboardWorkspace>
  );
}
