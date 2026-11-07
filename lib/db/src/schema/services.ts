import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  date,
  timestamp,
  integer,
  index,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { ministriesTable } from "./ministries";

export const serviceOccurrencesTable = pgTable(
  "service_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ministryId: uuid("ministry_id")
      .notNull()
      .references(() => ministriesTable.id),
    serviceDate: date("service_date", { mode: "string" }).notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull().default("America/Chicago"),
    locationRef: text("location_ref"),
    planExternalId: text("plan_external_id"),
    specialEventRef: text("special_event_ref"),
    capacity: integer("capacity"),
  },
  (t) => [
    index("service_date_idx").on(t.serviceDate),
    uniqueIndex("service_occurrence_unique").on(t.ministryId, t.startAt),
    check("service_capacity_nonnegative", sql`${t.capacity} IS NULL OR ${t.capacity} >= 0`),
    check("service_timezone", sql`${t.timezone} = 'America/Chicago'`),
    check(
      "service_local_date",
      sql`${t.serviceDate} = (${t.startAt} AT TIME ZONE 'America/Chicago')::date`,
    ),
  ],
);
export const insertServiceSchema = createInsertSchema(serviceOccurrencesTable).omit({ id: true });
export type ServiceOccurrence = typeof serviceOccurrencesTable.$inferSelect;
