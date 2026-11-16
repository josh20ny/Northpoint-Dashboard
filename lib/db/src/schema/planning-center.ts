import { sql } from "drizzle-orm";
import {
  pgTable,
  pgPolicy,
  text,
  uuid,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
  check,
  boolean,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./access";
import { rawSourceRecordsTable } from "./source-records";

const admin = () =>
  pgPolicy("pco_admin_only", {
    using: sql`current_setting('np.role',true) = 'admin'`,
    withCheck: sql`current_setting('np.role',true) = 'admin'`,
  });
export const pcoConnections = pgTable(
  "pco_connections",
  {
    id: text("id").primaryKey().default("planning_center"),
    accountRef: text("account_ref").notNull(),
    accountName: text("account_name").notNull(),
    state: text("state").notNull(),
    scopes: jsonb("scopes").notNull(),
    tokenCiphertext: text("token_ciphertext"),
    connectedBy: uuid("connected_by")
      .notNull()
      .references(() => usersTable.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [
    admin(),
    check("pco_single_connection", sql`${t.id} = 'planning_center'`),
    check(
      "pco_connection_state",
      sql`${t.state} IN ('pending','connected','reconnect_required','disconnected')`,
    ),
  ],
).enableRLS();
export const pcoFlows = pgTable(
  "pco_oauth_flows",
  {
    stateHash: text("state_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    sessionHash: text("session_hash").notNull(),
    verifierCiphertext: text("verifier_ciphertext").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  () => [admin()],
).enableRLS();
export const pcoSyncRuns = pgTable(
  "pco_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountRef: text("account_ref").notNull(),
    product: text("product").notNull(),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("running"),
    queue: jsonb("queue").notNull(),
    visited: jsonb("visited").notNull().default([]),
    fetched: integer("fetched").notNull().default(0),
    revised: integer("revised").notNull().default(0),
    pages: integer("pages").notNull().default(0),
    startedBy: uuid("started_by")
      .notNull()
      .references(() => usersTable.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    retryAt: timestamp("retry_at", { withTimezone: true }),
    automatic: boolean("automatic").notNull().default(false),
    automaticRequestedBy: uuid("automatic_requested_by").references(() => usersTable.id),
    lastAutomaticAt: timestamp("last_automatic_at", { withTimezone: true }),
    lifecycleVersion: integer("lifecycle_version").notNull().default(1),
    coverageStart: date("coverage_start", { mode: "string" }),
    coverageEnd: date("coverage_end", { mode: "string" }),
  },
  (t) => [
    admin(),
    check(
      "pco_sync_product",
      sql`${t.product} IN ('people','services','check_ins','giving','groups','serving')`,
    ),
    check("pco_sync_mode", sql`${t.mode} IN ('backfill','incremental','current')`),
    check(
      "pco_sync_status",
      sql`${t.status} IN ('running','retry','complete','failed','cancelled')`,
    ),
    uniqueIndex("pco_one_active_sync")
      .on(t.accountRef, t.product)
      .where(sql`${t.status} IN ('running','retry')`),
  ],
).enableRLS();
// An explicit, minimized normalized projection with immutable source lineage.
// Check-Ins retain only requested display names and grade for Admin resolution;
// no birthdates, contacts, health notes, security codes or metric publication.
export const pcoSourceEntities = pgTable(
  "pco_source_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountRef: text("account_ref").notNull(),
    product: text("product").notNull(),
    objectType: text("object_type").notNull(),
    externalId: text("external_id").notNull(),
    rawId: uuid("raw_id")
      .notNull()
      .references(() => rawSourceRecordsTable.id),
    syncRunId: uuid("sync_run_id")
      .notNull()
      .references(() => pcoSyncRuns.id),
    normalized: jsonb("normalized").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
    observedRunId: uuid("observed_run_id").references(() => pcoSyncRuns.id),
    missingRunId: uuid("missing_run_id").references(() => pcoSyncRuns.id),
  },
  (t) => [
    admin(),
    uniqueIndex("pco_entity_identity").on(t.accountRef, t.product, t.objectType, t.externalId),
    index("pco_checkin_relationships").using(
      "gin", sql`(${t.normalized}->'sourceRelationships') jsonb_path_ops`,
    ).where(sql`${t.product}='check_ins' AND ${t.objectType}='CheckIn' AND ${t.observedRunId} IS NOT NULL AND ${t.missingRunId} IS NULL`),
  ],
).enableRLS();
// Positive observations are independent of payload version selection.
// Immutable per-run evidence supports completed-scan absence assessments.
export const pcoSourceObservations = pgTable(
  "pco_source_observations",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => pcoSyncRuns.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => pcoSourceEntities.id),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [admin(), primaryKey({ columns: [t.runId, t.entityId] })],
).enableRLS();
export const pcoSyncSchedules = pgTable(
  "pco_sync_schedules",
  {
    id: text("id").primaryKey().default("planning_center"),
    accountRef: text("account_ref").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    timeZone: text("time_zone").notNull().default("America/Chicago"),
    localTime: text("local_time").notNull().default("01:00"),
    frequency: text("frequency").notNull().default("daily"),
    weekDays: jsonb("week_days").notNull().default([0]),
    intervalCount: integer("interval_count").notNull().default(1),
    intervalUnit: text("interval_unit").notNull().default("days"),
    anchorDate: date("anchor_date", { mode: "string" }).notNull().default("1970-01-05"),
    authorizedBy: uuid("authorized_by")
      .notNull()
      .references(() => usersTable.id),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
    lastFinishedAt: timestamp("last_finished_at", { withTimezone: true }),
    activeRunId: uuid("active_run_id").references(() => pcoSyncRuns.id),
    remaining: jsonb("remaining").notNull().default([]),
    products: jsonb("products").notNull().default(["people", "services", "check_ins"]),
    status: text("status").notNull().default("idle"),
    error: text("error"),
  },
  (t) => [
    admin(),
    check("pco_schedule_singleton", sql`${t.id} = 'planning_center'`),
    check("pco_schedule_frequency", sql`${t.frequency} IN ('daily','weekly','custom')`),
    check("pco_schedule_interval_count", sql`${t.intervalCount} BETWEEN 1 AND 365`),
    check("pco_schedule_interval_unit", sql`${t.intervalUnit} IN ('hours','days','weeks')`),
    check("pco_schedule_time", sql`${t.localTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check(
      "pco_schedule_status",
      sql`${t.status} IN ('idle','running','complete','failed','cancelled')`,
    ),
  ],
).enableRLS();
export const insertPcoSyncSchema = createInsertSchema(pcoSyncRuns).omit({
  id: true,
  startedAt: true,
});
export type PcoSyncRun = typeof pcoSyncRuns.$inferSelect;
