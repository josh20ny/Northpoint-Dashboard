CREATE TABLE "pco_sync_schedules" (
	"id" text PRIMARY KEY DEFAULT 'planning_center' NOT NULL,
	"account_ref" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"authorized_by" uuid NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"active_run_id" uuid,
	"remaining" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"error" text,
	CONSTRAINT "pco_schedule_singleton" CHECK ("pco_sync_schedules"."id" = 'planning_center'),
	CONSTRAINT "pco_schedule_status" CHECK ("pco_sync_schedules"."status" IN ('idle','running','complete','failed','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD CONSTRAINT "pco_sync_schedules_authorized_by_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD CONSTRAINT "pco_sync_schedules_active_run_id_pco_sync_runs_id_fk" FOREIGN KEY ("active_run_id") REFERENCES "public"."pco_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "pco_admin_only" ON "pco_sync_schedules" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" FORCE ROW LEVEL SECURITY;