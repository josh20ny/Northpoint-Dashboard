ALTER TABLE "pco_sync_runs" DROP CONSTRAINT "pco_sync_mode";--> statement-breakpoint
DROP INDEX "ministry_metric_identity";--> statement-breakpoint
ALTER TABLE "pco_sync_runs" ADD COLUMN "coverage_start" date;--> statement-breakpoint
ALTER TABLE "ministry_source_mappings" ADD COLUMN "supersedes_id" uuid;--> statement-breakpoint
ALTER TABLE "ministry_source_mappings" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_mapping_supersession" ON "ministry_source_mappings" USING btree ("supersedes_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_metric_identity" ON "ministry_metric_values" USING btree ("publication_id","ministry","measure","scope","week","unit");--> statement-breakpoint
ALTER TABLE "pco_sync_runs" ADD CONSTRAINT "pco_sync_mode" CHECK ("pco_sync_runs"."mode" IN ('backfill','incremental','current'));
--> statement-breakpoint
-- Additive protection for immutable interpretation/publication history.
ALTER TABLE public.ministry_metric_values FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ministry_publication_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ministry_publications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ministry_source_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ministry_source_mappings ADD CONSTRAINT ministry_mapping_previous_fk
  FOREIGN KEY(supersedes_id) REFERENCES public.ministry_source_mappings(id);
CREATE FUNCTION public.np_ministry_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Ministry history is immutable; append a replacement or publication'; END $$;
CREATE TRIGGER ministry_values_immutable BEFORE UPDATE OR DELETE ON public.ministry_metric_values
  FOR EACH ROW EXECUTE FUNCTION public.np_ministry_immutable();
CREATE TRIGGER ministry_values_no_truncate BEFORE TRUNCATE ON public.ministry_metric_values
  FOR EACH STATEMENT EXECUTE FUNCTION public.np_ministry_immutable();
CREATE TRIGGER ministry_evidence_immutable BEFORE UPDATE OR DELETE ON public.ministry_publication_evidence
  FOR EACH ROW EXECUTE FUNCTION public.np_ministry_immutable();
CREATE TRIGGER ministry_evidence_no_truncate BEFORE TRUNCATE ON public.ministry_publication_evidence
  FOR EACH STATEMENT EXECUTE FUNCTION public.np_ministry_immutable();
CREATE TRIGGER ministry_publications_immutable BEFORE UPDATE OR DELETE ON public.ministry_publications
  FOR EACH ROW EXECUTE FUNCTION public.np_ministry_immutable();
CREATE TRIGGER ministry_publications_no_truncate BEFORE TRUNCATE ON public.ministry_publications
  FOR EACH STATEMENT EXECUTE FUNCTION public.np_ministry_immutable();
CREATE TRIGGER ministry_mappings_immutable BEFORE UPDATE OR DELETE ON public.ministry_source_mappings
  FOR EACH ROW EXECUTE FUNCTION public.np_ministry_immutable();
CREATE TRIGGER ministry_mappings_no_truncate BEFORE TRUNCATE ON public.ministry_source_mappings
  FOR EACH STATEMENT EXECUTE FUNCTION public.np_ministry_immutable();
--> statement-breakpoint
-- Boolean-only source validity boundary. Never returns raw records, mapping
-- notes, source IDs, names or transaction data to aggregate readers.
CREATE FUNCTION public.np_ministry_publication_valid(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE caller_role text; pub public.ministry_publications%ROWTYPE; ev jsonb; expected jsonb; result boolean := false;
BEGIN
  caller_role := current_setting('np.role',true);
  IF caller_role IS NULL OR caller_role NOT IN ('staff','leadership','admin') OR NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id::text=current_setting('np.user_id',true)
      AND u.status='active' AND u.role::text=caller_role
  ) THEN RETURN false; END IF;
  PERFORM set_config('np.role','admin',true);
  SELECT * INTO pub FROM public.ministry_publications WHERE id=p_id;
  SELECT evidence INTO ev FROM public.ministry_publication_evidence WHERE publication_id=p_id;
  IF pub.source_kind='pco' THEN
    SELECT coalesce(jsonb_agg(m.id::text ORDER BY m.id),'[]'::jsonb) INTO expected
      FROM public.ministry_source_mappings m WHERE m.account_ref=pub.account_ref AND m.product=pub.product AND m.enabled
      AND NOT EXISTS(SELECT 1 FROM public.ministry_source_mappings n WHERE n.supersedes_id=m.id);
    result := ev->'mappingIds'=expected AND EXISTS (
      SELECT 1 FROM public.pco_connections v WHERE v.id='planning_center' AND v.account_ref=pub.account_ref
    );
  ELSIF pub.source_kind='workbook' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'source_row',r.source_row,'data',r.data)
      ORDER BY r.source_row::integer),'[]'::jsonb) INTO expected
      FROM public.import_staged_rows r WHERE r.mapping_id::text=ev->'input'->>'mappingId';
    result := ev->'stagedSnapshot'=expected AND EXISTS (
      SELECT 1 FROM public.import_batches b JOIN public.workbook_source_authorities a ON a.batch_id=b.id AND a.sha256=b.sha256
      JOIN public.import_mappings m ON m.batch_id=b.id AND m.id::text=ev->'input'->>'mappingId'
      WHERE b.id::text=pub.account_ref AND b.state='active' AND m.status='approved' AND m.definition=ev->'mapping'
        AND b.snapshot_date=ev->>'snapshotDate' AND b.sha256=ev->>'sha256'
    );
  END IF;
  PERFORM set_config('np.role',caller_role,true);
  RETURN coalesce(result,false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('np.role',coalesce(caller_role,''),true);
  RAISE;
END $$;