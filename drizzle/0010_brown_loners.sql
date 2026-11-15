ALTER TABLE `transactions` ADD `needsManualReview` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `manualReviewAt` integer;