CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balance_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"idempotencyKey" text NOT NULL,
	"userId" text NOT NULL,
	"actorId" text,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"balanceBefore" integer NOT NULL,
	"balanceAfter" integer NOT NULL,
	"reference" text NOT NULL,
	"note" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balance_ledger_idempotencyKey_unique" UNIQUE("idempotencyKey"),
	CONSTRAINT "balance_ledger_amount_positive" CHECK ("balance_ledger"."amount" > 0),
	CONSTRAINT "balance_ledger_balance_nonnegative" CHECK ("balance_ledger"."balanceBefore" >= 0 AND "balance_ledger"."balanceAfter" >= 0)
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"amount" integer NOT NULL,
	"type" text NOT NULL,
	"paymentMethodId" text,
	"paymentMethodLabel" text,
	"targetBank" text,
	"proofUrl" text NOT NULL,
	"providerReference" text,
	"qrString" text,
	"expiresAt" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"adminNote" text,
	"reviewedBy" text,
	"reviewedAt" timestamp with time zone,
	"idempotencyKey" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_providerReference_unique" UNIQUE("providerReference"),
	CONSTRAINT "deposits_idempotencyKey_unique" UNIQUE("idempotencyKey"),
	CONSTRAINT "deposits_amount_positive" CHECK ("deposits"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "integration_settings" (
	"name" text PRIMARY KEY NOT NULL,
	"encryptedValue" text NOT NULL,
	"updatedBy" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"invoiceNumber" text NOT NULL,
	"userId" text,
	"customerPhone" text NOT NULL,
	"purchaserName" text,
	"customerEmail" text,
	"productId" text NOT NULL,
	"vendorCode" text DEFAULT '' NOT NULL,
	"productName" text NOT NULL,
	"category" text NOT NULL,
	"operator" text NOT NULL,
	"destination" text NOT NULL,
	"serverZoneId" text,
	"customerName" text,
	"productPrice" integer NOT NULL,
	"basePrice" integer DEFAULT 0 NOT NULL,
	"adminFee" integer NOT NULL,
	"totalPay" integer NOT NULL,
	"paymentMethod" text NOT NULL,
	"paymentStatus" text DEFAULT 'unpaid' NOT NULL,
	"transactionStatus" text DEFAULT 'pending' NOT NULL,
	"sn" text,
	"qrCodeUrl" text,
	"qrString" text,
	"providerReference" text,
	"idempotencyKey" text,
	"guestAccessTokenHash" text,
	"vaNumber" text,
	"proofUrl" text,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoiceNumber_unique" UNIQUE("invoiceNumber"),
	CONSTRAINT "invoices_providerReference_unique" UNIQUE("providerReference"),
	CONSTRAINT "invoices_idempotencyKey_unique" UNIQUE("idempotencyKey"),
	CONSTRAINT "invoices_amounts_nonnegative" CHECK ("invoices"."productPrice" >= 0 AND "invoices"."adminFee" >= 0 AND "invoices"."totalPay" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_lookup_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"identifierHash" text NOT NULL,
	"codeHash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"consumedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lookup_challenges_attempts_nonnegative" CHECK ("order_lookup_challenges"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_lookup_grants" (
	"tokenHash" text PRIMARY KEY NOT NULL,
	"invoiceId" text,
	"transactionId" text,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lookup_grants_one_target" CHECK (("order_lookup_grants"."invoiceId" IS NOT NULL AND "order_lookup_grants"."transactionId" IS NULL) OR ("order_lookup_grants"."invoiceId" IS NULL AND "order_lookup_grants"."transactionId" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "order_lookup_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"windowStartedAt" timestamp with time zone NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lookup_rate_limits_attempts_nonnegative" CHECK ("order_lookup_rate_limits"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"bankName" text,
	"accountNumber" text,
	"accountHolder" text,
	"qrImageFile" text,
	"instructions" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_required_fields" CHECK (("payment_methods"."type" = 'bank_transfer' AND "payment_methods"."bankName" IS NOT NULL AND "payment_methods"."accountNumber" IS NOT NULL AND "payment_methods"."accountHolder" IS NOT NULL) OR ("payment_methods"."type" = 'static_qris' AND "payment_methods"."qrImageFile" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "product_provider_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"operator" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"iconUrl" text,
	"coverUrl" text,
	"pricingType" text DEFAULT 'fixed' NOT NULL,
	"pricingValue" integer DEFAULT 0 NOT NULL,
	"memberPricingType" text DEFAULT 'fixed' NOT NULL,
	"memberPricingValue" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"vendorCode" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"operator" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"basePrice" integer NOT NULL,
	"sellPriceUser" integer NOT NULL,
	"sellPriceAgent" integer NOT NULL,
	"compareAtPrice" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"vendor" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_vendorCode_unique" UNIQUE("vendorCode"),
	CONSTRAINT "products_prices_nonnegative" CHECK (
      "products"."basePrice" >= 0
      AND "products"."sellPriceUser" >= 0
      AND "products"."sellPriceAgent" >= 0
    )
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"storeName" text DEFAULT 'Angkasa Pay' NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"supportPhone" text DEFAULT '' NOT NULL,
	"logoFile" text,
	"seoTitle" text DEFAULT '' NOT NULL,
	"seoDescription" text DEFAULT '' NOT NULL,
	"googleSiteVerification" text DEFAULT '' NOT NULL,
	"bingSiteVerification" text DEFAULT '' NOT NULL,
	"indexNowKey" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_pins" (
	"userId" text PRIMARY KEY NOT NULL,
	"pinHash" text NOT NULL,
	"failedAttempts" integer DEFAULT 0 NOT NULL,
	"lockedUntil" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_pins_attempts_nonnegative" CHECK ("transaction_pins"."failedAttempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"referenceId" text NOT NULL,
	"idempotencyKey" text NOT NULL,
	"invoiceId" text,
	"userId" text,
	"customerPhone" text,
	"productId" text NOT NULL,
	"productName" text NOT NULL,
	"category" text NOT NULL,
	"operator" text NOT NULL,
	"destination" text NOT NULL,
	"serverZoneId" text,
	"customerName" text,
	"amount" integer NOT NULL,
	"profit" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paymentMethod" text NOT NULL,
	"needsManualReview" boolean DEFAULT false NOT NULL,
	"manualReviewAt" timestamp with time zone,
	"sn" text,
	"vendorResponse" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_referenceId_unique" UNIQUE("referenceId"),
	CONSTRAINT "transactions_idempotencyKey_unique" UNIQUE("idempotencyKey"),
	CONSTRAINT "transactions_amount_nonnegative" CHECK ("transactions"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phoneNumber" text,
	"phoneNumberVerified" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"commissionBalance" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_phoneNumber_unique" UNIQUE("phoneNumber")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"eventId" text NOT NULL,
	"eventType" text NOT NULL,
	"processedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_ledger" ADD CONSTRAINT "balance_ledger_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_ledger" ADD CONSTRAINT "balance_ledger_actorId_user_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_reviewedBy_user_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lookup_grants" ADD CONSTRAINT "order_lookup_grants_invoiceId_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lookup_grants" ADD CONSTRAINT "order_lookup_grants_transactionId_transactions_id_fk" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_pins" ADD CONSTRAINT "transaction_pins_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_invoiceId_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "balance_ledger_user_created_idx" ON "balance_ledger" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "balance_ledger_reference_idx" ON "balance_ledger" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "deposits_user_created_idx" ON "deposits" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "deposits_status_created_idx" ON "deposits" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "invoices_user_created_idx" ON "invoices" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("paymentStatus","transactionStatus");--> statement-breakpoint
CREATE INDEX "order_lookup_challenges_expiry_idx" ON "order_lookup_challenges" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "order_lookup_grants_invoice_idx" ON "order_lookup_grants" USING btree ("invoiceId");--> statement-breakpoint
CREATE INDEX "order_lookup_grants_transaction_idx" ON "order_lookup_grants" USING btree ("transactionId");--> statement-breakpoint
CREATE INDEX "order_lookup_grants_expiry_idx" ON "order_lookup_grants" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "order_lookup_rate_limits_expiry_idx" ON "order_lookup_rate_limits" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "payment_methods_enabled_idx" ON "payment_methods" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "product_provider_settings_category_operator_unique" ON "product_provider_settings" USING btree ("category","operator");--> statement-breakpoint
CREATE INDEX "products_category_status_idx" ON "products" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "transactions_user_created_idx" ON "transactions" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "transactions_status_created_idx" ON "transactions" USING btree ("status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_uidx" ON "webhook_events" USING btree ("provider","eventId");