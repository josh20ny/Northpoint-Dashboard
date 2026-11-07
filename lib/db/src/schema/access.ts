import { pgEnum, pgTable, text, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const userRole = pgEnum("user_role", ["staff", "leadership", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "suspended"]);
export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    subject: text("auth_subject").notNull(),
    email: text("email").notNull(),
    role: userRole("role").notNull(),
    status: userStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_provider_subject_unique").on(t.provider, t.subject),
    uniqueIndex("users_email_unique").on(t.email),
  ],
);
export const invitationsTable = pgTable("access_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  role: userRole("role").notNull(),
  createdBy: uuid("created_by").references(() => usersTable.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const sessionsTable = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    csrfToken: text("csrf_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);
export const authFlowsTable = pgTable("auth_flows", {
  tokenHash: text("token_hash").primaryKey(),
  state: text("state").notNull(),
  nonce: text("nonce").notNull(),
  verifier: text("verifier").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type LocalUser = typeof usersTable.$inferSelect;
