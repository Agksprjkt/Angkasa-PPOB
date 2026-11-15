import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { phoneNumber } from 'better-auth/plugins';
import { accounts, sessions, users, verifications } from './db/schema';
import { getDatabase } from './db/client';
import { databaseMode } from './db/database-mode';
import { sendWhatsAppOtp } from './whatsapp';
import { DEFAULT_STORE_NAME } from '@/lib/store-branding';

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const trustedOrigins = [
  new URL(baseURL).origin,
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
];

const createAuth = (secret: string) =>
  betterAuth({
    appName: DEFAULT_STORE_NAME,
    baseURL,
    trustedOrigins: [...new Set(trustedOrigins)],
    secret,
    database: drizzleAdapter(getDatabase(), {
      provider: databaseMode === 'postgres' ? 'pg' : 'sqlite',
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          input: false,
          defaultValue: 'user',
        },
        balance: {
          type: 'number',
          required: false,
          input: false,
          defaultValue: 0,
        },
        commissionBalance: {
          type: 'number',
          required: false,
          input: false,
          defaultValue: 0,
        },
      },
    },
    plugins: [
      phoneNumber({
        requireVerification: true,
        phoneNumberValidator: (phoneNumber) =>
          /^\+[1-9]\d{7,14}$/.test(phoneNumber),
        signUpOnVerification: {
          getTempEmail: (phoneNumber) =>
            `${phoneNumber.replace(/\D/g, '')}@phone.payku.invalid`,
          getTempName: () => `Pengguna ${DEFAULT_STORE_NAME}`,
        },
        sendOTP: ({ phoneNumber, code }) =>
          sendWhatsAppOtp(phoneNumber, code),
        sendPasswordResetOTP: ({ phoneNumber, code }) =>
          sendWhatsAppOtp(phoneNumber, code),
      }),
    ],
  });

type AuthInstance = ReturnType<typeof createAuth>;
let authInstance: AuthInstance | undefined;

export function getAuth(): AuthInstance {
  if (authInstance) return authInstance;

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error('Set BETTER_AUTH_SECRET before using authentication');
  }

  authInstance = createAuth(secret);
  return authInstance;
}
