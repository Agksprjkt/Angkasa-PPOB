ALTER TABLE "store_settings" ADD COLUMN "ogImageFile" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "seoNoIndex" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "ogTitle" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "ogDescription" text DEFAULT '' NOT NULL;