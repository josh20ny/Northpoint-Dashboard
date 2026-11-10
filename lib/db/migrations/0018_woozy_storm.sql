CREATE TABLE "ministry_metric_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"ministry" text NOT NULL,
	"measure" text NOT NULL,
	"scope" text NOT NULL,
	"week" date NOT NULL,
	"value" bigint,
	"unit" text NOT NULL,
	"quality" text NOT NULL,
	"denominator" bigint,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "ministry_metric_safe_number" CHECK ("ministry_metric_values"."value" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "ministry_metric_sunday" CHECK (extract(dow FROM "ministry_metric_values"."week")=0)
);
--> statement-breakpoint
ALTER TABLE "ministry_metric_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ministry_publication_evidence" (
	"publication_id" uuid PRIMARY KEY NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ministry_publication_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ministry_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product" text NOT NULL,
	"account_ref" text NOT NULL,
	"source_key" text NOT NULL,
	"source_kind" text NOT NULL,
	"definition_version" text NOT NULL,
	"source_as_of" timestamp with time zone NOT NULL,
	"coverage_start" date NOT NULL,
	"coverage_end" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ministry_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ministry_source_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product" text NOT NULL,
	"object_type" text NOT NULL,
	"external_id" text NOT NULL,
	"account_ref" text NOT NULL,
	"ministry" text NOT NULL,
	"measure" text NOT NULL,
	"scope" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"note" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ministry_mapping_dates" CHECK ("ministry_source_mappings"."effective_to" IS NULL OR "ministry_source_mappings"."effective_to">="ministry_source_mappings"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "ministry_source_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pco_sync_runs" DROP CONSTRAINT "pco_sync_product";--> statement-breakpoint
ALTER TABLE "ministry_metric_values" ADD CONSTRAINT "ministry_metric_values_publication_id_ministry_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."ministry_publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_publication_evidence" ADD CONSTRAINT "ministry_publication_evidence_publication_id_ministry_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."ministry_publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_publication_evidence" ADD CONSTRAINT "ministry_publication_evidence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_source_mappings" ADD CONSTRAINT "ministry_source_mappings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_metric_identity" ON "ministry_metric_values" USING btree ("publication_id","ministry","measure","scope","week");--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_publication_identity" ON "ministry_publications" USING btree ("product","account_ref","source_key");--> statement-breakpoint
ALTER TABLE "pco_sync_runs" ADD CONSTRAINT "pco_sync_product" CHECK ("pco_sync_runs"."product" IN ('people','services','check_ins','giving','groups','serving'));--> statement-breakpoint
CREATE POLICY "ministry_metric_read" ON "ministry_metric_values" AS PERMISSIVE FOR SELECT TO public USING (current_setting('np.role',true) IN ('staff','leadership','admin'));--> statement-breakpoint
CREATE POLICY "ministry_metric_write" ON "ministry_metric_values" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_setting('np.role',true)='admin');--> statement-breakpoint
CREATE POLICY "ministry_admin" ON "ministry_publication_evidence" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true)='admin') WITH CHECK (current_setting('np.role',true)='admin');--> statement-breakpoint
CREATE POLICY "ministry_publication_read" ON "ministry_publications" AS PERMISSIVE FOR SELECT TO public USING (current_setting('np.role',true) IN ('staff','leadership','admin'));--> statement-breakpoint
CREATE POLICY "ministry_publication_write" ON "ministry_publications" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_setting('np.role',true)='admin');--> statement-breakpoint
CREATE POLICY "ministry_admin" ON "ministry_source_mappings" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true)='admin') WITH CHECK (current_setting('np.role',true)='admin');