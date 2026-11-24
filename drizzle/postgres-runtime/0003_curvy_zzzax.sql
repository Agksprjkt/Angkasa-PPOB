CREATE TABLE "legal_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"updatedBy" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
