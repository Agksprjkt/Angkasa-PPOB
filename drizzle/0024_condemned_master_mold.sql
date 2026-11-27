CREATE TABLE `bill_inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text,
	`productId` text NOT NULL,
	`subgroupId` text,
	`destination` text NOT NULL,
	`customerName` text DEFAULT '' NOT NULL,
	`adminFee` integer DEFAULT 0 NOT NULL,
	`billAmount` integer DEFAULT 0 NOT NULL,
	`totalAmount` integer DEFAULT 0 NOT NULL,
	`providerRef` text NOT NULL,
	`lines` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subgroupId`) REFERENCES `catalog_subgroups`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "bill_inquiries_amounts_nonnegative" CHECK(
      "bill_inquiries"."adminFee" >= 0
      AND "bill_inquiries"."billAmount" >= 0
      AND "bill_inquiries"."totalAmount" >= 0
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_inquiries_providerRef_unique` ON `bill_inquiries` (`providerRef`);--> statement-breakpoint
CREATE INDEX `bill_inquiries_user_status_idx` ON `bill_inquiries` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `bill_inquiries_expiry_idx` ON `bill_inquiries` (`expiresAt`);--> statement-breakpoint
CREATE TABLE `catalog_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`iconKey` text DEFAULT 'grid' NOT NULL,
	`accent` text DEFAULT 'sky' NOT NULL,
	`kind` text DEFAULT 'prepaid' NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_groups_slug_unique` ON `catalog_groups` (`slug`);--> statement-breakpoint
CREATE INDEX `catalog_groups_enabled_sort_idx` ON `catalog_groups` (`enabled`,`sortOrder`);--> statement-breakpoint
CREATE TABLE `catalog_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`subgroupId` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`vendor` text,
	`matchType` text NOT NULL,
	`matchValue` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`subgroupId`) REFERENCES `catalog_subgroups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `catalog_rules_priority_idx` ON `catalog_rules` (`priority`);--> statement-breakpoint
CREATE INDEX `catalog_rules_subgroup_idx` ON `catalog_rules` (`subgroupId`);--> statement-breakpoint
CREATE TABLE `catalog_subgroups` (
	`id` text PRIMARY KEY NOT NULL,
	`groupId` text NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`iconUrl` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `catalog_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_subgroups_group_slug_unique` ON `catalog_subgroups` (`groupId`,`slug`);--> statement-breakpoint
CREATE INDEX `catalog_subgroups_group_sort_idx` ON `catalog_subgroups` (`groupId`,`sortOrder`);--> statement-breakpoint
ALTER TABLE `products` ADD `subgroupId` text REFERENCES catalog_subgroups(id);--> statement-breakpoint
CREATE INDEX `products_subgroup_status_idx` ON `products` (`subgroupId`,`status`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `billInquiryId` text REFERENCES bill_inquiries(id);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_bill_inquiry_unique` ON `transactions` (`billInquiryId`) WHERE "transactions"."billInquiryId" IS NOT NULL;