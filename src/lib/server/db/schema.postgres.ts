import { sql } from 'drizzle-orm';
import {
  bigint as pgBigint,
  boolean as pgBoolean,
  check,
  index,
  integer as pgInteger,
  jsonb,
  pgTable,
  text as pgText,
  timestamp as pgTimestamp,
  uniqueIndex,
  type PgBooleanBuilderInitial,
  type PgIntegerBuilderInitial,
  type PgTimestampBuilderInitial,
} from 'drizzle-orm/pg-core';
import type {
  ProductCategory,
  TransactionStatus,
} from '@/types/ppob';
import type { ProductVendor } from '../../vendor-registry';
import { DEFAULT_STORE_NAME } from '../../store-branding';

type PgIntegerColumn =
  | PgIntegerBuilderInitial<string>
  | PgBooleanBuilderInitial<string>
  | PgTimestampBuilderInitial<string>;

function integer<TName extends string>(name: TName, options: { mode: 'timestamp_ms' }): PgTimestampBuilderInitial<TName>;
function integer<TName extends string>(name: TName, options: { mode: 'boolean' }): PgBooleanBuilderInitial<TName>;
function integer<TName extends string>(name: TName): PgIntegerBuilderInitial<TName>;
function integer(name: string, options?: { mode: 'timestamp_ms' | 'boolean' }): PgIntegerColumn {
  if (options?.mode === 'timestamp_ms') {
    return pgTimestamp(name, { withTimezone: true, mode: 'date' });
  }
  if (options?.mode === 'boolean') return pgBoolean(name);
  return pgInteger(name);
}

const text = pgText;
const bigint = (name: string) => pgBigint(name, { mode: 'number' });

const createdAt = () =>
  pgTimestamp('createdAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow();
const updatedAt = () =>
  pgTimestamp('updatedAt', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow();

export const users = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: integer('emailVerified', { mode: 'boolean' })
      .notNull()
      .default(false),
    image: text('image'),
    phoneNumber: text('phoneNumber').unique(),
    phoneNumberVerified: integer('phoneNumberVerified', { mode: 'boolean' })
      .notNull()
      .default(false),
    role: text('role').$type<'user' | 'agent' | 'admin'>().notNull().default('user'),
    balance: bigint('balance').notNull().default(0),
    commissionBalance: bigint('commissionBalance')
      .notNull()
      .default(0),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  },
);

export const transactionPins = pgTable(
  'transaction_pins',
  {
    userId: text('userId')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    pinHash: text('pinHash').notNull(),
    failedAttempts: integer('failedAttempts').notNull().default(0),
    lockedUntil: integer('lockedUntil', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check('transaction_pins_attempts_nonnegative', sql`${table.failedAttempts} >= 0`),
  ],
);

export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', {
    mode: 'timestamp_ms',
  }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {
    mode: 'timestamp_ms',
  }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
});

export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }),
});

export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    vendorCode: text('vendorCode').notNull(),
    name: text('name').notNull(),
    category: text('category').$type<ProductCategory>().notNull(),
    operator: text('operator').notNull(),
    // Digiflazz groups one brand into several series ("type" in their price list),
    // e.g. XL -> FlexMax / Xtra Combo Flex / Combo Lite.
    variant: text('variant'),
    variantSource: text('variantSource')
      .$type<'sync' | 'manual'>()
      .notNull()
      .default('sync'),
    description: text('description').notNull().default(''),
    basePrice: bigint('basePrice').notNull(),
    sellPriceUser: bigint('sellPriceUser').notNull(),
    sellPriceAgent: bigint('sellPriceAgent').notNull(),
    compareAtPrice: bigint('compareAtPrice'),
    status: text('status').$type<'active' | 'inactive'>().notNull().default('active'),
    vendor: text('vendor').$type<ProductVendor>().notNull(),
    // Free-text source marker shown on the storefront, e.g. "Server 1". Empty
    // means the vendor name is used instead.
    vendorLabel: text('vendorLabel'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // A vendor code is only unique inside its own vendor: Digiflazz and
    // TokoVoucher both ship an "FF5".
    uniqueIndex('products_vendor_code_unique').on(table.vendor, table.vendorCode),
    index('products_category_status_idx').on(table.category, table.status),
    index('products_variant_idx').on(table.category, table.operator, table.variant),
    index('products_vendor_status_idx').on(table.vendor, table.status),
    check('products_prices_nonnegative', sql`
      ${table.basePrice} >= 0
      AND ${table.sellPriceUser} >= 0
      AND ${table.sellPriceAgent} >= 0
    `),
  ],
);

export const promotionalBanners = pgTable(
  'promotional_banners',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    imageUrl: text('imageUrl').notNull(),
    targetPath: text('targetPath').notNull(),
    buttonLabel: text('buttonLabel').notNull().default('Lihat Promo'),
    sortOrder: integer('sortOrder').notNull().default(0),
    startsAt: integer('startsAt', { mode: 'timestamp_ms' }),
    endsAt: integer('endsAt', { mode: 'timestamp_ms' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('promotional_banners_enabled_sort_idx').on(table.enabled, table.sortOrder),
    check('promotional_banners_valid_schedule', sql`
      ${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.startsAt} < ${table.endsAt}
    `),
  ],
);

export const featuredProducts = pgTable(
  'featured_products',
  {
    id: text('id').primaryKey(),
    category: text('category').notNull(),
    operator: text('operator').notNull(),
    sortOrder: integer('sortOrder').notNull().default(0),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('featured_products_provider_idx').on(table.category, table.operator),
    index('featured_products_enabled_sort_idx').on(table.enabled, table.sortOrder),
  ],
);

export const flashSaleOffers = pgTable(
  'flash_sale_offers',
  {
    id: text('id').primaryKey(),
    productId: text('productId')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    salePrice: bigint('salePrice').notNull(),
    startsAt: integer('startsAt', { mode: 'timestamp_ms' }).notNull(),
    endsAt: integer('endsAt', { mode: 'timestamp_ms' }).notNull(),
    quotaLimit: integer('quotaLimit'),
    quantitySold: integer('quantitySold').notNull().default(0),
    quantityReserved: integer('quantityReserved').notNull().default(0),
    status: text('status').$type<'draft' | 'active' | 'paused'>().notNull().default('draft'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('flash_sale_offers_product_schedule_idx').on(table.productId, table.startsAt, table.endsAt),
    index('flash_sale_offers_status_schedule_idx').on(table.status, table.startsAt, table.endsAt),
    check('flash_sale_offers_positive_price', sql`${table.salePrice} > 0`),
    check('flash_sale_offers_valid_schedule', sql`${table.startsAt} < ${table.endsAt}`),
    check('flash_sale_offers_valid_quota', sql`
      ${table.quantitySold} >= 0
      AND ${table.quantityReserved} >= 0
      AND (${table.quotaLimit} IS NULL OR ${table.quotaLimit} >= ${table.quantitySold} + ${table.quantityReserved})
    `),
  ],
);

export const productProviderSettings = pgTable(
  'product_provider_settings',
  {
    id: text('id').primaryKey(),
    category: text('category').$type<ProductCategory>().notNull(),
    operator: text('operator').notNull(),
    description: text('description').notNull().default(''),
    iconUrl: text('iconUrl'),
    coverUrl: text('coverUrl'),
    pricingType: text('pricingType').$type<'fixed' | 'percent'>().notNull().default('fixed'),
    pricingValue: bigint('pricingValue').notNull().default(0),
    memberPricingType: text('memberPricingType').$type<'fixed' | 'percent'>().notNull().default('fixed'),
    memberPricingValue: bigint('memberPricingValue').notNull().default(0),
    // Another operator name this one is shown as, so two vendors selling the
    // same brand (Digiflazz "AXIS", TokoVoucher "DATA AXIS") become one card.
    aliasOf: text('aliasOf'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('product_provider_settings_category_operator_unique').on(table.category, table.operator),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    invoiceNumber: text('invoiceNumber').notNull().unique(),
    userId: text('userId').references(() => users.id, { onDelete: 'set null' }),
    customerPhone: text('customerPhone').notNull(),
    purchaserName: text('purchaserName'),
    customerEmail: text('customerEmail'),
    productId: text('productId').notNull(),
    vendorCode: text('vendorCode').notNull().default(''),
    productName: text('productName').notNull(),
    category: text('category').$type<ProductCategory>().notNull(),
    operator: text('operator').notNull(),
    destination: text('destination').notNull(),
    serverZoneId: text('serverZoneId'),
    customerName: text('customerName'),
    productPrice: bigint('productPrice').notNull(),
    basePrice: bigint('basePrice').notNull().default(0),
    adminFee: bigint('adminFee').notNull(),
    totalPay: bigint('totalPay').notNull(),
    paymentMethod: text('paymentMethod').notNull(),
    paymentStatus: text('paymentStatus')
      .$type<'unpaid' | 'paid' | 'expired' | 'review'>()
      .notNull()
      .default('unpaid'),
    transactionStatus: text('transactionStatus')
      .$type<'pending' | 'processing' | TransactionStatus>()
      .notNull()
      .default('pending'),
    sn: text('sn'),
    qrCodeUrl: text('qrCodeUrl'),
    qrString: text('qrString'),
    // Amount the buyer must actually transfer; Qrisly adds a unique code.
    payableAmount: bigint('payableAmount'),
    providerReference: text('providerReference').unique(),
    idempotencyKey: text('idempotencyKey').unique(),
    guestAccessTokenHash: text('guestAccessTokenHash'),
    vaNumber: text('vaNumber'),
    proofUrl: text('proofUrl'),
    voucherCode: text('voucherCode'),
    discountAmount: bigint('discountAmount').notNull().default(0),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('invoices_user_created_idx').on(table.userId, table.createdAt),
    index('invoices_status_idx').on(table.paymentStatus, table.transactionStatus),
    check(
      'invoices_amounts_nonnegative',
      sql`${table.productPrice} >= 0 AND ${table.adminFee} >= 0 AND ${table.totalPay} >= 0`,
    ),
  ],
);

// A postpaid bill is quoted once and paid shortly after, so the quote is stored
// with the provider reference that the payment must reuse.
export const billInquiries = pgTable(
  'bill_inquiries',
  {
    id: text('id').primaryKey(),
    userId: text('userId').references(() => users.id, { onDelete: 'cascade' }),
    productId: text('productId')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    vendor: text('vendor').$type<ProductVendor>().notNull(),
    destination: text('destination').notNull(),
    customerName: text('customerName').notNull().default(''),
    // Bill value without the admin fee; totalAmount is what the buyer pays.
    billAmount: bigint('billAmount').notNull().default(0),
    adminFee: bigint('adminFee').notNull().default(0),
    totalAmount: bigint('totalAmount').notNull().default(0),
    // ref_id: the payment call must send this exact value.
    providerRef: text('providerRef').notNull().unique(),
    providerTrxId: text('providerTrxId'),
    lines: jsonb('lines').$type<{ label: string; value: string }[]>().notNull(),
    periods: jsonb('periods').$type<string[]>().notNull(),
    dueDate: text('dueDate'),
    status: text('status')
      .$type<'open' | 'used' | 'expired' | 'failed'>()
      .notNull()
      .default('open'),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('bill_inquiries_user_status_idx').on(table.userId, table.status),
    index('bill_inquiries_expiry_idx').on(table.expiresAt),
    check('bill_inquiries_amounts_nonnegative', sql`
      ${table.billAmount} >= 0
      AND ${table.adminFee} >= 0
      AND ${table.totalAmount} >= 0
    `),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    referenceId: text('referenceId').notNull().unique(),
    idempotencyKey: text('idempotencyKey').notNull().unique(),
    invoiceId: text('invoiceId').references(() => invoices.id, {
      onDelete: 'set null',
    }),
    // Postpaid orders point at the inquiry they were priced from.
    billInquiryId: text('billInquiryId').references(() => billInquiries.id, {
      onDelete: 'set null',
    }),
    userId: text('userId').references(() => users.id, { onDelete: 'set null' }),
    customerPhone: text('customerPhone'),
    productId: text('productId').notNull(),
    productName: text('productName').notNull(),
    category: text('category').$type<ProductCategory>().notNull(),
    operator: text('operator').notNull(),
    destination: text('destination').notNull(),
    serverZoneId: text('serverZoneId'),
    customerName: text('customerName'),
    amount: bigint('amount').notNull(),
    profit: bigint('profit').notNull().default(0),
    status: text('status').$type<TransactionStatus>().notNull().default('pending'),
    paymentMethod: text('paymentMethod').notNull(),
    needsManualReview: integer('needsManualReview', { mode: 'boolean' })
      .notNull()
      .default(false),
    manualReviewAt: integer('manualReviewAt', { mode: 'timestamp_ms' }),
    sn: text('sn'),
    voucherCode: text('voucherCode'),
    discountAmount: bigint('discountAmount').notNull().default(0),
    vendorResponse: jsonb('vendorResponse').$type<{
      code: string;
      message: string;
      rc: string;
      rawTime: string;
      retryHistory?: {
        referenceId: string;
        attemptedAt: string;
        status: 'pending' | 'success' | 'failed';
        adminId: string;
        code?: string;
        message?: string;
        rc?: string;
      }[];
      reconciliation?: {
        buyerSkuCode: string;
        customerNo: string;
        vendor?: ProductVendor;
        mode?: 'sandbox' | 'production';
      };
    }>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('transactions_user_created_idx').on(table.userId, table.createdAt),
    index('transactions_status_created_idx').on(table.status, table.createdAt),
    // One bill, one paid order. Partial so the many null rows stay allowed.
    uniqueIndex('transactions_bill_inquiry_unique')
      .on(table.billInquiryId)
      .where(sql`${table.billInquiryId} IS NOT NULL`),
    check('transactions_amount_nonnegative', sql`${table.amount} >= 0`),
  ],
);

export const flashSaleReservations = pgTable(
  'flash_sale_reservations',
  {
    id: text('id').primaryKey(),
    offerId: text('offerId')
      .notNull()
      .references(() => flashSaleOffers.id, { onDelete: 'restrict' }),
    invoiceId: text('invoiceId').references(() => invoices.id, { onDelete: 'restrict' }),
    transactionId: text('transactionId').references(() => transactions.id, { onDelete: 'restrict' }),
    status: text('status').$type<'reserved' | 'consumed' | 'released'>().notNull(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('flash_sale_reservations_invoice_unique').on(table.invoiceId),
    uniqueIndex('flash_sale_reservations_transaction_unique').on(table.transactionId),
    index('flash_sale_reservations_offer_status_idx').on(table.offerId, table.status),
    check('flash_sale_reservations_single_order', sql`
      (${table.invoiceId} IS NOT NULL AND ${table.transactionId} IS NULL)
      OR (${table.invoiceId} IS NULL AND ${table.transactionId} IS NOT NULL)
    `),
  ],
);

export const vouchers = pgTable(
  'vouchers',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    description: text('description').notNull().default(''),
    discountType: text('discountType').$type<'percent' | 'fixed'>().notNull(),
    discountValue: integer('discountValue').notNull(),
    maxDiscount: integer('maxDiscount'),
    minOrder: integer('minOrder').notNull().default(0),
    quotaLimit: integer('quotaLimit'),
    quantityUsed: integer('quantityUsed').notNull().default(0),
    perUserLimit: integer('perUserLimit'),
    startsAt: integer('startsAt', { mode: 'timestamp_ms' }),
    endsAt: integer('endsAt', { mode: 'timestamp_ms' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('vouchers_enabled_schedule_idx').on(table.enabled, table.startsAt, table.endsAt),
    check('vouchers_discount_value_positive', sql`${table.discountValue} > 0`),
    check('vouchers_percent_max_100', sql`
      ${table.discountType} <> 'percent' OR ${table.discountValue} <= 100
    `),
    check('vouchers_amounts_nonnegative', sql`
      ${table.minOrder} >= 0
      AND ${table.quantityUsed} >= 0
      AND (${table.maxDiscount} IS NULL OR ${table.maxDiscount} > 0)
      AND (${table.quotaLimit} IS NULL OR ${table.quotaLimit} >= 0)
      AND (${table.perUserLimit} IS NULL OR ${table.perUserLimit} > 0)
    `),
    check('vouchers_valid_schedule', sql`
      ${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.startsAt} < ${table.endsAt}
    `),
  ],
);

export const voucherRedemptions = pgTable(
  'voucher_redemptions',
  {
    id: text('id').primaryKey(),
    voucherId: text('voucherId')
      .notNull()
      .references(() => vouchers.id, { onDelete: 'restrict' }),
    userId: text('userId').references(() => users.id, { onDelete: 'set null' }),
    invoiceId: text('invoiceId').references(() => invoices.id, { onDelete: 'restrict' }),
    transactionId: text('transactionId').references(() => transactions.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    discountAmount: bigint('discountAmount').notNull(),
    status: text('status').$type<'reserved' | 'consumed' | 'released'>().notNull(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('voucher_redemptions_invoice_unique').on(table.invoiceId),
    uniqueIndex('voucher_redemptions_transaction_unique').on(table.transactionId),
    index('voucher_redemptions_voucher_status_idx').on(table.voucherId, table.status),
    index('voucher_redemptions_user_idx').on(table.userId, table.voucherId, table.status),
    check('voucher_redemptions_single_order', sql`
      (${table.invoiceId} IS NOT NULL AND ${table.transactionId} IS NULL)
      OR (${table.invoiceId} IS NULL AND ${table.transactionId} IS NOT NULL)
    `),
  ],
);

export const balanceLedger = pgTable(
  'balance_ledger',
  {
    id: text('id').primaryKey(),
    idempotencyKey: text('idempotencyKey').notNull().unique(),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    actorId: text('actorId').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').$type<'credit' | 'debit'>().notNull(),
    amount: bigint('amount').notNull(),
    balanceBefore: bigint('balanceBefore').notNull(),
    balanceAfter: bigint('balanceAfter').notNull(),
    reference: text('reference').notNull(),
    note: text('note').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('balance_ledger_user_created_idx').on(table.userId, table.createdAt),
    index('balance_ledger_reference_idx').on(table.reference),
    check('balance_ledger_amount_positive', sql`${table.amount} > 0`),
    check(
      'balance_ledger_balance_nonnegative',
      sql`${table.balanceBefore} >= 0 AND ${table.balanceAfter} >= 0`,
    ),
  ],
);

export const deposits = pgTable(
  'deposits',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    amount: bigint('amount').notNull(),
    type: text('type')
      .$type<'bank_transfer' | 'ewallet' | 'static_qris' | 'qrisly'>()
      .notNull(),
    paymentMethodId: text('paymentMethodId'),
    paymentMethodLabel: text('paymentMethodLabel'),
    targetBank: text('targetBank'),
    proofUrl: text('proofUrl').notNull(),
    providerReference: text('providerReference').unique(),
    qrString: text('qrString'),
    // Amount the payer must actually transfer; Qrisly adds a unique code.
    payableAmount: bigint('payableAmount'),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }),
    status: text('status')
      .$type<'pending' | 'approved' | 'rejected'>()
      .notNull()
      .default('pending'),
    adminNote: text('adminNote'),
    reviewedBy: text('reviewedBy').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: integer('reviewedAt', { mode: 'timestamp_ms' }),
    idempotencyKey: text('idempotencyKey').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('deposits_user_created_idx').on(table.userId, table.createdAt),
    index('deposits_status_created_idx').on(table.status, table.createdAt),
    check('deposits_amount_positive', sql`${table.amount} > 0`),
  ],
);

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: text('id').primaryKey(),
    type: text('type').$type<'bank_transfer' | 'ewallet' | 'static_qris'>().notNull(),
    label: text('label').notNull(),
    bankName: text('bankName'),
    accountNumber: text('accountNumber'),
    accountHolder: text('accountHolder'),
    qrImageFile: text('qrImageFile'),
    instructions: text('instructions').notNull().default(''),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('payment_methods_enabled_idx').on(table.enabled),
    check(
      'payment_methods_required_fields',
      sql`((${table.type} = 'bank_transfer' OR ${table.type} = 'ewallet') AND ${table.bankName} IS NOT NULL AND ${table.accountNumber} IS NOT NULL AND ${table.accountHolder} IS NOT NULL) OR (${table.type} = 'static_qris' AND ${table.qrImageFile} IS NOT NULL)`,
    ),
  ],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    eventId: text('eventId').notNull(),
    eventType: text('eventType').notNull(),
    processedAt: integer('processedAt', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('webhook_events_provider_event_uidx').on(
      table.provider,
      table.eventId,
    ),
  ],
);

export const integrationSettings = pgTable('integration_settings', {
  name: text('name').primaryKey(),
  encryptedValue: text('encryptedValue').notNull(),
  updatedBy: text('updatedBy').references(() => users.id, {
    onDelete: 'set null',
  }),
  updatedAt: updatedAt(),
});

export const storeSettings = pgTable('store_settings', {
  id: text('id').primaryKey(),
  storeName: text('storeName').notNull().default(DEFAULT_STORE_NAME),
  tagline: text('tagline').notNull().default(''),
  description: text('description').notNull().default(''),
  supportPhone: text('supportPhone').notNull().default(''),
  logoFile: text('logoFile'),
  iconFile: text('iconFile'),
  faviconFile: text('faviconFile'),
  ogImageFile: text('ogImageFile'),
  // JSON array of { type, label, value }. Small and always read together with
  // the profile, so a separate table would only add joins.
  socialLinks: text('socialLinks').notNull().default('[]'),
  seoTitle: text('seoTitle').notNull().default(''),
  seoDescription: text('seoDescription').notNull().default(''),
  seoNoIndex: integer('seoNoIndex', { mode: 'boolean' }).notNull().default(false),
  ogTitle: text('ogTitle').notNull().default(''),
  ogDescription: text('ogDescription').notNull().default(''),
  googleSiteVerification: text('googleSiteVerification').notNull().default(''),
  bingSiteVerification: text('bingSiteVerification').notNull().default(''),
  indexNowKey: text('indexNowKey'),
  updatedAt: updatedAt(),
});

export const legalDocuments = pgTable('legal_documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  updatedBy: text('updatedBy'),
  updatedAt: updatedAt(),
});

export const orderLookupChallenges = pgTable(
  'order_lookup_challenges',
  {
    id: text('id').primaryKey(),
    identifierHash: text('identifierHash').notNull(),
    codeHash: text('codeHash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    consumedAt: integer('consumedAt', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (table) => [
    index('order_lookup_challenges_expiry_idx').on(table.expiresAt),
    check('order_lookup_challenges_attempts_nonnegative', sql`${table.attempts} >= 0`),
  ],
);

export const orderLookupRateLimits = pgTable(
  'order_lookup_rate_limits',
  {
    key: text('key').primaryKey(),
    attempts: integer('attempts').notNull().default(0),
    windowStartedAt: integer('windowStartedAt', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('order_lookup_rate_limits_expiry_idx').on(table.expiresAt),
    check('order_lookup_rate_limits_attempts_nonnegative', sql`${table.attempts} >= 0`),
  ],
);

export const orderLookupGrants = pgTable(
  'order_lookup_grants',
  {
    tokenHash: text('tokenHash').primaryKey(),
    invoiceId: text('invoiceId').references(() => invoices.id, { onDelete: 'cascade' }),
    transactionId: text('transactionId').references(() => transactions.id, {
      onDelete: 'cascade',
    }),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('order_lookup_grants_invoice_idx').on(table.invoiceId),
    index('order_lookup_grants_transaction_idx').on(table.transactionId),
    index('order_lookup_grants_expiry_idx').on(table.expiresAt),
    check(
      'order_lookup_grants_one_target',
      sql`(${table.invoiceId} IS NOT NULL AND ${table.transactionId} IS NULL) OR (${table.invoiceId} IS NULL AND ${table.transactionId} IS NOT NULL)`,
    ),
  ],
);
