CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sha256" text NOT NULL,
	"filename" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"object_path" text NOT NULL,
	"catalog" jsonb NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"sheet" text NOT NULL,
	"coordinate" text NOT NULL,
	"cell" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"definition" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_week_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"week" text NOT NULL,
	"evidence_hash" text NOT NULL,
	"note" text NOT NULL,
	"reviewed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_staged_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mapping_id" uuid NOT NULL,
	"source_row" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_cells" ADD CONSTRAINT "import_cells_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_mappings" ADD CONSTRAINT "import_mappings_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_mappings" ADD CONSTRAINT "import_mappings_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_week_reviews" ADD CONSTRAINT "import_week_reviews_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_week_reviews" ADD CONSTRAINT "import_week_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_staged_rows" ADD CONSTRAINT "import_staged_rows_mapping_id_import_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."import_mappings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_digest_snapshot" ON "import_batches" USING btree ("sha256","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "import_cell_lineage" ON "import_cells" USING btree ("batch_id","sheet","coordinate");--> statement-breakpoint
CREATE UNIQUE INDEX "import_week_evidence" ON "import_week_reviews" USING btree ("batch_id","week","evidence_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "import_staged_lineage" ON "import_staged_rows" USING btree ("mapping_id","source_row");
--> statement-breakpoint
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['import_batches','import_cells','import_mappings','import_staged_rows','import_week_reviews']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('CREATE POLICY import_admin_only ON %I USING (current_setting(''np.role'',true) = ''admin'') WITH CHECK (current_setting(''np.role'',true) = ''admin'')',tab);
    EXECUTE format('CREATE TRIGGER import_no_delete BEFORE DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes()',tab);
  END LOOP;
  FOREACH tab IN ARRAY ARRAY['import_cells','import_staged_rows','import_week_reviews']
  LOOP
    EXECUTE format('CREATE TRIGGER import_immutable BEFORE UPDATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes()',tab);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION np_import_provenance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'import_batches' THEN
    IF (to_jsonb(NEW) - 'state') IS DISTINCT FROM (to_jsonb(OLD) - 'state') THEN
      RAISE EXCEPTION 'Import provenance is immutable' USING ERRCODE='42501';
    END IF;
  ELSIF (to_jsonb(NEW) - ARRAY['status','review_note','reviewed_by']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','review_note','reviewed_by']) THEN
    RAISE EXCEPTION 'Mapping versions are immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER import_batch_provenance BEFORE UPDATE ON import_batches FOR EACH ROW EXECUTE FUNCTION np_import_provenance_guard();
--> statement-breakpoint
CREATE TRIGGER import_mapping_provenance BEFORE UPDATE ON import_mappings FOR EACH ROW EXECUTE FUNCTION np_import_provenance_guard();