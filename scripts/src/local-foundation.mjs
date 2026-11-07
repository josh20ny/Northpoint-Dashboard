import { spawnSync, spawn } from "node:child_process";

// Portable single-origin development preview, deliberately not used by managed
// Replit workflows. This does not apply migrations or create users.
const env = {
  ...process.env,
  NODE_ENV: "development",
  PORT: process.env.PORT ?? "5000",
  BASE_PATH: "/",
  SERVE_WEB: "true",
  AUTH_PROVIDER: "disabled",
};
for (const command of [
  ["--filter", "@workspace/northpoint-dashboard", "run", "build"],
  ["--filter", "@workspace/api-server", "run", "build"],
]) {
  const result = spawnSync("pnpm", command, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const server = spawn("pnpm", ["--filter", "@workspace/api-server", "run", "start"], {
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 1));
