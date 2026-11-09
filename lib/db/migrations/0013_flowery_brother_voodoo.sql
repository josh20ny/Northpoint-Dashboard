CREATE TABLE "attendance_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ministry_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"version" integer NOT NULL,
	"note" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attendance_lineage" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"evidence_hash" text NOT NULL,
	"mapping_ids" jsonb NOT NULL,
	"ministry" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_lineage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attendance_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"definition_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"slot" text NOT NULL,
	"occurrence_id" uuid,
	"occurrence_snapshot" jsonb,
	"count" integer,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"review_method" text,
	"note" text NOT NULL,
	"previous_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "attendance_count_state" CHECK (("attendance_revisions"."status"='recorded' AND "attendance_revisions"."count" IS NOT NULL AND "attendance_revisions"."count">=0) OR ("attendance_revisions"."status"='unrecorded' AND "attendance_revisions"."count" IS NULL)),
	CONSTRAINT "attendance_slot" CHECK ("attendance_revisions"."slot" IN ('adult_service_1','adult_service_2')),
	CONSTRAINT "attendance_source" CHECK ("attendance_revisions"."source" IN ('manual','workbook')),
	CONSTRAINT "attendance_sunday" CHECK (extract(dow FROM "attendance_revisions"."service_date")=0)
);
--> statement-breakpoint
ALTER TABLE "attendance_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_definitions" ADD CONSTRAINT "attendance_definitions_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_definitions" ADD CONSTRAINT "attendance_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_lineage" ADD CONSTRAINT "attendance_lineage_revision_id_attendance_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."attendance_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_lineage" ADD CONSTRAINT "attendance_lineage_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_revisions" ADD CONSTRAINT "attendance_revisions_definition_id_attendance_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."attendance_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_revisions" ADD CONSTRAINT "attendance_revisions_occurrence_id_service_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."service_occurrences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_revisions" ADD CONSTRAINT "attendance_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_definition_version" ON "attendance_definitions" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_request" ON "attendance_revisions" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_one_successor" ON "attendance_revisions" USING btree ("previous_id");--> statement-breakpoint
CREATE INDEX "attendance_scope" ON "attendance_revisions" USING btree ("definition_id","service_date","slot");--> statement-breakpoint
CREATE POLICY "attendance_read" ON "attendance_definitions" AS PERMISSIVE FOR SELECT TO public USING (current_setting('np.role',true) IN ('staff','leadership','admin'));--> statement-breakpoint
CREATE POLICY "attendance_admin" ON "attendance_definitions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_setting('np.role',true) = 'admin');--> statement-breakpoint
CREATE POLICY "attendance_lineage_admin" ON "attendance_lineage" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true)='admin') WITH CHECK (current_setting('np.role',true)='admin');--> statement-breakpoint
CREATE POLICY "attendance_read" ON "attendance_revisions" AS PERMISSIVE FOR SELECT TO public USING (current_setting('np.role',true) IN ('staff','leadership','admin'));--> statement-breakpoint
CREATE POLICY "attendance_write" ON "attendance_revisions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_setting('np.role',true) IN ('staff','leadership','admin') AND "attendance_revisions"."created_by"::text = current_setting('np.user_id',true));
--> statement-breakpoint
ALTER TABLE attendance_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE attendance_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE attendance_lineage FORCE ROW LEVEL SECURITY;
CREATE TRIGGER attendance_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON attendance_definitions FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes();
CREATE TRIGGER attendance_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON attendance_revisions FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes();
CREATE TRIGGER attendance_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON attendance_lineage FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes();
--> statement-breakpoint
-- Boolean-only evidence check. Never returns raw/import data to aggregate readers.
-- The owner of this function must retain the trusted migration-owner privileges.
CREATE FUNCTION np_attendance_source_valid(revision uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r attendance_revisions; l attendance_lineage; ids jsonb; caller_role text; valid boolean;
BEGIN
  caller_role := current_setting('np.role',true);
  IF caller_role NOT IN ('staff','leadership','admin') OR caller_role IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO r FROM attendance_revisions WHERE id=revision;
  IF NOT FOUND THEN RETURN false; END IF;
  IF r.source='manual' THEN RETURN true; END IF;
  -- Elevation stays inside the boolean function and is restored on every path.
  PERFORM set_config('np.role','admin',true);
  SELECT * INTO l FROM attendance_lineage WHERE revision_id=revision;
  SELECT jsonb_agg(m.id::text ORDER BY m.id::text) INTO ids
    FROM import_mappings m
    WHERE m.batch_id=l.batch_id AND m.status='approved'
      AND m.definition->>'target'=r.slot
      AND m.definition->>'unit'='attendance_count'
      AND m.definition->>'ministry'=l.ministry
      AND EXISTS (SELECT 1 FROM import_staged_rows s WHERE s.mapping_id=m.id AND s.data->>'sundayDate'=r.service_date::text);
  valid := l.revision_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM import_batches WHERE id=l.batch_id AND state='active')
    AND EXISTS (SELECT 1 FROM import_week_reviews WHERE batch_id=l.batch_id AND week=r.service_date::text AND evidence_hash=l.evidence_hash)
    AND ids IS NOT DISTINCT FROM l.mapping_ids;
  PERFORM set_config('np.role',caller_role,true);
  RETURN valid;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('np.role',coalesce(caller_role,''),true);
  RAISE;
END $$;