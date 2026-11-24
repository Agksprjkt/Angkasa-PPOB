PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payment_methods` (
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
	CONSTRAINT "payment_methods_required_fields" CHECK((("__new_payment_methods"."type" = 'bank_transfer' OR "__new_payment_methods"."type" = 'ewallet') AND "__new_payment_methods"."bankName" IS NOT NULL AND "__new_payment_methods"."accountNumber" IS NOT NULL AND "__new_payment_methods"."accountHolder" IS NOT NULL) OR ("__new_payment_methods"."type" = 'static_qris' AND "__new_payment_methods"."qrImageFile" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_payment_methods`("id", "type", "label", "bankName", "accountNumber", "accountHolder", "qrImageFile", "instructions", "enabled", "createdAt", "updatedAt") SELECT "id", "type", "label", "bankName", "accountNumber", "accountHolder", "qrImageFile", "instructions", "enabled", "createdAt", "updatedAt" FROM `payment_methods`;--> statement-breakpoint
DROP TABLE `payment_methods`;--> statement-breakpoint
ALTER TABLE `__new_payment_methods` RENAME TO `payment_methods`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `payment_methods_enabled_idx` ON `payment_methods` (`enabled`);