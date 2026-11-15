CREATE TABLE `payment_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`bankName` text,
	`accountNumber` text,
	`accountHolder` text,
	`qrImageFile` text,
	`instructions` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "payment_methods_required_fields" CHECK(("payment_methods"."type" = 'bank_transfer' AND "payment_methods"."bankName" IS NOT NULL AND "payment_methods"."accountNumber" IS NOT NULL AND "payment_methods"."accountHolder" IS NOT NULL) OR ("payment_methods"."type" = 'static_qris' AND "payment_methods"."qrImageFile" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `payment_methods_enabled_idx` ON `payment_methods` (`enabled`);--> statement-breakpoint
ALTER TABLE `deposits` ADD `providerReference` text;--> statement-breakpoint
ALTER TABLE `deposits` ADD `qrString` text;--> statement-breakpoint
ALTER TABLE `deposits` ADD `expiresAt` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `deposits_providerReference_unique` ON `deposits` (`providerReference`);