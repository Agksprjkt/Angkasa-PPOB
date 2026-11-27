CREATE TABLE `bill_inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text,
	`productId` text NOT NULL,
	`vendor` text NOT NULL,
	`destination` text NOT NULL,
	`customerName` text DEFAULT '' NOT NULL,
	`billAmount` integer DEFAULT 0 NOT NULL,
	`adminFee` integer DEFAULT 0 NOT NULL,
	`totalAmount` integer DEFAULT 0 NOT NULL,
	`providerRef` text NOT NULL,
	`providerTrxId` text,
	`lines` text NOT NULL,
	`periods` text NOT NULL,
	`dueDate` text,
	`status` text DEFAULT 'open' NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bill_inquiries_amounts_nonnegative" CHECK(
      "bill_inquiries"."billAmount" >= 0
      AND "bill_inquiries"."adminFee" >= 0
      AND "bill_inquiries"."totalAmount" >= 0
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_inquiries_providerRef_unique` ON `bill_inquiries` (`providerRef`);--> statement-breakpoint
CREATE INDEX `bill_inquiries_user_status_idx` ON `bill_inquiries` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `bill_inquiries_expiry_idx` ON `bill_inquiries` (`expiresAt`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `billInquiryId` text REFERENCES bill_inquiries(id);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_bill_inquiry_unique` ON `transactions` (`billInquiryId`) WHERE "transactions"."billInquiryId" IS NOT NULL;