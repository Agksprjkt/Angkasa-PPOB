DROP INDEX `products_vendorCode_unique`;--> statement-breakpoint
ALTER TABLE `products` ADD `vendorLabel` text;--> statement-breakpoint
CREATE UNIQUE INDEX `products_vendor_code_unique` ON `products` (`vendor`,`vendorCode`);--> statement-breakpoint
CREATE INDEX `products_vendor_status_idx` ON `products` (`vendor`,`status`);