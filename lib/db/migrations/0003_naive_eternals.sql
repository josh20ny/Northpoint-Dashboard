-- Development schema sync may already have created the declarative table.
-- Reconcile it without dropping existing upload history.
CREATE TABLE IF NOT EXISTS "import_upload_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sha256" text NOT NULL,
	"filename" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"object_path" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"storage_state" text DEFAULT 'unknown' NOT NULL,
	"failure_phase" text,
	"batch_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='import_upload_attempts'::regclass AND conname='import_upload_attempts_batch_id_import_batches_id_fk') THEN
    ALTER TABLE import_upload_attempts ADD CONSTRAINT import_upload_attempts_batch_id_import_batches_id_fk FOREIGN KEY (batch_id) REFERENCES import_batches(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='import_upload_attempts'::regclass AND conname='import_upload_attempts_created_by_users_id_fk') THEN
    ALTER TABLE import_upload_attempts ADD CONSTRAINT import_upload_attempts_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='import_upload_attempts'::regclass AND conname='import_upload_state') THEN
ALTER TABLE import_upload_attempts ADD CONSTRAINT import_upload_state CHECK (
  status IN ('pending','linked','failed') AND storage_state IN ('unknown','stored')
  AND (failure_phase IS NULL OR failure_phase IN ('storage','storage_confirmation','catalog'))
  AND ((status='linked' AND batch_id IS NOT NULL AND storage_state='stored' AND failure_phase IS NULL)
    OR (status='pending' AND batch_id IS NULL AND failure_phase IS NULL)
    OR (status='failed' AND batch_id IS NULL AND failure_phase IS NOT NULL))
);
END IF;
END $$;
--> statement-breakpoint
-- Existing cataloged originals are known linked; this does not invent past failed attempts.
SELECT set_config('np.role','admin',true);
INSERT INTO import_upload_attempts
  (sha256,filename,snapshot_date,object_path,status,storage_state,batch_id,created_by,created_at,updated_at)
SELECT sha256,filename,snapshot_date,object_path,'linked','stored',id,created_by,created_at,created_at
FROM import_batches b
WHERE NOT EXISTS (
  SELECT 1 FROM import_upload_attempts a WHERE a.batch_id=b.id AND a.status='linked'
);
--> statement-breakpoint
ALTER TABLE import_upload_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_upload_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_admin_only ON import_upload_attempts;
CREATE POLICY import_admin_only ON import_upload_attempts
  USING (current_setting('np.role',true)='admin')
  WITH CHECK (current_setting('np.role',true)='admin');
DROP TRIGGER IF EXISTS import_no_delete ON import_upload_attempts;
CREATE TRIGGER import_no_delete BEFORE DELETE OR TRUNCATE ON import_upload_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION np_import_upload_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'pending'
     OR (to_jsonb(NEW) - ARRAY['status','storage_state','failure_phase','batch_id','updated_at'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['status','storage_state','failure_phase','batch_id','updated_at'])
     OR (OLD.storage_state='stored' AND NEW.storage_state <> 'stored') THEN
    RAISE EXCEPTION 'Upload attempt history is immutable' USING ERRCODE='42501';
  END IF;
  IF NEW.status='linked' AND NOT EXISTS (
    SELECT 1 FROM import_batches b WHERE b.id=NEW.batch_id
    AND b.sha256=NEW.sha256 AND b.snapshot_date=NEW.snapshot_date AND b.object_path=NEW.object_path
  ) THEN
    RAISE EXCEPTION 'Upload attempt must match its original batch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS import_upload_provenance ON import_upload_attempts;
CREATE TRIGGER import_upload_provenance BEFORE UPDATE ON import_upload_attempts
  FOR EACH ROW EXECUTE FUNCTION np_import_upload_guard();