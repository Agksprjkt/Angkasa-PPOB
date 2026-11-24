export type HistoryStatusFilter = 'all' | 'success' | 'pending' | 'failed';

export function parseStatusFilter(value: string | undefined | null): HistoryStatusFilter {
  if (value === 'success' || value === 'pending' || value === 'failed') return value;
  return 'all';
}
