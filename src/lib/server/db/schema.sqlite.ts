import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type {
  ProductCategory,
  TransactionStatus,
} from '@/types/ppob';
import type { ProductVendor } from '@/lib/vendor-registry';
import { DEFAULT_STORE_NAME } from '@/lib/store-branding';

const createdAt = () =>
  integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable(
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
    balance: integer('balance').notNull().default(0),
    commissionBalance: integer('commissionBalance')
      .notNull()
      .default(0),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  },
);

export const transactionPins = sqliteTable(
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

export const sessions = sqliteTable('session', {
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

export const accounts = sqliteTable('account', {
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

export const verifications = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }),
});

export const products = sqliteTable(
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
    basePrice: integer('basePrice').notNull(),
    sellPriceUser: integer('sellPriceUser').notNull(),
    sellPriceAgent: integer('sellPriceAgent').notNull(),
    compareAtPrice: integer('compareAtPrice'),
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

export const promotionalBanners = sqliteTable(
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

export const featuredProducts = sqliteTable(
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

export const flashSaleOffers = sqliteTable(
  'flash_sale_offers',
  {
    id: text('id').primaryKey(),
    productId: text('productId')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    salePrice: integer('salePrice').notNull(),
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

export const productProviderSettings = sqliteTable(
  'product_provider_settings',
  {
    id: text('id').primaryKey(),
    category: text('category').$type<ProductCategory>().notNull(),
    operator: text('operator').notNull(),
    description: text('description').notNull().default(''),
    iconUrl: text('iconUrl'),
    coverUrl: text('coverUrl'),
    pricingType: text('pricingType').$type<'fixed' | 'percent'>().notNull().default('fixed'),
    pricingValue: integer('pricingValue').notNull().default(0),
    memberPricingType: text('memberPricingType').$type<'fixed' | 'percent'>().notNull().default('fixed'),
    memberPricingValue: integer('memberPricingValue').notNull().default(0),
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

export const invoices = sqliteTable(
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
    productPrice: integer('productPrice').notNull(),
    basePrice: integer('basePrice').notNull().default(0),
    adminFee: integer('adminFee').notNull(),
    totalPay: integer('totalPay').notNull(),
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
    payableAmount: integer('payableAmount'),
    providerReference: text('providerReference').unique(),
    idempotencyKey: text('idempotencyKey').unique(),
    guestAccessTokenHash: text('guestAccessTokenHash'),
    vaNumber: text('vaNumber'),
    proofUrl: text('proofUrl'),
    voucherCode: text('voucherCode'),
    discountAmount: integer('discountAmount').notNull().default(0),
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

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    referenceId: text('referenceId').notNull().unique(),
    idempotencyKey: text('idempotencyKey').notNull().unique(),
    invoiceId: text('invoiceId').references(() => invoices.id, {
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
    amount: integer('amount').notNull(),
    profit: integer('profit').notNull().default(0),
    status: text('status').$type<TransactionStatus>().notNull().default('pending'),
    paymentMethod: text('paymentMethod').notNull(),
    needsManualReview: integer('needsManualReview', { mode: 'boolean' })
      .notNull()
      .default(false),
    manualReviewAt: integer('manualReviewAt', { mode: 'timestamp_ms' }),
    sn: text('sn'),
    voucherCode: text('voucherCode'),
    discountAmount: integer('discountAmount').notNull().default(0),
    vendorResponse: text('vendorResponse', { mode: 'json' }).$type<{
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
    check('transactions_amount_nonnegative', sql`${table.amount} >= 0`),
  ],
);

export const flashSaleReservations = sqliteTable(
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

export const vouchers = sqliteTable(
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

export const voucherRedemptions = sqliteTable(
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
    discountAmount: integer('discountAmount').notNull(),
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

export const balanceLedger = sqliteTable(
  'balance_ledger',
  {
    id: text('id').primaryKey(),
    idempotencyKey: text('idempotencyKey').notNull().unique(),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    actorId: text('actorId').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').$type<'credit' | 'debit'>().notNull(),
    amount: integer('amount').notNull(),
    balanceBefore: integer('balanceBefore').notNull(),
    balanceAfter: integer('balanceAfter').notNull(),
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

export const deposits = sqliteTable(
  'deposits',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    amount: integer('amount').notNull(),
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
    payableAmount: integer('payableAmount'),
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

export const paymentMethods = sqliteTable(
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

export const webhookEvents = sqliteTable(
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

export const integrationSettings = sqliteTable('integration_settings', {
  name: text('name').primaryKey(),
  encryptedValue: text('encryptedValue').notNull(),
  updatedBy: text('updatedBy').references(() => users.id, {
    onDelete: 'set null',
  }),
  updatedAt: updatedAt(),
});

export const storeSettings = sqliteTable('store_settings', {
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

export const legalDocuments = sqliteTable('legal_documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  updatedBy: text('updatedBy'),
  updatedAt: updatedAt(),
});

export const orderLookupChallenges = sqliteTable(
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

export const orderLookupRateLimits = sqliteTable(
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

export const orderLookupGrants = sqliteTable(
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
