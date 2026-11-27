ALTER TABLE `catalog_groups` ADD `productCategory` text;--> statement-breakpoint
ALTER TABLE `catalog_groups` ADD `includeUnmapped` integer DEFAULT false NOT NULL;