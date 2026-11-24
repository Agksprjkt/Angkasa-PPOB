import { RecoveryFlow } from '@/components/RecoveryFlow';

export const metadata = { title: 'Lupa kata sandi' };

export default function ForgotPasswordPage() {
  return <RecoveryFlow purpose="password" />;
}
