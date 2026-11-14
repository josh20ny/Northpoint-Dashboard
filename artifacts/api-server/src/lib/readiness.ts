export async function databaseReadiness() {
  if (!process.env.DATABASE_URL) {
    return { status: "not_ready", connectivity: "not_configured", migration: "not_verified" };
  }
  try {
    const { pool } = await import("@workspace/db");
    const result = await pool.query<{ version: string; schema_ready: boolean }>(
      `SELECT version,
        to_regclass('users') IS NOT NULL AND to_regclass('auth_sessions') IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('workbook_source_authorities') AND relrowsecurity AND relforcerowsecurity)
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('workbook_source_authorities') AND tgname='workbook_authority_immutable' AND tgenabled<>'D')
        AND to_regclass('people') IS NOT NULL AND to_regclass('service_occurrences') IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='audit_append_only' AND tgenabled<>'D')
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='raw_append_only' AND tgenabled<>'D')
        AND EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('raw_source_records') AND relrowsecurity AND relforcerowsecurity)
        AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('raw_source_records') AND polname='raw_admin_only')
        AND (SELECT count(*) FROM pg_class WHERE oid IN
          (to_regclass('import_batches'),to_regclass('import_cells'),to_regclass('import_mappings'),
           to_regclass('import_staged_rows'),to_regclass('import_week_reviews'))
          AND relrowsecurity AND relforcerowsecurity)=5
        AND (SELECT count(*) FROM pg_policy WHERE polname='import_admin_only' AND polrelid IN
          (to_regclass('import_batches'),to_regclass('import_cells'),to_regclass('import_mappings'),
           to_regclass('import_staged_rows'),to_regclass('import_week_reviews')))=5
        AND (SELECT count(*) FROM pg_trigger WHERE tgname='import_no_delete' AND tgenabled<>'D' AND tgrelid IN
          (to_regclass('import_batches'),to_regclass('import_cells'),to_regclass('import_mappings'),
           to_regclass('import_staged_rows'),to_regclass('import_week_reviews')))=5
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='import_mapping_provenance' AND tgenabled<>'D')
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='import_batch_provenance' AND tgenabled<>'D')
        AND EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('import_upload_attempts') AND relrowsecurity AND relforcerowsecurity)
        AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('import_upload_attempts') AND polname='import_admin_only')
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('import_upload_attempts') AND tgname='import_no_delete' AND tgenabled<>'D')
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('import_upload_attempts') AND tgname='import_upload_provenance' AND tgenabled<>'D')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name='import_week_reviews' AND column_name='review_method')
        AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('import_week_reviews')
          AND conname='import_review_method')
        AND (SELECT count(*) FROM pg_class WHERE oid IN
          (to_regclass('pco_connections'),to_regclass('pco_oauth_flows'),
           to_regclass('pco_sync_runs'),to_regclass('pco_source_entities'),to_regclass('pco_sync_schedules'),
           to_regclass('pco_source_observations'))
          AND relrowsecurity AND relforcerowsecurity)=6
        AND (SELECT count(*) FROM pg_policy WHERE polname='pco_admin_only' AND polrelid IN
          (to_regclass('pco_connections'),to_regclass('pco_oauth_flows'),
           to_regclass('pco_sync_runs'),to_regclass('pco_source_entities'),to_regclass('pco_sync_schedules'),
           to_regclass('pco_source_observations')))=6
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('pco_source_observations')
          AND tgname='pco_observations_append_only' AND tgenabled<>'D')
        AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
          AND table_name='pco_source_entities' AND column_name IN ('observed_run_id','missing_run_id'))=2
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name='pco_sync_runs' AND column_name='lifecycle_version')
        AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
          AND table_name='pco_sync_schedules' AND column_name IN ('time_zone','local_time','frequency','week_days','interval_count','interval_unit','anchor_date'))=7
        AND (SELECT count(*) FROM pg_trigger WHERE tgname='pco_no_delete' AND tgenabled<>'D'
          AND tgrelid IN (to_regclass('pco_connections'),to_regclass('pco_source_entities'),to_regclass('pco_sync_runs')))=3
         AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
           AND table_name='pco_sync_runs'
           AND column_name IN ('automatic','automatic_requested_by','last_automatic_at'))=3
        AND (SELECT count(*) FROM pg_trigger WHERE tgname='import_immutable' AND tgenabled<>'D' AND tgrelid IN
          (to_regclass('import_cells'),to_regclass('import_staged_rows'),to_regclass('import_week_reviews')))=3
        AND (SELECT count(*) FROM pg_class WHERE oid IN
          (to_regclass('attendance_definitions'),to_regclass('attendance_revisions'),to_regclass('attendance_lineage'))
          AND relrowsecurity AND relforcerowsecurity)=3
        AND (SELECT count(*) FROM pg_trigger WHERE tgname='attendance_immutable' AND tgenabled<>'D' AND tgrelid IN
          (to_regclass('attendance_definitions'),to_regclass('attendance_revisions'),to_regclass('attendance_lineage')))=3
        AND to_regprocedure('np_attendance_source_valid(uuid)') IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('attendance_revisions') AND polname='attendance_write')
        AND to_regclass('attendance_one_root') IS NOT NULL
        AND (SELECT count(*) FROM pg_class WHERE oid IN (
          to_regclass('ministry_metric_values'),to_regclass('ministry_publication_evidence'),
          to_regclass('ministry_publications'),to_regclass('ministry_source_mappings'))
          AND relrowsecurity AND relforcerowsecurity)=4
        AND (SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'ministry_%_immutable'
          AND tgenabled<>'D' AND tgrelid IN (
          to_regclass('ministry_metric_values'),to_regclass('ministry_publication_evidence'),
          to_regclass('ministry_publications'),to_regclass('ministry_source_mappings')))=4
        AND to_regprocedure('np_ministry_publication_valid(uuid)') IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('giving_policy_versions')
          AND relrowsecurity AND relforcerowsecurity)
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='giving_policy_immutable' AND tgenabled<>'D')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name='pco_sync_runs' AND column_name='coverage_start')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name='pco_sync_runs' AND column_name='coverage_end')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name='pco_sync_schedules' AND column_name='products')
        AS schema_ready FROM foundation_metadata WHERE key = $1`,
      ["application"],
    );
    const ready = result.rows[0]?.version === "phase-1" && result.rows[0]?.schema_ready;
    return {
      status: ready ? "ready" : "not_ready",
      connectivity: "connected",
      migration: ready ? "applied" : "pending",
    };
  } catch (error) {
    // SQLSTATE only, never error.message (which can contain SQL or connection data).
    const code = (error as { code?: string }).code;
    return {
      status: "not_ready",
      connectivity: code === "42P01" ? "connected" : "unavailable",
      migration: code === "42P01" ? "pending" : "not_verified",
    };
  }
}
