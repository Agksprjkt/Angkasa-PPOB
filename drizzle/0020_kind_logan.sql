CREATE TABLE `voucher_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`voucherId` text NOT NULL,
	`userId` text,
	`invoiceId` text,
	`transactionId` text,
	`code` text NOT NULL,
	`discountAmount` integer NOT NULL,
	`status` text NOT NULL,
	`expiresAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`voucherId`) REFERENCES `vouchers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`transactionId`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "voucher_redemptions_single_order" CHECK(
      ("voucher_redemptions"."invoiceId" IS NOT NULL AND "voucher_redemptions"."transactionId" IS NULL)
      OR ("voucher_redemptions"."invoiceId" IS NULL AND "voucher_redemptions"."transactionId" IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voucher_redemptions_invoice_unique` ON `voucher_redemptions` (`invoiceId`);--> statement-breakpoint
CREATE UNIQUE INDEX `voucher_redemptions_transaction_unique` ON `voucher_redemptions` (`transactionId`);--> statement-breakpoint
CREATE INDEX `voucher_redemptions_voucher_status_idx` ON `voucher_redemptions` (`voucherId`,`status`);--> statement-breakpoint
CREATE INDEX `voucher_redemptions_user_idx` ON `voucher_redemptions` (`userId`,`voucherId`,`status`);--> statement-breakpoint
CREATE TABLE `vouchers` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`discountType` text NOT NULL,
	`discountValue` integer NOT NULL,
	`maxDiscount` integer,
	`minOrder` integer DEFAULT 0 NOT NULL,
	`quotaLimit` integer,
	`quantityUsed` integer DEFAULT 0 NOT NULL,
	`perUserLimit` integer,
	`startsAt` integer,
	`endsAt` integer,
	`enabled` integer DEFAULT false NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "vouchers_discount_value_positive" CHECK("vouchers"."discountValue" > 0),
	CONSTRAINT "vouchers_percent_max_100" CHECK(
      "vouchers"."discountType" <> 'percent' OR "vouchers"."discountValue" <= 100
    ),
	CONSTRAINT "vouchers_amounts_nonnegative" CHECK(
      "vouchers"."minOrder" >= 0
      AND "vouchers"."quantityUsed" >= 0
      AND ("vouchers"."maxDiscount" IS NULL OR "vouchers"."maxDiscount" > 0)
      AND ("vouchers"."quotaLimit" IS NULL OR "vouchers"."quotaLimit" >= 0)
      AND ("vouchers"."perUserLimit" IS NULL OR "vouchers"."perUserLimit" > 0)
    ),
	CONSTRAINT "vouchers_valid_schedule" CHECK(
      "vouchers"."startsAt" IS NULL OR "vouchers"."endsAt" IS NULL OR "vouchers"."startsAt" < "vouchers"."endsAt"
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vouchers_code_unique` ON `vouchers` (`code`);--> statement-breakpoint
CREATE INDEX `vouchers_enabled_schedule_idx` ON `vouchers` (`enabled`,`startsAt`,`endsAt`);--> statement-breakpoint
ALTER TABLE `invoices` ADD `voucherCode` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `discountAmount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `voucherCode` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `discountAmount` integer DEFAULT 0 NOT NULL;