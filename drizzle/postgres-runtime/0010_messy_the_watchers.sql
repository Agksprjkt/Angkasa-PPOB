ALTER TABLE "products" DROP CONSTRAINT "products_vendorCode_unique";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "vendorLabel" text;--> statement-breakpoint
CREATE UNIQUE INDEX "products_vendor_code_unique" ON "products" USING btree ("vendor","vendorCode");--> statement-breakpoint
CREATE INDEX "products_vendor_status_idx" ON "products" USING btree ("vendor","status");