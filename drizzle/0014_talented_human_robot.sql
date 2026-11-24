CREATE TABLE `legal_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`updatedBy` text,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
