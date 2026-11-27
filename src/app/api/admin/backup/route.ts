import { gzipSync, gunzipSync } from 'node:zlib';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db/client';
import { databaseMode } from '@/lib/server/db/database-mode';
import { snapshotTables, tableByName } from '@/lib/server/db/snapshot-schema';
import { invalidateCatalog } from '@/lib/server/catalog-cache';
import {
  backupFileName,
  createDump,
  decodeRows,
  encodeRows,
  parseDump,
  sortTables,
} from '@/lib/db-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Restoring replaces every row, so a single wrong click would be unrecoverable
// without an off-site copy. The text confirmation is the cheap guard.
const CONFIRM_PHRASE = 'RESTORE';
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
const INSERT_BATCH = 500;

// Drizzle's select/insert/delete builders are dialect-parameterised, so the
// generic route code talks to them through this narrow shape instead of
// branching on the provider at every call site.
type LooseDb = {
  select: () => { from: (table: unknown) => Promise<Record<string, unknown>[]> };
  insert: (table: unknown) => { values: (rows: Record<string, unknown>[]) => Promise<unknown> };
  delete: (table: unknown) => Promise<unknown>;
  transaction: <T>(fn: (tx: LooseDb) => Promise<T>) => Promise<T>;
};

const db = () => getDatabase() as unknown as LooseDb;

async function requireAdmin(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.role === 'admin';
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  try {
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const table of snapshotTables) {
      const rows = await db().select().from(tableByName.get(table.name));
      tables[table.name] = encodeRows(rows, table.columns);
    }
    const payload = JSON.stringify(createDump(databaseMode, tables));
    const body = gzipSync(Buffer.from(payload, 'utf8'));
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${backupFileName()}.gz"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error(
      '[ADMIN_BACKUP_EXPORT_FAILED]',
      error instanceof Error ? error.message : 'Unknown backup error',
    );
    return NextResponse.json({ error: 'BACKUP_FAILED' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'INVALID_BACKUP_FILE' }, { status: 400 });
  }
  if (String(form.get('confirm') ?? '').trim() !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: 'RESTORE_NOT_CONFIRMED' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'INVALID_BACKUP_FILE' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'BACKUP_FILE_TOO_LARGE' }, { status: 413 });
  }

  const raw = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    // A gzip header means the file came from this endpoint; plain JSON is
    // accepted too so a hand-edited dump can still be restored.
    text = (raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString('utf8');
  } catch {
    return NextResponse.json({ error: 'INVALID_BACKUP_FILE' }, { status: 400 });
  }

  let dump;
  try {
    dump = parseDump(text, snapshotTables, databaseMode);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_BACKUP_FILE';
    return NextResponse.json({ error: code }, { status: 400 });
  }

  const ordered = sortTables(snapshotTables);
  try {
    await db().transaction(async (tx) => {
      for (const table of [...ordered].reverse()) {
        await tx.delete(tableByName.get(table.name));
      }
      for (const table of ordered) {
        const rows = decodeRows(dump.tables[table.name] ?? [], table.columns);
        for (let index = 0; index < rows.length; index += INSERT_BATCH) {
          await tx.insert(tableByName.get(table.name)).values(rows.slice(index, index + INSERT_BATCH));
        }
      }
    });
  } catch (error) {
    console.error(
      '[ADMIN_BACKUP_RESTORE_FAILED]',
      error instanceof Error ? error.message : 'Unknown restore error',
    );
    return NextResponse.json({ error: 'RESTORE_FAILED' }, { status: 503 });
  }

  await invalidateCatalog().catch(() => undefined);
  return NextResponse.json({
    ok: true,
    restoredAt: new Date().toISOString(),
    tables: Object.fromEntries(ordered.map((table) => [table.name, dump.tables[table.name].length])),
  });
}
