ALTER TABLE "pco_sync_runs" ADD COLUMN "automatic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pco_sync_runs" ADD COLUMN "automatic_requested_by" uuid;--> statement-breakpoint
ALTER TABLE "pco_sync_runs" ADD COLUMN "last_automatic_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pco_sync_runs" ADD CONSTRAINT "pco_sync_runs_automatic_requested_by_users_id_fk" FOREIGN KEY ("automatic_requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;