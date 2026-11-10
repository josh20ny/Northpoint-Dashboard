import { sql } from "drizzle-orm";
import {
  pgTable,
  pgPolicy,
  uuid,
  integer,
  text,
  jsonb,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./access";
export const givingPolicyVersions = pgTable(
  "giving_policy_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    minimumGifts: integer("minimum_gifts").notNull(),
    toleranceDays: integer("tolerance_days").notNull(),
    missedExpected: integer("missed_expected").notNull(),
    grouping: text("grouping").notNull(),
    cadences: jsonb("cadences").notNull(),
    note: text("note").notNull(),
    previousId: uuid("previous_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy("giving_policy_admin", {
      using: sql`current_setting('np.role',true)='admin'`,
      withCheck: sql`current_setting('np.role',true)='admin'`,
    }),
    check(
      "giving_policy_limits",
      sql`${t.minimumGifts} BETWEEN 3 AND 24 AND ${t.toleranceDays} BETWEEN 0 AND 3 AND ${t.missedExpected} BETWEEN 1 AND 12`,
    ),
    check("giving_policy_grouping", sql`${t.grouping} IN ('person','joint_giving_unit')`),
  ],
).enableRLS();
export const insertGivingPolicySchema = createInsertSchema(givingPolicyVersions);
export type GivingPolicyRecord = typeof givingPolicyVersions.$inferSelect;
