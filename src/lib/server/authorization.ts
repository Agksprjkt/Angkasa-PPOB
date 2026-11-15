import 'server-only';

import { getAuth } from '@/lib/server/auth';

export async function isAdministrator(requestHeaders: Headers) {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  return session?.user.role === 'admin';
}
