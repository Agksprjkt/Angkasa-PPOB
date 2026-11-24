import { Suspense } from 'react';
import { RecoveryResetForm } from '@/components/RecoveryFlow';

export const metadata = { title: 'PIN transaksi baru' };

export default function ResetPinPage() {
  return (
    <Suspense fallback={null}>
      <RecoveryResetForm purpose="pin" />
    </Suspense>
  );
}
