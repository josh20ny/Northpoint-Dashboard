import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod/v4";

// Infrastructure metadata only. No production ministry/person models in Phase 0.
export const foundationMetadata = pgTable("foundation_metadata", {
  key: text("key").primaryKey(),
  version: text("version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const insertFoundationMetadata = createInsertSchema(foundationMetadata).omit({
  createdAt: true,
});
export type FoundationMetadataInput = z.infer<typeof insertFoundationMetadata>;
