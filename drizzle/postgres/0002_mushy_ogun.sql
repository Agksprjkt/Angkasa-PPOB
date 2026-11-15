CREATE TABLE "integration_settings" (
	"name" text PRIMARY KEY NOT NULL,
	"encryptedValue" text NOT NULL,
	"updatedBy" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;