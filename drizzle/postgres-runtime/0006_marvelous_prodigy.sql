ALTER TABLE "products" ADD COLUMN "variant" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "variantSource" text DEFAULT 'sync' NOT NULL;--> statement-breakpoint
CREATE INDEX "products_variant_idx" ON "products" USING btree ("category","operator","variant");