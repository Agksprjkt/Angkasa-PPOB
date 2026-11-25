CREATE TABLE "voucher_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"voucherId" text NOT NULL,
	"userId" text,
	"invoiceId" text,
	"transactionId" text,
	"code" text NOT NULL,
	"discountAmount" bigint NOT NULL,
	"status" text NOT NULL,
	"expiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voucher_redemptions_single_order" CHECK (
      ("voucher_redemptions"."invoiceId" IS NOT NULL AND "voucher_redemptions"."transactionId" IS NULL)
      OR ("voucher_redemptions"."invoiceId" IS NULL AND "voucher_redemptions"."transactionId" IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"discountType" text NOT NULL,
	"discountValue" integer NOT NULL,
	"maxDiscount" integer,
	"minOrder" integer DEFAULT 0 NOT NULL,
	"quotaLimit" integer,
	"quantityUsed" integer DEFAULT 0 NOT NULL,
	"perUserLimit" integer,
	"startsAt" timestamp with time zone,
	"endsAt" timestamp with time zone,
	"enabled" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_code_unique" UNIQUE("code"),
	CONSTRAINT "vouchers_discount_value_positive" CHECK ("vouchers"."discountValue" > 0),
	CONSTRAINT "vouchers_percent_max_100" CHECK (
      "vouchers"."discountType" <> 'percent' OR "vouchers"."discountValue" <= 100
    ),
	CONSTRAINT "vouchers_amounts_nonnegative" CHECK (
      "vouchers"."minOrder" >= 0
      AND "vouchers"."quantityUsed" >= 0
      AND ("vouchers"."maxDiscount" IS NULL OR "vouchers"."maxDiscount" > 0)
      AND ("vouchers"."quotaLimit" IS NULL OR "vouchers"."quotaLimit" >= 0)
      AND ("vouchers"."perUserLimit" IS NULL OR "vouchers"."perUserLimit" > 0)
    ),
	CONSTRAINT "vouchers_valid_schedule" CHECK (
      "vouchers"."startsAt" IS NULL OR "vouchers"."endsAt" IS NULL OR "vouchers"."startsAt" < "vouchers"."endsAt"
    )
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voucherCode" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discountAmount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "voucherCode" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "discountAmount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_voucherId_vouchers_id_fk" FOREIGN KEY ("voucherId") REFERENCES "public"."vouchers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_invoiceId_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_transactionId_transactions_id_fk" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voucher_redemptions_invoice_unique" ON "voucher_redemptions" USING btree ("invoiceId");--> statement-breakpoint
CREATE UNIQUE INDEX "voucher_redemptions_transaction_unique" ON "voucher_redemptions" USING btree ("transactionId");--> statement-breakpoint
CREATE INDEX "voucher_redemptions_voucher_status_idx" ON "voucher_redemptions" USING btree ("voucherId","status");--> statement-breakpoint
CREATE INDEX "voucher_redemptions_user_idx" ON "voucher_redemptions" USING btree ("userId","voucherId","status");--> statement-breakpoint
CREATE INDEX "vouchers_enabled_schedule_idx" ON "vouchers" USING btree ("enabled","startsAt","endsAt");