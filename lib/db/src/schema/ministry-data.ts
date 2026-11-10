import { sql } from "drizzle-orm";
import {
  pgTable,
  pgPolicy,
  uuid,
  text,
  date,
  timestamp,
  jsonb,
  bigint,
  uniqueIndex,
  check,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./access";

const admin = () =>
  pgPolicy("ministry_admin", {
    using: sql`current_setting('np.role',true)='admin'`,
    withCheck: sql`current_setting('np.role',true)='admin'`,
  });
// Explicit, effective-dated source interpretation. Never infer from names.
export const ministrySourceMappings = pgTable(
  "ministry_source_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supersedesId: uuid("supersedes_id"),
    enabled: boolean("enabled").notNull().default(true),
    product: text("product").notNull(),
    objectType: text("object_type").notNull(),
    externalId: text("external_id").notNull(),
    accountRef: text("account_ref").notNull(),
    ministry: text("ministry").notNull(),
    measure: text("measure").notNull(),
    scope: text("scope").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    note: text("note").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    admin(),
    uniqueIndex("ministry_mapping_supersession").on(t.supersedesId),
    check(
      "ministry_mapping_dates",
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo}>=${t.effectiveFrom}`,
    ),
  ],
).enableRLS();

// Safe aggregate-only publication. No person IDs, names, notes or raw payloads.
// Each full publication is appended; selecting the newest publication never
// merges incomplete pages with a previously complete dataset.
export const ministryPublications = pgTable(
  "ministry_publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    product: text("product").notNull(),
    accountRef: text("account_ref").notNull(),
    sourceKey: text("source_key").notNull(),
    sourceKind: text("source_kind").notNull(),
    definitionVersion: text("definition_version").notNull(),
    sourceAsOf: timestamp("source_as_of", { withTimezone: true }).notNull(),
    coverageStart: date("coverage_start", { mode: "string" }).notNull(),
    coverageEnd: date("coverage_end", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy("ministry_publication_read", {
      for: "select",
      using: sql`current_setting('np.role',true) IN ('staff','leadership','admin')`,
    }),
    pgPolicy("ministry_publication_write", {
      for: "insert",
      withCheck: sql`current_setting('np.role',true)='admin'`,
    }),
    uniqueIndex("ministry_publication_identity").on(t.product, t.accountRef, t.sourceKey),
  ],
).enableRLS();

export const ministryMetricValues = pgTable(
  "ministry_metric_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => ministryPublications.id),
    ministry: text("ministry").notNull(),
    measure: text("measure").notNull(),
    scope: text("scope").notNull(),
    week: date("week", { mode: "string" }).notNull(),
    value: bigint("value", { mode: "number" }),
    unit: text("unit").notNull(),
    quality: text("quality").notNull(),
    denominator: bigint("denominator", { mode: "number" }),
    flags: jsonb("flags").notNull().default([]),
  },
  (t) => [
    pgPolicy("ministry_metric_read", {
      for: "select",
      using: sql`current_setting('np.role',true) IN ('staff','leadership','admin')`,
    }),
    pgPolicy("ministry_metric_write", {
      for: "insert",
      withCheck: sql`current_setting('np.role',true)='admin'`,
    }),
    uniqueIndex("ministry_metric_identity").on(
      t.publicationId,
      t.ministry,
      t.measure,
      t.scope,
      t.week,
      t.unit,
    ),
    check(
      "ministry_metric_safe_number",
      sql`${t.value} BETWEEN -9007199254740991 AND 9007199254740991`,
    ),
    check("ministry_metric_sunday", sql`extract(dow FROM ${t.week})=0`),
  ],
).enableRLS();

// Restricted lineage lives separately; it can contain source record IDs.
export const ministryPublicationEvidence = pgTable(
  "ministry_publication_evidence",
  {
    publicationId: uuid("publication_id")
      .primaryKey()
      .references(() => ministryPublications.id),
    evidence: jsonb("evidence").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => usersTable.id),
  },
  () => [admin()],
).enableRLS();

export const insertMinistryMappingSchema = createInsertSchema(ministrySourceMappings);
export const insertMinistryPublicationSchema = createInsertSchema(ministryPublications);
export const insertMinistryMetricSchema = createInsertSchema(ministryMetricValues);
export const insertMinistryEvidenceSchema = createInsertSchema(ministryPublicationEvidence);
export type MinistryMappingRecord = typeof ministrySourceMappings.$inferSelect;
export type MinistryPublicationRecord = typeof ministryPublications.$inferSelect;
export type MinistryMetricRecord = typeof ministryMetricValues.$inferSelect;
