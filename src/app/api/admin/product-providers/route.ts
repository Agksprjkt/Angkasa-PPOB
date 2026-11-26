import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { isAdministrator } from '@/lib/server/authorization';
import { getDatabase } from '@/lib/server/db/client';
import { productProviderSettings, products } from '@/lib/server/db/schema';
import type { ProductCategory } from '@/types/ppob';

export const runtime = 'nodejs';

const categories: ProductCategory[] = [
  'pulsa',
  'data',
  'voucher',
  'pln',
  'tagihan',
  'ewallet',
  'game',
];

function isProviderInput(value: unknown): value is {
  category: ProductCategory;
  operator: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return typeof input.category === 'string' &&
    categories.includes(input.category as ProductCategory) &&
    typeof input.operator === 'string' &&
    input.operator.trim().length > 0 &&
    input.operator.length <= 200;
}

export async function GET(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const category = request.nextUrl.searchParams.get('category');
  const operator = request.nextUrl.searchParams.get('operator');
  if (!isProviderInput({ category, operator })) {
    return NextResponse.json({ error: 'INVALID_PROVIDER' }, { status: 400 });
  }
  const providerCategory = category as ProductCategory;
  const providerName = (operator as string).trim();

  const [settings] = await getDatabase()
    .select()
    .from(productProviderSettings)
    .where(and(
      eq(productProviderSettings.category, providerCategory),
      eq(productProviderSettings.operator, providerName),
    ))
    .limit(1);
  return NextResponse.json({
    settings: settings ?? {
      id: null,
      category: providerCategory,
      operator: providerName,
      description: '',
      iconUrl: null,
      coverUrl: null,
      pricingType: 'fixed',
      pricingValue: 0,
      memberPricingType: 'fixed',
      memberPricingValue: 0,
      aliasOf: null,
    },
  });
}

export async function PUT(request: NextRequest) {
  if (!(await isAdministrator(request.headers))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  if (!isProviderInput(payload)) {
    return NextResponse.json({ error: 'INVALID_PROVIDER' }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const description = body.description;
  const iconUrl = body.iconUrl;
  const coverUrl = body.coverUrl;
  const pricingType = body.pricingType;
  const pricingValue = body.pricingValue;
  const memberPricingType = body.memberPricingType ?? pricingType;
  const memberPricingValue = body.memberPricingValue ?? pricingValue;
  const applyPrices = body.applyPrices === true;
  // Empty or missing alias means "stand alone"; anything else points at another
  // operator in the same category so both vendors share one storefront card.
  const rawAlias = body.aliasOf;
  const aliasOf = typeof rawAlias === 'string' && rawAlias.trim()
    ? rawAlias.trim().slice(0, 200)
    : null;
  if (
    rawAlias !== undefined && rawAlias !== null && typeof rawAlias !== 'string'
  ) {
    return NextResponse.json({ error: 'INVALID_PROVIDER_SETTINGS' }, { status: 400 });
  }
  if (
    typeof description !== 'string' || description.length > 2000 ||
    (iconUrl !== null && typeof iconUrl !== 'string') ||
    (coverUrl !== null && typeof coverUrl !== 'string') ||
    (typeof iconUrl === 'string' && iconUrl.length > 300) ||
    (typeof coverUrl === 'string' && coverUrl.length > 300) ||
    (pricingType !== 'fixed' && pricingType !== 'percent') ||
    !Number.isSafeInteger(pricingValue) ||
    Number(pricingValue) < 0 ||
    (pricingType === 'percent' && Number(pricingValue) > 100) ||
    (pricingType === 'fixed' && Number(pricingValue) > 1_000_000) ||
    (memberPricingType !== 'fixed' && memberPricingType !== 'percent') ||
    !Number.isSafeInteger(memberPricingValue) ||
    Number(memberPricingValue) < 0 ||
    (memberPricingType === 'percent' && Number(memberPricingValue) > 100) ||
    (memberPricingType === 'fixed' && Number(memberPricingValue) > 1_000_000)
  ) {
    return NextResponse.json({ error: 'INVALID_PROVIDER_SETTINGS' }, { status: 400 });
  }

  const normalizedOperator = (payload as { operator: string }).operator.trim();
  const db = getDatabase();
  try {
    const [savedSettings] = await db.transaction(async (tx) => {
      await tx
        .insert(productProviderSettings)
        .values({
          id: randomUUID(),
          category: (payload as { category: ProductCategory }).category,
          operator: normalizedOperator,
          description,
          iconUrl,
          coverUrl,
          pricingType,
          pricingValue: Number(pricingValue),
          memberPricingType,
          memberPricingValue: Number(memberPricingValue),
          aliasOf,
        })
        .onConflictDoUpdate({
          target: [productProviderSettings.category, productProviderSettings.operator],
          set: {
            description,
            iconUrl,
            coverUrl,
            pricingType,
            pricingValue: Number(pricingValue),
            memberPricingType,
            memberPricingValue: Number(memberPricingValue),
            aliasOf,
            updatedAt: new Date(),
          },
        });

      if (applyPrices) {
        const providerProducts = await tx
          .select()
          .from(products)
          .where(and(
            eq(products.category, (payload as { category: ProductCategory }).category),
            eq(products.operator, normalizedOperator),
          ));
        for (const product of providerProducts) {
          const markup = pricingType === 'percent'
            ? Math.round(product.basePrice * Number(pricingValue) / 100)
            : Number(pricingValue);
          const memberMarkup = memberPricingType === 'percent'
            ? Math.round(product.basePrice * Number(memberPricingValue) / 100)
            : Number(memberPricingValue);
          await tx
            .update(products)
            .set({
              sellPriceUser: product.basePrice + markup,
              sellPriceAgent: product.basePrice + memberMarkup,
              updatedAt: new Date(),
            })
            .where(eq(products.id, product.id));
        }
      }

      return tx
        .select()
        .from(productProviderSettings)
        .where(and(
          eq(productProviderSettings.category, (payload as { category: ProductCategory }).category),
          eq(productProviderSettings.operator, normalizedOperator),
        ))
        .limit(1);
    });

    return NextResponse.json({ settings: savedSettings });
  } catch (error) {
    console.error(
      '[ADMIN_PRODUCT_PROVIDER_UPDATE_FAILED]',
      error instanceof Error ? error.message : 'Unknown provider settings error',
    );
    return NextResponse.json({ error: 'PROVIDER_SETTINGS_SAVE_FAILED' }, { status: 500 });
  }
}
