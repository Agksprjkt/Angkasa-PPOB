CREATE TABLE "bill_inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"productId" text NOT NULL,
	"vendor" text NOT NULL,
	"destination" text NOT NULL,
	"customerName" text DEFAULT '' NOT NULL,
	"billAmount" bigint DEFAULT 0 NOT NULL,
	"adminFee" bigint DEFAULT 0 NOT NULL,
	"totalAmount" bigint DEFAULT 0 NOT NULL,
	"providerRef" text NOT NULL,
	"providerTrxId" text,
	"lines" jsonb NOT NULL,
	"periods" jsonb NOT NULL,
	"dueDate" text,
	"status" text DEFAULT 'open' NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_inquiries_providerRef_unique" UNIQUE("providerRef"),
	CONSTRAINT "bill_inquiries_amounts_nonnegative" CHECK (
      "bill_inquiries"."billAmount" >= 0
      AND "bill_inquiries"."adminFee" >= 0
      AND "bill_inquiries"."totalAmount" >= 0
    )
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "billInquiryId" text;--> statement-breakpoint
ALTER TABLE "bill_inquiries" ADD CONSTRAINT "bill_inquiries_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_inquiries" ADD CONSTRAINT "bill_inquiries_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_inquiries_user_status_idx" ON "bill_inquiries" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "bill_inquiries_expiry_idx" ON "bill_inquiries" USING btree ("expiresAt");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_billInquiryId_bill_inquiries_id_fk" FOREIGN KEY ("billInquiryId") REFERENCES "public"."bill_inquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_bill_inquiry_unique" ON "transactions" USING btree ("billInquiryId") WHERE "transactions"."billInquiryId" IS NOT NULL;