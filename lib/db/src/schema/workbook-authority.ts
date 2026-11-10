import { sql } from "drizzle-orm";
import { pgTable, pgPolicy, uuid, text, timestamp, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { importBatchesTable } from "./imports";
import { usersTable } from "./access";

// Source-level acceptance is distinct from individual evidence reviews. Null
// authorizedBy means an explicitly documented owner instruction, not a forged
// signed-in application approval.
export const workbookSourceAuthorities = pgTable(
  "workbook_source_authorities",
  {
    batchId: uuid("batch_id")
      .primaryKey()
      .references(() => importBatchesTable.id),
    sha256: text("sha256").notNull(),
    basis: text("basis").notNull(),
    origin: text("origin").notNull(),
    authorizedBy: uuid("authorized_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy("workbook_authority_admin", {
      using: sql`current_setting('np.role',true)='admin'`,
      withCheck: sql`current_setting('np.role',true)='admin'`,
    }),
    check("workbook_authority_basis", sql`length(trim(${t.basis}))>=20`),
    check(
      "workbook_authority_origin",
      sql`(${t.origin}='owner_instruction' AND ${t.authorizedBy} IS NULL) OR (${t.origin}='authenticated_admin' AND ${t.authorizedBy} IS NOT NULL)`,
    ),
  ],
).enableRLS();
export const insertWorkbookSourceAuthoritySchema = createInsertSchema(workbookSourceAuthorities);
export type WorkbookSourceAuthority = typeof workbookSourceAuthorities.$inferSelect;
