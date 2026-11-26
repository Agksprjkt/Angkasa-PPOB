ALTER TABLE `store_settings` ADD `ogImageFile` text;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `seoNoIndex` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `ogTitle` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `ogDescription` text DEFAULT '' NOT NULL;