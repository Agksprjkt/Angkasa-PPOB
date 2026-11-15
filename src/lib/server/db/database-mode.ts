import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type DatabaseMode = 'sqlite' | 'postgres';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export function getDatabaseMode(): DatabaseMode {
  const modeFile = process.env.DATABASE_MODE_FILE ||
    resolve(process.cwd(), '.data', 'database-mode.json');
  let contents: string;
  try {
    contents = readFileSync(/*turbopackIgnore: true*/ modeFile, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      const configured = process.env.DATABASE_PROVIDER ?? 'sqlite';
      if (configured === 'sqlite' || configured === 'postgres') return configured;
      throw new Error('DATABASE_PROVIDER must be "sqlite" or "postgres"');
    }
    throw new Error(`Failed to read database mode file: ${modeFile}`, { cause: error });
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Database mode file contains invalid JSON: ${modeFile}`, { cause: error });
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('mode' in value) ||
    (value.mode !== 'sqlite' && value.mode !== 'postgres')
  ) {
    throw new Error(`Database mode file must contain mode "sqlite" or "postgres": ${modeFile}`);
  }
  return value.mode;
}

export const databaseMode = getDatabaseMode();
