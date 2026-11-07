import { pgTable, text, uuid, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// No names, birth dates, contact details, or attendance endpoints in this phase.
export const peopleTable = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalPersonRef: text("canonical_person_ref").unique(),
  sourceLinkStatus: text("source_link_status").notNull().default("unresolved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const externalPersonIdsTable = pgTable(
  "external_person_ids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => peopleTable.id),
    provider: text("provider").notNull(),
    accountRef: text("account_ref").notNull(),
    externalId: text("external_id").notNull(),
  },
  (t) => [uniqueIndex("external_person_account_unique").on(t.provider, t.accountRef, t.externalId)],
);
export const insertPersonSchema = createInsertSchema(peopleTable).omit({
  id: true,
  createdAt: true,
});
export type PersonReference = typeof peopleTable.$inferSelect;
