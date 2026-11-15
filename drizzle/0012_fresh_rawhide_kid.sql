CREATE TABLE `transaction_pins` (
	`userId` text PRIMARY KEY NOT NULL,
	`pinHash` text NOT NULL,
	`failedAttempts` integer DEFAULT 0 NOT NULL,
	`lockedUntil` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "transaction_pins_attempts_nonnegative" CHECK("transaction_pins"."failedAttempts" >= 0)
);