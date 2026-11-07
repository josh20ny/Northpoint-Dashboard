import { z } from "zod/v4";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  AUTH_PROVIDER: z.literal("disabled").default("disabled"),
  REPORTING_TIMEZONE: z.literal("America/Chicago").default("America/Chicago"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
});

// Never include Zod's input values in errors: env inputs may contain credentials.
export function validateEnvironment(input: Record<string, string | undefined>) {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid environment fields: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  return result.data;
}
