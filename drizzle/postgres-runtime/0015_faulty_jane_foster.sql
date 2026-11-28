ALTER TABLE "products" ADD COLUMN "disabledBy" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "disabledReason" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "disabledAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "failureStreak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "lastFailureAt" timestamp with time zone;