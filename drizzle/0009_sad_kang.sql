CREATE TABLE `order_lookup_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`identifierHash` text NOT NULL,
	`codeHash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expiresAt` integer NOT NULL,
	`consumedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "order_lookup_challenges_attempts_nonnegative" CHECK("order_lookup_challenges"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `order_lookup_challenges_expiry_idx` ON `order_lookup_challenges` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `order_lookup_grants` (
	`tokenHash` text PRIMARY KEY NOT NULL,
	`invoiceId` text,
	`transactionId` text,
	`expiresAt` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transactionId`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "order_lookup_grants_one_target" CHECK(("order_lookup_grants"."invoiceId" IS NOT NULL AND "order_lookup_grants"."transactionId" IS NULL) OR ("order_lookup_grants"."invoiceId" IS NULL AND "order_lookup_grants"."transactionId" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `order_lookup_grants_invoice_idx` ON `order_lookup_grants` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `order_lookup_grants_transaction_idx` ON `order_lookup_grants` (`transactionId`);--> statement-breakpoint
CREATE INDEX `order_lookup_grants_expiry_idx` ON `order_lookup_grants` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `order_lookup_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`windowStartedAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "order_lookup_rate_limits_attempts_nonnegative" CHECK("order_lookup_rate_limits"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `order_lookup_rate_limits_expiry_idx` ON `order_lookup_rate_limits` (`expiresAt`);