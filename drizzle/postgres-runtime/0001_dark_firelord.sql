ALTER TABLE "balance_ledger" ALTER COLUMN "amount" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "balance_ledger" ALTER COLUMN "balanceBefore" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "balance_ledger" ALTER COLUMN "balanceAfter" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "deposits" ALTER COLUMN "amount" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "productPrice" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "basePrice" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "adminFee" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "totalPay" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "product_provider_settings" ALTER COLUMN "pricingValue" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "product_provider_settings" ALTER COLUMN "memberPricingValue" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "basePrice" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "sellPriceUser" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "sellPriceAgent" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "compareAtPrice" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "amount" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "profit" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "balance" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "commissionBalance" SET DATA TYPE bigint;