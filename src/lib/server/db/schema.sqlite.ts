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
    vendorCode: text('vendorCode').notNull().unique(),
    name: text('name').notNull(),
    category: text('category').$type<ProductCategory>().notNull(),
    operator: text('operator').notNull(),
    description: text('description').notNull().default(''),
    basePrice: integer('basePrice').notNull(),
    sellPriceUser: integer('sellPriceUser').notNull(),
    sellPriceAgent: integer('sellPriceAgent').notNull(),
    compareAtPrice: integer('compareAtPrice'),
    status: text('status').$type<'active' | 'inactive'>().notNull().default('active'),
    vendor: text('vendor').$type<'Digiflazz' | 'Manual'>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('products_category_status_idx').on(table.category, table.status),
    check('products_prices_nonnegative', sql`
      ${table.basePrice} >= 0
      AND ${table.sellPriceUser} >= 0
      AND ${table.sellPriceAgent} >= 0
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
    providerReference: text('providerReference').unique(),
    idempotencyKey: text('idempotencyKey').unique(),
    guestAccessTokenHash: text('guestAccessTokenHash'),
    vaNumber: text('vaNumber'),
    proofUrl: text('proofUrl'),
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
      .$type<'bank_transfer' | 'static_qris' | 'qrisly'>()
      .notNull(),
    paymentMethodId: text('paymentMethodId'),
    paymentMethodLabel: text('paymentMethodLabel'),
    targetBank: text('targetBank'),
    proofUrl: text('proofUrl').notNull(),
    providerReference: text('providerReference').unique(),
    qrString: text('qrString'),
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
    type: text('type').$type<'bank_transfer' | 'static_qris'>().notNull(),
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
      sql`(${table.type} = 'bank_transfer' AND ${table.bankName} IS NOT NULL AND ${table.accountNumber} IS NOT NULL AND ${table.accountHolder} IS NOT NULL) OR (${table.type} = 'static_qris' AND ${table.qrImageFile} IS NOT NULL)`,
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
  seoTitle: text('seoTitle').notNull().default(''),
  seoDescription: text('seoDescription').notNull().default(''),
  googleSiteVerification: text('googleSiteVerification').notNull().default(''),
  bingSiteVerification: text('bingSiteVerification').notNull().default(''),
  indexNowKey: text('indexNowKey'),
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
