ALTER TABLE "store_settings" ADD COLUMN "iconFile" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "faviconFile" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "socialLinks" text DEFAULT '[]' NOT NULL;