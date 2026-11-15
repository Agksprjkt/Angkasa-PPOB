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
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balance_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"idempotencyKey" text NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"balanceBefore" bigint NOT NULL,
	"balanceAfter" bigint NOT NULL,
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
	"amount" bigint NOT NULL,
	"type" text NOT NULL,
	"targetBank" text,
	"proofUrl" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"adminNote" text,
	"reviewedBy" text,
	"reviewedAt" timestamp with time zone,
	"idempotencyKey" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_idempotencyKey_unique" UNIQUE("idempotencyKey"),
	CONSTRAINT "deposits_amount_positive" CHECK ("deposits"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"invoiceNumber" text NOT NULL,
	"userId" text,
	"customerPhone" text NOT NULL,
	"productId" text NOT NULL,
	"productName" text NOT NULL,
	"category" text NOT NULL,
	"operator" text NOT NULL,
	"destination" text NOT NULL,
	"serverZoneId" text,
	"productPrice" bigint NOT NULL,
	"adminFee" bigint NOT NULL,
	"totalPay" bigint NOT NULL,
	"paymentMethod" text NOT NULL,
	"paymentStatus" text DEFAULT 'unpaid' NOT NULL,
	"transactionStatus" text DEFAULT 'pending' NOT NULL,
	"sn" text,
	"qrCodeUrl" text,
	"vaNumber" text,
	"proofUrl" text,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoiceNumber_unique" UNIQUE("invoiceNumber"),
	CONSTRAINT "invoices_amounts_nonnegative" CHECK ("invoices"."productPrice" >= 0 AND "invoices"."adminFee" >= 0 AND "invoices"."totalPay" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"vendorCode" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"operator" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"basePrice" bigint NOT NULL,
	"sellPriceUser" bigint NOT NULL,
	"sellPriceAgent" bigint NOT NULL,
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
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
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
	"customerName" text,
	"amount" bigint NOT NULL,
	"profit" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paymentMethod" text NOT NULL,
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
	"balance" bigint DEFAULT 0 NOT NULL,
	"commissionBalance" bigint DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_phoneNumber_unique" UNIQUE("phoneNumber"),
	CONSTRAINT "user_balance_nonnegative" CHECK ("user"."balance" >= 0),
	CONSTRAINT "user_commission_balance_nonnegative" CHECK ("user"."commissionBalance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
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
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_reviewedBy_user_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_invoiceId_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "balance_ledger_user_created_idx" ON "balance_ledger" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "balance_ledger_reference_idx" ON "balance_ledger" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "deposits_user_created_idx" ON "deposits" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "deposits_status_created_idx" ON "deposits" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "invoices_user_created_idx" ON "invoices" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("paymentStatus","transactionStatus");--> statement-breakpoint
CREATE INDEX "products_category_status_idx" ON "products" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "transactions_user_created_idx" ON "transactions" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "transactions_status_created_idx" ON "transactions" USING btree ("status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_uidx" ON "webhook_events" USING btree ("provider","eventId");