import { z } from "zod/v4";

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
    AUTH_PROVIDER: z.enum(["disabled", "replit"]).default("disabled"),
    AUTH_ORIGIN: z.string().url().optional(),
    REPL_ID: z.string().optional(),
    REPORTING_TIMEZONE: z.literal("America/Chicago").default("America/Chicago"),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
      .default("info"),
  })
  .superRefine((value, context) => {
    if (value.AUTH_PROVIDER !== "replit") return;
    if (!value.REPL_ID)
      context.addIssue({ code: "custom", path: ["REPL_ID"], message: "Required" });
    if (
      !value.AUTH_ORIGIN ||
      !/^https:\/\/[^/]+$/.test(value.AUTH_ORIGIN) ||
      new URL(value.AUTH_ORIGIN).origin !== value.AUTH_ORIGIN
    ) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_ORIGIN"],
        message: "Exact HTTPS origin required",
      });
    }
  });

// Never include Zod's input values in errors: env inputs may contain credentials.
export function validateEnvironment(input: Record<string, string | undefined>) {
  const result = environmentSchema.safeParse(input);
  const invalidFields = result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join("."));
  // Persistent infrastructure, provisioned once outside the running application.
  // Never generate a replacement or include this secret in returned configuration.
  if (!/^[a-f0-9]{64}$/i.test(input.PCO_TOKEN_ENCRYPTION_KEY ?? ""))
    invalidFields.push("PCO_TOKEN_ENCRYPTION_KEY");
  if (invalidFields.length)
    throw new Error(`Invalid environment fields: ${invalidFields.join(", ")}`);
  if (!result.success) throw new Error("Invalid environment");
  return result.data;
}
