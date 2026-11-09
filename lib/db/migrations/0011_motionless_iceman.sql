ALTER TABLE "pco_sync_schedules" DROP CONSTRAINT "pco_schedule_frequency";--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD COLUMN "interval_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD COLUMN "interval_unit" text DEFAULT 'days' NOT NULL;--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD COLUMN "anchor_date" date DEFAULT '1970-01-05' NOT NULL;--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD CONSTRAINT "pco_schedule_interval_count" CHECK ("pco_sync_schedules"."interval_count" BETWEEN 1 AND 365);--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD CONSTRAINT "pco_schedule_interval_unit" CHECK ("pco_sync_schedules"."interval_unit" IN ('hours','days','weeks'));--> statement-breakpoint
SELECT set_config('np.role','admin',true);--> statement-breakpoint
UPDATE "pco_sync_schedules" SET
  "interval_count"=CASE WHEN "frequency"='twice_daily' THEN 12 ELSE 6 END,
  "interval_unit"='hours',"frequency"='custom'
WHERE "frequency" IN ('twice_daily','every_6_hours');--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD CONSTRAINT "pco_schedule_frequency" CHECK ("pco_sync_schedules"."frequency" IN ('daily','weekly','custom'));