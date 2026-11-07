import { pgTable, text, uuid, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Revision-keyed raw provenance only. No ingestion or raw payload read API yet.
export const rawSourceRecordsTable = pgTable(
  "raw_source_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    accountRef: text("account_ref").notNull(),
    objectType: text("object_type").notNull(),
    externalId: text("external_id").notNull(),
    payload: jsonb("payload_json").notNull(),
    payloadHash: text("payload_hash").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("raw_source_revision_unique").on(
      t.provider,
      t.accountRef,
      t.objectType,
      t.externalId,
      t.payloadHash,
    ),
  ],
);
export const insertRawSourceSchema = createInsertSchema(rawSourceRecordsTable).omit({
  id: true,
  ingestedAt: true,
});
export type RawSourceRecord = typeof rawSourceRecordsTable.$inferSelect;
