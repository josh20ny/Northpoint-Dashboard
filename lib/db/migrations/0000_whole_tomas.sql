CREATE TABLE "foundation_metadata" (
	"key" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "foundation_metadata" ("key", "version") VALUES ('application', 'phase-0');
