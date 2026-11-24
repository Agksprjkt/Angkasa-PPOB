CREATE TABLE "featured_products" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"operator" text NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "featured_products_provider_idx" ON "featured_products" USING btree ("category","operator");--> statement-breakpoint
CREATE INDEX "featured_products_enabled_sort_idx" ON "featured_products" USING btree ("enabled","sortOrder");