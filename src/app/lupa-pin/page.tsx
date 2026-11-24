import { RecoveryFlow } from '@/components/RecoveryFlow';

export const metadata = { title: 'Lupa PIN transaksi' };

export default function ForgotPinPage() {
  return <RecoveryFlow purpose="pin" />;
}
