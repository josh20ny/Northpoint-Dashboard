CREATE TABLE "pco_source_observations" (
	"run_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pco_source_observations_run_id_entity_id_pk" PRIMARY KEY("run_id","entity_id")
);
--> statement-breakpoint
ALTER TABLE "pco_source_observations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pco_source_entities" ADD COLUMN "observed_run_id" uuid;--> statement-breakpoint
ALTER TABLE "pco_source_entities" ADD COLUMN "missing_run_id" uuid;--> statement-breakpoint
-- Existing and in-flight runs have incomplete observation evidence.
ALTER TABLE "pco_sync_runs" ADD COLUMN "lifecycle_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pco_sync_runs" ALTER COLUMN "lifecycle_version" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "pco_source_observations" ADD CONSTRAINT "pco_source_observations_run_id_pco_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pco_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pco_source_observations" ADD CONSTRAINT "pco_source_observations_entity_id_pco_source_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."pco_source_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pco_source_entities" ADD CONSTRAINT "pco_source_entities_observed_run_id_pco_sync_runs_id_fk" FOREIGN KEY ("observed_run_id") REFERENCES "public"."pco_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pco_source_entities" ADD CONSTRAINT "pco_source_entities_missing_run_id_pco_sync_runs_id_fk" FOREIGN KEY ("missing_run_id") REFERENCES "public"."pco_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "pco_admin_only" ON "pco_source_observations" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');--> statement-breakpoint
ALTER TABLE "pco_source_observations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER pco_observations_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON pco_source_observations
FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes();