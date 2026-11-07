import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./access";

export const importBatchesTable = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sha256: text("sha256").notNull(),
    filename: text("filename").notNull(),
    snapshotDate: text("snapshot_date").notNull(),
    objectPath: text("object_path").notNull(),
    catalog: jsonb("catalog").notNull(),
    state: text("state").notNull().default("active"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("import_digest_snapshot").on(t.sha256, t.snapshotDate)],
);
export const importCellsTable = pgTable(
  "import_cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatchesTable.id),
    sheet: text("sheet").notNull(),
    coordinate: text("coordinate").notNull(),
    cell: jsonb("cell").notNull(),
  },
  (t) => [uniqueIndex("import_cell_lineage").on(t.batchId, t.sheet, t.coordinate)],
);
export const importMappingsTable = pgTable("import_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => importBatchesTable.id),
  definition: jsonb("definition").notNull(),
  status: text("status").notNull().default("draft"),
  reviewNote: text("review_note"),
  reviewedBy: uuid("reviewed_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const importStagedRowsTable = pgTable(
  "import_staged_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mappingId: uuid("mapping_id")
      .notNull()
      .references(() => importMappingsTable.id),
    sourceRow: text("source_row").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [uniqueIndex("import_staged_lineage").on(t.mappingId, t.sourceRow)],
);
export const importReviewsTable = pgTable(
  "import_week_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatchesTable.id),
    week: text("week").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    note: text("note").notNull(),
    reviewedBy: uuid("reviewed_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("import_week_evidence").on(t.batchId, t.week, t.evidenceHash)],
);
export const insertImportBatchSchema = createInsertSchema(importBatchesTable);
export const insertImportCellSchema = createInsertSchema(importCellsTable);
export const insertImportMappingSchema = createInsertSchema(importMappingsTable);
export const insertImportStagedRowSchema = createInsertSchema(importStagedRowsTable);
export const insertImportReviewSchema = createInsertSchema(importReviewsTable);
export type ImportBatch = typeof importBatchesTable.$inferSelect;
export type ImportCell = typeof importCellsTable.$inferSelect;
export type ImportMapping = typeof importMappingsTable.$inferSelect;
export type ImportStagedRow = typeof importStagedRowsTable.$inferSelect;
export type ImportReview = typeof importReviewsTable.$inferSelect;
