ALTER TABLE `products` ADD `compareAtPrice` integer;
--> statement-breakpoint
CREATE TABLE `product_provider_settings` (
  `id` text PRIMARY KEY NOT NULL,
  `category` text NOT NULL,
  `operator` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `iconUrl` text,
  `coverUrl` text,
  `pricingType` text DEFAULT 'fixed' NOT NULL,
  `pricingValue` integer DEFAULT 0 NOT NULL,
  `createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_provider_settings_category_operator_unique` ON `product_provider_settings` (`category`, `operator`);
