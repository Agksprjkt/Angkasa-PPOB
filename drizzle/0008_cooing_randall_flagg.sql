ALTER TABLE `product_provider_settings` ADD `memberPricingType` text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_provider_settings` ADD `memberPricingValue` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `product_provider_settings`
SET `memberPricingType` = `pricingType`, `memberPricingValue` = `pricingValue`;