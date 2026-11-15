import { isAPIError } from 'better-auth/api';
import { getAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('newPassword' in body) ||
    typeof body.newPassword !== 'string'
  ) {
    return Response.json({ error: 'newPassword is required' }, { status: 400 });
  }

  const setPassword = getAuth().api.setPassword;
  if (!setPassword) {
    throw new Error('Password setting is not enabled in the auth configuration');
  }

  try {
    const result = await setPassword({
      body: { newPassword: body.newPassword },
      headers: request.headers,
    });
    return Response.json(result);
  } catch (error) {
    if (isAPIError(error)) {
      return Response.json(
        { error: error.body?.code ?? 'AUTH_ERROR', message: error.message },
        { status: error.statusCode },
      );
    }

    throw error;
  }
}
