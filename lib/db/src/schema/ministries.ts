import { sql } from "drizzle-orm";
import { pgTable, text, uuid, date, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const ministriesTable = pgTable(
  "ministries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    activeFrom: date("active_from", { mode: "string" }),
    activeTo: date("active_to", { mode: "string" }),
  },
  (t) => [
    check(
      "ministry_date_order",
      sql`${t.activeTo} IS NULL OR ${t.activeFrom} IS NULL OR ${t.activeTo} >= ${t.activeFrom}`,
    ),
  ],
);
export const insertMinistrySchema = createInsertSchema(ministriesTable).omit({ id: true });
export type MinistryRecord = typeof ministriesTable.$inferSelect;
