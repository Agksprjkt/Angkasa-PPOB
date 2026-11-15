'use client';

import { createAuthClient } from 'better-auth/react';
import {
  inferAdditionalFields,
  phoneNumberClient,
} from 'better-auth/client/plugins';
import type { getAuth } from '@/lib/server/auth';

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<ReturnType<typeof getAuth>>(),
    phoneNumberClient(),
  ],
});
