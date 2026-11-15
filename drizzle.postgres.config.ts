import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/server/db/schema.postgres.ts',
  out: './drizzle/postgres-runtime',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/ppob',
  },
  strict: true,
  verbose: true,
});
