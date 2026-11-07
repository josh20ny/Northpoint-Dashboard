import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./access";

// Explicit fields, never arbitrary request metadata or PII snapshots.
export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => usersTable.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    outcome: text("outcome").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_timestamp_idx").on(t.timestamp)],
);
export const insertAuditSchema = createInsertSchema(auditEventsTable).omit({
  id: true,
  timestamp: true,
});
export type AuditEvent = typeof auditEventsTable.$inferSelect;
