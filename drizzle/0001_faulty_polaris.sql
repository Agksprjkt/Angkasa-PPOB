CREATE TABLE `balance_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotencyKey` text NOT NULL,
	`userId` text NOT NULL,
	`actorId` text,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`balanceBefore` integer NOT NULL,
	`balanceAfter` integer NOT NULL,
	`reference` text NOT NULL,
	`note` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "balance_ledger_amount_positive" CHECK("balance_ledger"."amount" > 0),
	CONSTRAINT "balance_ledger_balance_nonnegative" CHECK("balance_ledger"."balanceBefore" >= 0 AND "balance_ledger"."balanceAfter" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `balance_ledger_idempotencyKey_unique` ON `balance_ledger` (`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `balance_ledger_user_created_idx` ON `balance_ledger` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `balance_ledger_reference_idx` ON `balance_ledger` (`reference`);--> statement-breakpoint
CREATE TABLE `deposits` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`amount` integer NOT NULL,
	`type` text NOT NULL,
	`targetBank` text,
	`proofUrl` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`adminNote` text,
	`reviewedBy` text,
	`reviewedAt` integer,
	`idempotencyKey` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "deposits_amount_positive" CHECK("deposits"."amount" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deposits_idempotencyKey_unique` ON `deposits` (`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `deposits_user_created_idx` ON `deposits` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `deposits_status_created_idx` ON `deposits` (`status`,`createdAt`);--> statement-breakpoint
CREATE TABLE `integration_settings` (
	`name` text PRIMARY KEY NOT NULL,
	`encryptedValue` text NOT NULL,
	`updatedBy` text,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`invoiceNumber` text NOT NULL,
	`userId` text,
	`customerPhone` text NOT NULL,
	`productId` text NOT NULL,
	`productName` text NOT NULL,
	`category` text NOT NULL,
	`operator` text NOT NULL,
	`destination` text NOT NULL,
	`serverZoneId` text,
	`productPrice` integer NOT NULL,
	`adminFee` integer NOT NULL,
	`totalPay` integer NOT NULL,
	`paymentMethod` text NOT NULL,
	`paymentStatus` text DEFAULT 'unpaid' NOT NULL,
	`transactionStatus` text DEFAULT 'pending' NOT NULL,
	`sn` text,
	`qrCodeUrl` text,
	`vaNumber` text,
	`proofUrl` text,
	`expiresAt` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "invoices_amounts_nonnegative" CHECK("invoices"."productPrice" >= 0 AND "invoices"."adminFee" >= 0 AND "invoices"."totalPay" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_invoiceNumber_unique` ON `invoices` (`invoiceNumber`);--> statement-breakpoint
CREATE INDEX `invoices_user_created_idx` ON `invoices` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`paymentStatus`,`transactionStatus`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`vendorCode` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`operator` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`basePrice` integer NOT NULL,
	`sellPriceUser` integer NOT NULL,
	`sellPriceAgent` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`vendor` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "products_prices_nonnegative" CHECK(
      "products"."basePrice" >= 0
      AND "products"."sellPriceUser" >= 0
      AND "products"."sellPriceAgent" >= 0
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_vendorCode_unique` ON `products` (`vendorCode`);--> statement-breakpoint
CREATE INDEX `products_category_status_idx` ON `products` (`category`,`status`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`referenceId` text NOT NULL,
	`idempotencyKey` text NOT NULL,
	`invoiceId` text,
	`userId` text,
	`customerPhone` text,
	`productId` text NOT NULL,
	`productName` text NOT NULL,
	`category` text NOT NULL,
	`operator` text NOT NULL,
	`destination` text NOT NULL,
	`customerName` text,
	`amount` integer NOT NULL,
	`profit` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`paymentMethod` text NOT NULL,
	`sn` text,
	`vendorResponse` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "transactions_amount_nonnegative" CHECK("transactions"."amount" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_referenceId_unique` ON `transactions` (`referenceId`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_idempotencyKey_unique` ON `transactions` (`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `transactions_user_created_idx` ON `transactions` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `transactions_status_created_idx` ON `transactions` (`status`,`createdAt`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`eventId` text NOT NULL,
	`eventType` text NOT NULL,
	`processedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_events_provider_event_uidx` ON `webhook_events` (`provider`,`eventId`);