ALTER TABLE `products` ADD `variant` text;--> statement-breakpoint
ALTER TABLE `products` ADD `variantSource` text DEFAULT 'sync' NOT NULL;--> statement-breakpoint
CREATE INDEX `products_variant_idx` ON `products` (`category`,`operator`,`variant`);