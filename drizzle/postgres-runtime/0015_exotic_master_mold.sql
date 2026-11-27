ALTER TABLE "catalog_groups" ADD COLUMN "productCategory" text;--> statement-breakpoint
ALTER TABLE "catalog_groups" ADD COLUMN "includeUnmapped" boolean DEFAULT false NOT NULL;