ALTER TABLE "pco_sync_schedules" ADD COLUMN "time_zone" text DEFAULT 'America/Chicago' NOT NULL;--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD COLUMN "local_time" text DEFAULT '01:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD COLUMN "frequency" text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD COLUMN "week_days" jsonb DEFAULT '[0]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD CONSTRAINT "pco_schedule_frequency" CHECK ("pco_sync_schedules"."frequency" IN ('daily','twice_daily','every_6_hours','weekly'));--> statement-breakpoint
ALTER TABLE "pco_sync_schedules" ADD CONSTRAINT "pco_schedule_time" CHECK ("pco_sync_schedules"."local_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');