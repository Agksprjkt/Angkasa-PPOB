import type { DashboardNavigationItem } from '@/components/DashboardWorkspace';

export const agentDashboardNavigation = [
  { label: 'Ringkasan', href: '/agent', icon: 'layoutDashboard' },
  { label: 'Transaksi', href: '/agent/transactions', icon: 'receiptText' },
  { label: 'Mutasi', href: '/agent/mutations', icon: 'wallet' },
  { label: 'Pengaturan', href: '/agent/settings', icon: 'settings' },
] satisfies DashboardNavigationItem[];
