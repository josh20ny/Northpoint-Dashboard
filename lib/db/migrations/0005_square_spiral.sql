-- Older migrations defined policies by hand, outside Drizzle snapshots.
-- Replace only those same policies transactionally, on both intact and drifted schemas.
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['import_batches','import_cells','import_mappings','import_week_reviews','import_staged_rows','import_upload_attempts']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS import_admin_only ON %I',tab);
  END LOOP;
  DROP POLICY IF EXISTS raw_admin_only ON raw_source_records;
END $$;
--> statement-breakpoint
CREATE POLICY "import_admin_only" ON "import_batches" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');--> statement-breakpoint
CREATE POLICY "import_admin_only" ON "import_cells" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');--> statement-breakpoint
CREATE POLICY "import_admin_only" ON "import_mappings" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');--> statement-breakpoint
CREATE POLICY "import_admin_only" ON "import_week_reviews" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');--> statement-breakpoint
CREATE POLICY "import_admin_only" ON "import_staged_rows" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');--> statement-breakpoint
CREATE POLICY "import_admin_only" ON "import_upload_attempts" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');--> statement-breakpoint
CREATE POLICY "raw_admin_only" ON "raw_source_records" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true) = 'admin') WITH CHECK (current_setting('np.role',true) = 'admin');