ALTER TABLE `store_settings` ADD `iconFile` text;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `faviconFile` text;--> statement-breakpoint
ALTER TABLE `store_settings` ADD `socialLinks` text DEFAULT '[]' NOT NULL;