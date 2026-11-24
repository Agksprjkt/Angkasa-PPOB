import 'server-only';

import * as postgresSchema from './schema.postgres';
import * as sqliteSchema from './schema.sqlite';
import { databaseMode } from './database-mode';

const activeSchema = databaseMode === 'postgres'
  ? postgresSchema
  : sqliteSchema;

// Both dialect schemas have the same application fields; their column types differ only at the driver boundary.
const schema = activeSchema as unknown as typeof sqliteSchema;

export const {
  users,
  transactionPins,
  sessions,
  accounts,
  verifications,
  products,
  promotionalBanners,
  featuredProducts,
  flashSaleOffers,
  flashSaleReservations,
  productProviderSettings,
  invoices,
  transactions,
  balanceLedger,
  deposits,
  paymentMethods,
  webhookEvents,
  integrationSettings,
  storeSettings,
  legalDocuments,
  orderLookupChallenges,
  orderLookupRateLimits,
  orderLookupGrants,
} = schema;

export default schema;
