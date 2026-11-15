import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/server/db/schema.sqlite.ts',
  out: './drizzle',
  dbCredentials: {
    url: 'file:.data/app.db',
  },
  strict: true,
  verbose: true,
});
