CREATE TABLE "bill_inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"productId" text NOT NULL,
	"subgroupId" text,
	"destination" text NOT NULL,
	"customerName" text DEFAULT '' NOT NULL,
	"adminFee" bigint DEFAULT 0 NOT NULL,
	"billAmount" bigint DEFAULT 0 NOT NULL,
	"totalAmount" bigint DEFAULT 0 NOT NULL,
	"providerRef" text NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_inquiries_providerRef_unique" UNIQUE("providerRef"),
	CONSTRAINT "bill_inquiries_amounts_nonnegative" CHECK (
      "bill_inquiries"."adminFee" >= 0
      AND "bill_inquiries"."billAmount" >= 0
      AND "bill_inquiries"."totalAmount" >= 0
    )
);
--> statement-breakpoint
CREATE TABLE "catalog_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"iconKey" text DEFAULT 'grid' NOT NULL,
	"accent" text DEFAULT 'sky' NOT NULL,
	"kind" text DEFAULT 'prepaid' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "catalog_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"subgroupId" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"vendor" text,
	"matchType" text NOT NULL,
	"matchValue" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_subgroups" (
	"id" text PRIMARY KEY NOT NULL,
	"groupId" text NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"iconUrl" text,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "subgroupId" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "billInquiryId" text;--> statement-breakpoint
ALTER TABLE "bill_inquiries" ADD CONSTRAINT "bill_inquiries_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_inquiries" ADD CONSTRAINT "bill_inquiries_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_inquiries" ADD CONSTRAINT "bill_inquiries_subgroupId_catalog_subgroups_id_fk" FOREIGN KEY ("subgroupId") REFERENCES "public"."catalog_subgroups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_rules" ADD CONSTRAINT "catalog_rules_subgroupId_catalog_subgroups_id_fk" FOREIGN KEY ("subgroupId") REFERENCES "public"."catalog_subgroups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_subgroups" ADD CONSTRAINT "catalog_subgroups_groupId_catalog_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."catalog_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_inquiries_user_status_idx" ON "bill_inquiries" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "bill_inquiries_expiry_idx" ON "bill_inquiries" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "catalog_groups_enabled_sort_idx" ON "catalog_groups" USING btree ("enabled","sortOrder");--> statement-breakpoint
CREATE INDEX "catalog_rules_priority_idx" ON "catalog_rules" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "catalog_rules_subgroup_idx" ON "catalog_rules" USING btree ("subgroupId");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_subgroups_group_slug_unique" ON "catalog_subgroups" USING btree ("groupId","slug");--> statement-breakpoint
CREATE INDEX "catalog_subgroups_group_sort_idx" ON "catalog_subgroups" USING btree ("groupId","sortOrder");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_subgroupId_catalog_subgroups_id_fk" FOREIGN KEY ("subgroupId") REFERENCES "public"."catalog_subgroups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_billInquiryId_bill_inquiries_id_fk" FOREIGN KEY ("billInquiryId") REFERENCES "public"."bill_inquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_subgroup_status_idx" ON "products" USING btree ("subgroupId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_bill_inquiry_unique" ON "transactions" USING btree ("billInquiryId") WHERE "transactions"."billInquiryId" IS NOT NULL;