import { sql } from "drizzle-orm";
import {
  pgTable,
  pgPolicy,
  uuid,
  text,
  integer,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  check,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./access";
import { ministriesTable } from "./ministries";
import { serviceOccurrencesTable } from "./services";
import { importBatchesTable } from "./imports";

const readPolicy = () =>
  pgPolicy("attendance_read", {
    for: "select",
    using: sql`current_setting('np.role',true) IN ('staff','leadership','admin')`,
  });
const adminPolicy = () =>
  pgPolicy("attendance_admin", {
    for: "insert",
    withCheck: sql`current_setting('np.role',true) = 'admin'`,
  });
export const attendanceDefinitions = pgTable(
  "attendance_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ministryId: uuid("ministry_id")
      .notNull()
      .references(() => ministriesTable.id),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    version: integer("version").notNull(),
    note: text("note").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [readPolicy(), adminPolicy(), uniqueIndex("attendance_definition_version").on(t.version)],
).enableRLS();

export const attendanceRevisions = pgTable(
  "attendance_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull(),
    inputHash: text("input_hash").notNull(),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => attendanceDefinitions.id),
    serviceDate: date("service_date", { mode: "string" }).notNull(),
    slot: text("slot").notNull(),
    occurrenceId: uuid("occurrence_id").references(() => serviceOccurrencesTable.id),
    occurrenceSnapshot: jsonb("occurrence_snapshot"),
    count: integer("count"),
    status: text("status").notNull(),
    source: text("source").notNull(),
    reviewMethod: text("review_method"),
    note: text("note").notNull(),
    previousId: uuid("previous_id").references((): AnyPgColumn => attendanceRevisions.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    readPolicy(),
    pgPolicy("attendance_write", {
      for: "insert",
      withCheck: sql`current_setting('np.role',true) IN ('staff','leadership','admin') AND ${t.createdBy}::text = current_setting('np.user_id',true)`,
    }),
    uniqueIndex("attendance_request").on(t.requestId),
    uniqueIndex("attendance_one_successor").on(t.previousId),
    uniqueIndex("attendance_one_root")
      .on(t.definitionId, t.serviceDate, t.slot)
      .where(sql`${t.previousId} IS NULL`),
    index("attendance_scope").on(t.definitionId, t.serviceDate, t.slot),
    check(
      "attendance_count_state",
      sql`(${t.status}='recorded' AND ${t.count} IS NOT NULL AND ${t.count}>=0) OR (${t.status}='unrecorded' AND ${t.count} IS NULL)`,
    ),
    check("attendance_slot", sql`${t.slot} IN ('adult_service_1','adult_service_2')`),
    check("attendance_source", sql`${t.source} IN ('manual','workbook')`),
    check("attendance_sunday", sql`extract(dow FROM ${t.serviceDate})=0`),
  ],
).enableRLS();

export const attendanceLineage = pgTable(
  "attendance_lineage",
  {
    revisionId: uuid("revision_id")
      .primaryKey()
      .references(() => attendanceRevisions.id),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatchesTable.id),
    evidenceHash: text("evidence_hash").notNull(),
    mappingIds: jsonb("mapping_ids").notNull(),
    ministry: text("ministry").notNull(),
  },
  () => [
    pgPolicy("attendance_lineage_admin", {
      using: sql`current_setting('np.role',true)='admin'`,
      withCheck: sql`current_setting('np.role',true)='admin'`,
    }),
  ],
).enableRLS();
export const insertAttendanceDefinitionSchema = createInsertSchema(attendanceDefinitions);
export const insertAttendanceRevisionSchema = createInsertSchema(attendanceRevisions);
export const insertAttendanceLineageSchema = createInsertSchema(attendanceLineage);
export type AttendanceDefinitionRow = typeof attendanceDefinitions.$inferSelect;
export type AttendanceRevisionRow = typeof attendanceRevisions.$inferSelect;
