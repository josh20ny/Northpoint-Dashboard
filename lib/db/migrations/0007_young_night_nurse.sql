CREATE TABLE "pco_connections" (
	"id" text PRIMARY KEY DEFAULT 'planning_center' NOT NULL,
	"account_ref" text NOT NULL,
	"account_name" text NOT NULL,
	"state" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"token_ciphertext" text,
	"connected_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "pco_single_connection" CHECK ("pco_connections"."id" = 'planning_center'),
	CONSTRAINT "pco_connection_state" CHECK ("pco_connections"."state" IN ('pending','connected','reconnect_required','disconnected'))
);
--> statement-breakpoint
ALTER TABLE "pco_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pco_oauth_flows" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_hash" text NOT NULL,
	"verifier_ciphertext" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pco_oauth_flows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pco_source_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_ref" text NOT NULL,
	"product" text NOT NULL,
	"object_type" text NOT NULL,
	"external_id" text NOT NULL,
	"raw_id" uuid NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"normalized" jsonb NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pco_source_entities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pco_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_ref" text NOT NULL,
	"product" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"queue" jsonb NOT NULL,
	"visited" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"revised" integer DEFAULT 0 NOT NULL,
	"pages" integer DEFAULT 0 NOT NULL,
	"started_by" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"retry_at" timestamp with time zone,
	CONSTRAINT "pco_sync_product" CHECK ("pco_sync_runs"."product" IN ('people','services','check_ins')),
	CONSTRAINT "pco_sync_mode" CHECK ("pco_sync_runs"."mode" IN ('backfill','incremental')),
	CONSTRAINT "pco_sync_status" CHECK ("pco_sync_runs"."status" IN ('running','retry','complete','failed','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "pco_sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pco_connections" ADD CONSTRAINT "pco_connections_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pco_oauth_flows" ADD CONSTRAINT "pco_oauth_flows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pco_source_entities" ADD CONSTRAINT "pco_source_entities_raw_id_raw_source_records_id_fk" FOREIGN KEY ("raw_id") REFERENCES "public"."raw_source_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pco_source_entities" ADD CONSTRAINT "pco_source_entities_sync_run_id_pco_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."pco_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pco_sync_runs" ADD CONSTRAINT "pco_sync_runs_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pco_entity_identity" ON "pco_source_entities" USING btree ("account_ref","product","object_type","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pco_one_active_sync" ON "pco_sync_runs" USING btree ("account_ref","product") WHERE "pco_sync_runs"."status" IN ('running','retry');--> statement-breakpoint
CREATE POLICY "pco_admin_only" ON "pco_connections" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');--> statement-breakpoint
CREATE POLICY "pco_admin_only" ON "pco_oauth_flows" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');--> statement-breakpoint
CREATE POLICY "pco_admin_only" ON "pco_source_entities" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');--> statement-breakpoint
CREATE POLICY "pco_admin_only" ON "pco_sync_runs" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');
--> statement-breakpoint
ALTER TABLE pco_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE pco_oauth_flows FORCE ROW LEVEL SECURITY;
ALTER TABLE pco_sync_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE pco_source_entities FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TRIGGER pco_no_delete BEFORE DELETE OR TRUNCATE ON pco_sync_runs
FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes();
CREATE TRIGGER pco_no_delete BEFORE DELETE OR TRUNCATE ON pco_source_entities
FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes();
CREATE TRIGGER pco_no_delete BEFORE DELETE OR TRUNCATE ON pco_connections
FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes();