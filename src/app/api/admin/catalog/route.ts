import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import {
  parseGroupInput,
  parseRuleInput,
  parseSubgroupInput,
} from '@/lib/catalog-admin-core';
import { isAdministrator } from '@/lib/server/authorization';
import { invalidateCatalog } from '@/lib/server/catalog-cache';
import {
  applyCatalogRules,
  listCatalogGroups,
  listCatalogRules,
  listCatalogSubgroups,
} from '@/lib/server/catalog';
import { getDatabase } from '@/lib/server/db/client';
import {
  catalogGroups,
  catalogRules,
  catalogSubgroups,
} from '@/lib/server/db/schema';

export const runtime = 'nodejs';

// One route for the three catalog resources: they are only ever edited together
// from the same admin panel, so splitting them into six files added no clarity.
type Resource = 'groups' | 'subgroups' | 'rules';

function resourceOf(value: unknown): Resource | null {
  return value === 'groups' || value === 'subgroups' || value === 'rules' ? value : null;
}

async function readBody(request: NextRequest) {
  try {
    const payload: unknown = await request.json();
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  try {
    const [groups, subgroups, rules] = await Promise.all([
      listCatalogGroups(),
      listCatalogSubgroups(),
      listCatalogRules(),
    ]);
    return NextResponse.json(
      { groups, subgroups, rules },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      '[ADMIN_CATALOG_GET_FAILED]',
      error instanceof Error ? error.message : 'Unknown catalog error',
    );
    return NextResponse.json({ error: 'CATALOG_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const body = await readBody(request);
  const resource = resourceOf(body?.resource);
  if (!body || !resource) {
    return NextResponse.json({ error: 'INVALID_CATALOG_REQUEST' }, { status: 400 });
  }

  // "Apply" is the only action that rewrites many rows, so it is explicit.
  if (resource === 'rules' && body.action === 'apply') {
    try {
      const result = await applyCatalogRules();
      await invalidateCatalog();
      return NextResponse.json(result);
    } catch (error) {
      console.error(
        '[ADMIN_CATALOG_APPLY_FAILED]',
        error instanceof Error ? error.message : 'Unknown catalog error',
      );
      return NextResponse.json({ error: 'CATALOG_APPLY_FAILED' }, { status: 503 });
    }
  }

  try {
    const db = getDatabase();
    if (resource === 'groups') {
      const input = parseGroupInput(body);
      if (!input) {
        return NextResponse.json({ error: 'INVALID_CATALOG_GROUP' }, { status: 400 });
      }
      const [created] = await db
        .insert(catalogGroups)
        .values({ id: randomUUID(), ...input })
        .returning();
      await invalidateCatalog();
      return NextResponse.json({ group: created }, { status: 201 });
    }
    if (resource === 'subgroups') {
      const input = parseSubgroupInput(body);
      if (!input) {
        return NextResponse.json({ error: 'INVALID_CATALOG_SUBGROUP' }, { status: 400 });
      }
      const [created] = await db
        .insert(catalogSubgroups)
        .values({ id: randomUUID(), ...input })
        .returning();
      await invalidateCatalog();
      return NextResponse.json({ subgroup: created }, { status: 201 });
    }
    const input = parseRuleInput(body);
    if (!input) {
      return NextResponse.json({ error: 'INVALID_CATALOG_RULE' }, { status: 400 });
    }
    const [created] = await db
      .insert(catalogRules)
      .values({ id: randomUUID(), ...input })
      .returning();
    await invalidateCatalog();
    return NextResponse.json({ rule: created }, { status: 201 });
  } catch (error) {
    console.error(
      '[ADMIN_CATALOG_CREATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown catalog error',
    );
    return NextResponse.json({ error: 'CATALOG_CREATE_FAILED' }, { status: 409 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const body = await readBody(request);
  const resource = resourceOf(body?.resource);
  if (!body || !resource || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'INVALID_CATALOG_REQUEST' }, { status: 400 });
  }
  const id = body.id;

  try {
    const db = getDatabase();
    if (resource === 'groups') {
      // A partial body (the enable toggle sends only `enabled`) is merged onto
      // the stored row, so a toggle never has to resend the whole record.
      const [existing] = await db
        .select()
        .from(catalogGroups)
        .where(eq(catalogGroups.id, id))
        .limit(1);
      if (!existing) {
        return NextResponse.json({ error: 'CATALOG_GROUP_NOT_FOUND' }, { status: 404 });
      }
      const input = parseGroupInput({ ...existing, ...body });
      if (!input) {
        return NextResponse.json({ error: 'INVALID_CATALOG_GROUP' }, { status: 400 });
      }
      const [updated] = await db
        .update(catalogGroups)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(catalogGroups.id, id))
        .returning();
      await invalidateCatalog();
      return NextResponse.json({ group: updated });
    }
    if (resource === 'subgroups') {
      const [existing] = await db
        .select()
        .from(catalogSubgroups)
        .where(eq(catalogSubgroups.id, id))
        .limit(1);
      if (!existing) {
        return NextResponse.json({ error: 'CATALOG_SUBGROUP_NOT_FOUND' }, { status: 404 });
      }
      const input = parseSubgroupInput({ ...existing, ...body });
      if (!input) {
        return NextResponse.json({ error: 'INVALID_CATALOG_SUBGROUP' }, { status: 400 });
      }
      const [updated] = await db
        .update(catalogSubgroups)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(catalogSubgroups.id, id))
        .returning();
      await invalidateCatalog();
      return NextResponse.json({ subgroup: updated });
    }
    const [existingRule] = await db
      .select()
      .from(catalogRules)
      .where(eq(catalogRules.id, id))
      .limit(1);
    if (!existingRule) {
      return NextResponse.json({ error: 'CATALOG_RULE_NOT_FOUND' }, { status: 404 });
    }
    const input = parseRuleInput({ ...existingRule, ...body });
    if (!input) {
      return NextResponse.json({ error: 'INVALID_CATALOG_RULE' }, { status: 400 });
    }
    const [updated] = await db
      .update(catalogRules)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(catalogRules.id, id))
      .returning();
    await invalidateCatalog();
    return NextResponse.json({ rule: updated });
  } catch (error) {
    console.error(
      '[ADMIN_CATALOG_UPDATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown catalog error',
    );
    return NextResponse.json({ error: 'CATALOG_UPDATE_FAILED' }, { status: 409 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const params = request.nextUrl.searchParams;
  const resource = resourceOf(params.get('resource'));
  const id = params.get('id');
  if (!resource || !id) {
    return NextResponse.json({ error: 'INVALID_CATALOG_REQUEST' }, { status: 400 });
  }

  try {
    const db = getDatabase();
    if (resource === 'groups') {
      const [removed] = await db
        .delete(catalogGroups)
        .where(eq(catalogGroups.id, id))
        .returning({ id: catalogGroups.id });
      if (!removed) {
        return NextResponse.json({ error: 'CATALOG_ROW_NOT_FOUND' }, { status: 404 });
      }
    } else if (resource === 'subgroups') {
      const [removed] = await db
        .delete(catalogSubgroups)
        .where(eq(catalogSubgroups.id, id))
        .returning({ id: catalogSubgroups.id });
      if (!removed) {
        return NextResponse.json({ error: 'CATALOG_ROW_NOT_FOUND' }, { status: 404 });
      }
    } else {
      const [removed] = await db
        .delete(catalogRules)
        .where(eq(catalogRules.id, id))
        .returning({ id: catalogRules.id });
      if (!removed) {
        return NextResponse.json({ error: 'CATALOG_ROW_NOT_FOUND' }, { status: 404 });
      }
    }
    await invalidateCatalog();
    return NextResponse.json({ id });
  } catch (error) {
    console.error(
      '[ADMIN_CATALOG_DELETE_FAILED]',
      error instanceof Error ? error.message : 'Unknown catalog error',
    );
    return NextResponse.json({ error: 'CATALOG_DELETE_FAILED' }, { status: 503 });
  }
}
