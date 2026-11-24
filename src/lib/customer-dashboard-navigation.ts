import type { DashboardNavigationItem } from '@/components/DashboardWorkspace';

export const customerDashboardNavigation = [
  { label: 'Ringkasan', href: '/dashboard', icon: 'layoutDashboard' },
  { label: 'Transaksi', href: '/dashboard/transactions', icon: 'receiptText' },
  { label: 'Mutasi', href: '/dashboard/mutations', icon: 'wallet' },
  { label: 'Pengaturan', href: '/dashboard/settings', icon: 'settings' },
] satisfies DashboardNavigationItem[];
