import { spawnSync } from "node:child_process";
if (process.env.NODE_ENV === "production") {
  throw new Error("Local migration command is not permitted in production.");
}
// This command is only for local/development and CI PostgreSQL targets.
// Managed production schema changes must use the platform's Publish flow.
const result = spawnSync("pnpm", ["--filter", "@workspace/db", "run", "migrate:local"], {
  env: process.env,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
