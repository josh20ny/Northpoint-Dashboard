import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

// High-confidence repository hygiene check, not a comprehensive security audit.
// Never prints matching content or environment values.
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bsk_(?:live|test)_[a-zA-Z0-9]{20,}\b/,
  /postgres(?:ql)?:\/\/[^:\s/]+:(?!PASSWORD@|ci-only-password@)[^@\s]+@[^\s]+/i,
];
const failures = new Set();
for (const file of files) {
  if (/(^|\/)\.env(?:\..+)?$/.test(file) && !file.endsWith(".env.example")) failures.add(file);
  if (file.startsWith("attached_assets/") || /\.(?:zip|png|jpg|jpeg|woff2?|pdf|lock)$/.test(file))
    continue;
  try {
    if (statSync(file).size > 2_000_000) continue;
    const content = readFileSync(file, "utf8");
    if (patterns.some((pattern) => pattern.test(content))) failures.add(file);
  } catch {
    /* Ignore deleted files listed by git. */
  }
}
if (failures.size) {
  console.error(`Potential credentials found in: ${[...failures].join(", ")}`);
  process.exit(1);
}
console.log(
  "Credential-pattern and tracked environment-file checks passed (not a full security audit).",
);
