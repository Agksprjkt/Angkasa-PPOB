import { Suspense } from 'react';
import { RecoveryResetForm } from '@/components/RecoveryFlow';

export const metadata = { title: 'Kata sandi baru' };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <RecoveryResetForm purpose="password" />
    </Suspense>
  );
}
