CREATE TABLE "workbook_source_authorities" (
	"batch_id" uuid PRIMARY KEY NOT NULL,
	"sha256" text NOT NULL,
	"basis" text NOT NULL,
	"origin" text NOT NULL,
	"authorized_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workbook_authority_basis" CHECK (length(trim("workbook_source_authorities"."basis"))>=20),
	CONSTRAINT "workbook_authority_origin" CHECK (("workbook_source_authorities"."origin"='owner_instruction' AND "workbook_source_authorities"."authorized_by" IS NULL) OR ("workbook_source_authorities"."origin"='authenticated_admin' AND "workbook_source_authorities"."authorized_by" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "workbook_source_authorities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_revisions" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workbook_source_authorities" ADD CONSTRAINT "workbook_source_authorities_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workbook_source_authorities" ADD CONSTRAINT "workbook_source_authorities_authorized_by_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_revisions" ADD CONSTRAINT "attendance_manual_actor" CHECK ("attendance_revisions"."source"<>'manual' OR "attendance_revisions"."created_by" IS NOT NULL);--> statement-breakpoint
CREATE POLICY "workbook_authority_admin" ON "workbook_source_authorities" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true)='admin') WITH CHECK (current_setting('np.role',true)='admin');--> statement-breakpoint
ALTER POLICY "attendance_write" ON "attendance_revisions" TO public WITH CHECK ((current_setting('np.role',true) IN ('staff','leadership','admin') AND "attendance_revisions"."created_by"::text = current_setting('np.user_id',true)) OR (current_setting('np.role',true)='admin' AND "attendance_revisions"."created_by" IS NULL AND "attendance_revisions"."source"='workbook' AND "attendance_revisions"."review_method"='workbook_authoritative'));
--> statement-breakpoint
ALTER TABLE workbook_source_authorities FORCE ROW LEVEL SECURITY;
CREATE TRIGGER workbook_authority_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON workbook_source_authorities FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION np_attendance_source_valid(revision uuid) RETURNS boolean
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
  PERFORM set_config('np.role','admin',true);
  SELECT * INTO l FROM attendance_lineage WHERE revision_id=revision;
  SELECT jsonb_agg(m.id::text ORDER BY m.id::text) INTO ids
    FROM import_mappings m
    WHERE m.batch_id=l.batch_id AND m.status='approved'
      AND m.definition->>'target'=r.slot AND m.definition->>'unit'='attendance_count'
      AND m.definition->>'ministry'=l.ministry
      AND EXISTS (SELECT 1 FROM import_staged_rows s WHERE s.mapping_id=m.id AND s.data->>'sundayDate'=r.service_date::text);
  valid := l.revision_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM import_batches WHERE id=l.batch_id AND state='active')
    AND (
      EXISTS (SELECT 1 FROM import_week_reviews WHERE batch_id=l.batch_id AND week=r.service_date::text AND evidence_hash=l.evidence_hash)
      OR (r.review_method='workbook_authoritative' AND EXISTS (
        SELECT 1 FROM workbook_source_authorities a JOIN import_batches b ON b.id=a.batch_id AND b.sha256=a.sha256
        WHERE a.batch_id=l.batch_id
      ))
    )
    AND ids IS NOT DISTINCT FROM l.mapping_ids;
  PERFORM set_config('np.role',caller_role,true);
  RETURN valid;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('np.role',coalesce(caller_role,''),true);
  RAISE;
END $$;