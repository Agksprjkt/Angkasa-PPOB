import type { products } from '@/lib/server/db/schema';

type ProductStatusUpdate = Partial<typeof products.$inferInsert>;

/**
 * An admin flipping the switch is a merchandising decision, so it is recorded as
 * such. The vendor sync only revives products it disabled itself, and this marker
 * is what keeps a deliberate "off" off.
 */
export function adminStatusUpdate(status: 'active' | 'inactive'): ProductStatusUpdate {
  if (status === 'active') {
    return {
      status,
      disabledBy: null,
      disabledReason: null,
      disabledAt: null,
      failureStreak: 0,
      updatedAt: new Date(),
    };
  }
  return {
    status,
    disabledBy: 'admin',
    disabledReason: 'Dinonaktifkan admin',
    disabledAt: new Date(),
    updatedAt: new Date(),
  };
}
