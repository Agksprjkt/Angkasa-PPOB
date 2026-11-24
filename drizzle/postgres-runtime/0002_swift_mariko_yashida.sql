CREATE TABLE "flash_sale_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"productId" text NOT NULL,
	"title" text NOT NULL,
	"salePrice" bigint NOT NULL,
	"startsAt" timestamp with time zone NOT NULL,
	"endsAt" timestamp with time zone NOT NULL,
	"quotaLimit" integer,
	"quantitySold" integer DEFAULT 0 NOT NULL,
	"quantityReserved" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flash_sale_offers_positive_price" CHECK ("flash_sale_offers"."salePrice" > 0),
	CONSTRAINT "flash_sale_offers_valid_schedule" CHECK ("flash_sale_offers"."startsAt" < "flash_sale_offers"."endsAt"),
	CONSTRAINT "flash_sale_offers_valid_quota" CHECK (
      "flash_sale_offers"."quantitySold" >= 0
      AND "flash_sale_offers"."quantityReserved" >= 0
      AND ("flash_sale_offers"."quotaLimit" IS NULL OR "flash_sale_offers"."quotaLimit" >= "flash_sale_offers"."quantitySold" + "flash_sale_offers"."quantityReserved")
    )
);
--> statement-breakpoint
CREATE TABLE "flash_sale_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"offerId" text NOT NULL,
	"invoiceId" text,
	"transactionId" text,
	"status" text NOT NULL,
	"expiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flash_sale_reservations_single_order" CHECK (
      ("flash_sale_reservations"."invoiceId" IS NOT NULL AND "flash_sale_reservations"."transactionId" IS NULL)
      OR ("flash_sale_reservations"."invoiceId" IS NULL AND "flash_sale_reservations"."transactionId" IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE TABLE "promotional_banners" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"imageUrl" text NOT NULL,
	"targetPath" text NOT NULL,
	"buttonLabel" text DEFAULT 'Lihat Promo' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"startsAt" timestamp with time zone,
	"endsAt" timestamp with time zone,
	"enabled" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotional_banners_valid_schedule" CHECK (
      "promotional_banners"."startsAt" IS NULL OR "promotional_banners"."endsAt" IS NULL OR "promotional_banners"."startsAt" < "promotional_banners"."endsAt"
    )
);
--> statement-breakpoint
ALTER TABLE "flash_sale_offers" ADD CONSTRAINT "flash_sale_offers_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_sale_reservations" ADD CONSTRAINT "flash_sale_reservations_offerId_flash_sale_offers_id_fk" FOREIGN KEY ("offerId") REFERENCES "public"."flash_sale_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_sale_reservations" ADD CONSTRAINT "flash_sale_reservations_invoiceId_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_sale_reservations" ADD CONSTRAINT "flash_sale_reservations_transactionId_transactions_id_fk" FOREIGN KEY ("transactionId") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flash_sale_offers_product_schedule_idx" ON "flash_sale_offers" USING btree ("productId","startsAt","endsAt");--> statement-breakpoint
CREATE INDEX "flash_sale_offers_status_schedule_idx" ON "flash_sale_offers" USING btree ("status","startsAt","endsAt");--> statement-breakpoint
CREATE UNIQUE INDEX "flash_sale_reservations_invoice_unique" ON "flash_sale_reservations" USING btree ("invoiceId");--> statement-breakpoint
CREATE UNIQUE INDEX "flash_sale_reservations_transaction_unique" ON "flash_sale_reservations" USING btree ("transactionId");--> statement-breakpoint
CREATE INDEX "flash_sale_reservations_offer_status_idx" ON "flash_sale_reservations" USING btree ("offerId","status");--> statement-breakpoint
CREATE INDEX "promotional_banners_enabled_sort_idx" ON "promotional_banners" USING btree ("enabled","sortOrder");