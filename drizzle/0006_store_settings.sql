CREATE TABLE `store_settings` (
  `id` text PRIMARY KEY NOT NULL,
  `storeName` text DEFAULT 'PAYKU PPOB' NOT NULL,
  `tagline` text DEFAULT '' NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `supportPhone` text DEFAULT '' NOT NULL,
  `logoFile` text,
  `seoTitle` text DEFAULT '' NOT NULL,
  `seoDescription` text DEFAULT '' NOT NULL,
  `googleSiteVerification` text DEFAULT '' NOT NULL,
  `bingSiteVerification` text DEFAULT '' NOT NULL,
  `indexNowKey` text,
  `updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
