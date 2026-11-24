import { NextRequest, NextResponse } from 'next/server';
import { clientAddress } from '@/lib/server/rate-limit';
import {
  requestRecoveryOtp,
  resetPasswordWithGrant,
  resetPinWithGrant,
  verifyRecoveryOtp,
} from '@/lib/server/recovery';
import { isRecoveryPurpose } from '@/lib/server/recovery-core';

export const runtime = 'nodejs';

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: NextRequest) {
  if (Number(request.headers.get('content-length') ?? 0) > 4_096) {
    return noStore({ error: 'REQUEST_TOO_LARGE' }, 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStore({ error: 'INVALID_JSON' }, 400);
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    !('step' in payload) ||
    !('purpose' in payload)
  ) {
    return noStore({ error: 'INVALID_REQUEST' }, 400);
  }

  const body = payload as Record<string, unknown>;
  if (!isRecoveryPurpose(body.purpose)) {
    return noStore({ error: 'INVALID_PURPOSE' }, 400);
  }
  const purpose = body.purpose;

  if (body.step === 'request') {
    if (typeof body.phoneNumber !== 'string') {
      return noStore({ error: 'INVALID_PHONE_NUMBER' }, 400);
    }
    const result = await requestRecoveryOtp(
      purpose,
      body.phoneNumber,
      clientAddress(request),
    );
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({ status: true, phoneNumber: result.value.phoneNumber });
  }

  if (body.step === 'verify') {
    if (typeof body.phoneNumber !== 'string' || typeof body.otp !== 'string') {
      return noStore({ error: 'INVALID_OTP' }, 400);
    }
    const result = await verifyRecoveryOtp(purpose, body.phoneNumber, body.otp);
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({
      status: true,
      phoneNumber: result.value.phoneNumber,
      grant: result.value.grant,
    });
  }

  if (body.step === 'reset') {
    if (typeof body.grant !== 'string') {
      return noStore({ error: 'RECOVERY_GRANT_INVALID' }, 400);
    }
    const result = purpose === 'password'
      ? await resetPasswordWithGrant(
        body.grant,
        typeof body.newPassword === 'string' ? body.newPassword : '',
      )
      : await resetPinWithGrant(
        body.grant,
        typeof body.newPin === 'string' ? body.newPin : '',
      );
    if (!result.ok) return noStore({ error: result.error }, result.status);
    return noStore({
      status: true,
      phoneNumber: result.value.phoneNumber,
      ...('email' in result.value ? { email: result.value.email } : {}),
    });
  }

  return noStore({ error: 'INVALID_STEP' }, 400);
}
