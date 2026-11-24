CREATE TABLE `featured_products` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`operator` text NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `featured_products_provider_idx` ON `featured_products` (`category`,`operator`);--> statement-breakpoint
CREATE INDEX `featured_products_enabled_sort_idx` ON `featured_products` (`enabled`,`sortOrder`);