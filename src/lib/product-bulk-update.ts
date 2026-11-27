// Pure validation for the bulk status endpoint. Kept free of imports so the
// route and the tests can share it without a database.
export type BulkStatusInput = {
  ids: string[];
  status: 'active' | 'inactive';
};

export const maxBulkStatusIds = 1000;

export function parseBulkStatusInput(
  value: unknown,
): { ok: true; input: BulkStatusInput } | { ok: false; error: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: 'INVALID_PRODUCT_UPDATE' };
  }
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return { ok: false, error: 'INVALID_PRODUCT_IDS' };
  }
  if (body.ids.length > maxBulkStatusIds) {
    return { ok: false, error: 'TOO_MANY_PRODUCTS' };
  }
  const ids: string[] = [];
  for (const id of body.ids) {
    if (typeof id !== 'string' || !id.trim() || id.length > 100) {
      return { ok: false, error: 'INVALID_PRODUCT_IDS' };
    }
    if (!ids.includes(id)) ids.push(id);
  }
  if (body.status !== 'active' && body.status !== 'inactive') {
    return { ok: false, error: 'INVALID_PRODUCT_STATUS' };
  }
  return { ok: true, input: { ids, status: body.status } };
}

export type BulkSubgroupInput = {
  ids: string[];
  subgroupId: string | null;
};

// Same id rules as the status path; a null subgroupId means "hide these from the
// storefront", which is a valid admin intent rather than an invalid request.
export function parseBulkSubgroupInput(
  value: unknown,
): { ok: true; input: BulkSubgroupInput } | { ok: false; error: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: 'INVALID_PRODUCT_UPDATE' };
  }
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return { ok: false, error: 'INVALID_PRODUCT_IDS' };
  }
  if (body.ids.length > maxBulkStatusIds) {
    return { ok: false, error: 'TOO_MANY_PRODUCTS' };
  }
  const ids: string[] = [];
  for (const id of body.ids) {
    if (typeof id !== 'string' || !id.trim() || id.length > 100) {
      return { ok: false, error: 'INVALID_PRODUCT_IDS' };
    }
    if (!ids.includes(id)) ids.push(id);
  }
  if (!('subgroupId' in body)) {
    return { ok: false, error: 'INVALID_CATALOG_SUBGROUP' };
  }
  const subgroupId = body.subgroupId;
  if (subgroupId !== null && (typeof subgroupId !== 'string' || !subgroupId.trim() || subgroupId.length > 128)) {
    return { ok: false, error: 'INVALID_CATALOG_SUBGROUP' };
  }
  return {
    ok: true,
    input: { ids, subgroupId: subgroupId === null ? null : subgroupId.trim() },
  };
}
