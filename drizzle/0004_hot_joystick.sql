ALTER TABLE `invoices` ADD `vendorCode` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `customerName` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `basePrice` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `qrString` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `providerReference` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `idempotencyKey` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `guestAccessTokenHash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_providerReference_unique` ON `invoices` (`providerReference`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_idempotencyKey_unique` ON `invoices` (`idempotencyKey`);