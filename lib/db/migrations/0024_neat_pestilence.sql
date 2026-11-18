ALTER TABLE "ministry_metric_values" DROP CONSTRAINT "ministry_metric_sunday";--> statement-breakpoint
DROP INDEX "ministry_metric_identity";--> statement-breakpoint
ALTER TABLE "ministry_metric_values" ADD COLUMN "period" text DEFAULT 'week' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_metric_identity" ON "ministry_metric_values" USING btree ("publication_id","ministry","measure","scope","period","week","unit");--> statement-breakpoint
ALTER TABLE "ministry_metric_values" ADD CONSTRAINT "ministry_metric_period" CHECK ("ministry_metric_values"."period" IN ('week','month'));--> statement-breakpoint
ALTER TABLE "ministry_metric_values" ADD CONSTRAINT "ministry_metric_period_date" CHECK (("ministry_metric_values"."period"='week' AND extract(dow FROM "ministry_metric_values"."week")=0) OR ("ministry_metric_values"."period"='month' AND extract(day FROM "ministry_metric_values"."week")=1));