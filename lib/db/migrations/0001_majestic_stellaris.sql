-- Phase 1 adds no real people, services, counts, donor or provider records.
CREATE TYPE "public"."user_role" AS ENUM('staff', 'leadership', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "auth_flows" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"nonce" text NOT NULL,
	"verifier" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"csrf_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"auth_subject" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ministries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"active_from" date,
	"active_to" date,
	CONSTRAINT "ministries_code_unique" UNIQUE("code"),
	CONSTRAINT "ministry_date_order" CHECK ("ministries"."active_to" IS NULL OR "ministries"."active_from" IS NULL OR "ministries"."active_to" >= "ministries"."active_from")
);
--> statement-breakpoint
CREATE TABLE "service_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ministry_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"location_ref" text,
	"plan_external_id" text,
	"special_event_ref" text,
	"capacity" integer,
	CONSTRAINT "service_capacity_nonnegative" CHECK ("service_occurrences"."capacity" IS NULL OR "service_occurrences"."capacity" >= 0),
	CONSTRAINT "service_timezone" CHECK ("service_occurrences"."timezone" = 'America/Chicago'),
	CONSTRAINT "service_local_date" CHECK ("service_occurrences"."service_date" = ("service_occurrences"."start_at" AT TIME ZONE 'America/Chicago')::date)
);
--> statement-breakpoint
CREATE TABLE "external_person_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"account_ref" text NOT NULL,
	"external_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_person_ref" text,
	"source_link_status" text DEFAULT 'unresolved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_canonical_person_ref_unique" UNIQUE("canonical_person_ref")
);
--> statement-breakpoint
CREATE TABLE "raw_source_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"account_ref" text NOT NULL,
	"object_type" text NOT NULL,
	"external_id" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"outcome" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_invitations" ADD CONSTRAINT "access_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_occurrences" ADD CONSTRAINT "service_occurrences_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_person_ids" ADD CONSTRAINT "external_person_ids_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_provider_subject_unique" ON "users" USING btree ("provider","auth_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "service_date_idx" ON "service_occurrences" USING btree ("service_date");--> statement-breakpoint
CREATE UNIQUE INDEX "service_occurrence_unique" ON "service_occurrences" USING btree ("ministry_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "external_person_account_unique" ON "external_person_ids" USING btree ("provider","account_ref","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_source_revision_unique" ON "raw_source_records" USING btree ("provider","account_ref","object_type","external_id","payload_hash");--> statement-breakpoint
CREATE INDEX "audit_timestamp_idx" ON "audit_events" USING btree ("timestamp");--> statement-breakpoint
CREATE FUNCTION np_forbid_history_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Append-only history' USING ERRCODE = '42501';
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_events
FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes();--> statement-breakpoint
CREATE TRIGGER raw_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON raw_source_records
FOR EACH STATEMENT EXECUTE FUNCTION np_forbid_history_changes();--> statement-breakpoint
ALTER TABLE raw_source_records ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE raw_source_records FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY raw_admin_only ON raw_source_records
USING (current_setting('np.role', true) = 'admin')
WITH CHECK (current_setting('np.role', true) = 'admin');--> statement-breakpoint
ALTER TABLE ministries ADD CONSTRAINT ministry_parent_fk FOREIGN KEY (parent_id) REFERENCES ministries(id);--> statement-breakpoint
UPDATE foundation_metadata SET version = 'phase-1' WHERE key = 'application';