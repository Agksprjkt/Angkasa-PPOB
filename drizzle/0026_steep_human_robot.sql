ALTER TABLE `products` ADD `disabledBy` text;--> statement-breakpoint
ALTER TABLE `products` ADD `disabledReason` text;--> statement-breakpoint
ALTER TABLE `products` ADD `disabledAt` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `failureStreak` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `lastFailureAt` integer;