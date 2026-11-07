import { readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

// Explicit whitelist, not a file path accepted from a user. CSV source snapshots
// are intentionally NOT exposed by this unauthenticated foundation endpoint.
const documentFiles = [
  "README.md",
  "AGENTS.md",
  "docs/PROJECT_INITIALIZATION.md",
  "docs/PRD.md",
  "docs/ARCHITECTURE.md",
  "docs/DATABASE.md",
  "docs/METRICS.md",
  "docs/DECISIONS.md",
  "docs/ROADMAP.md",
  "docs/PERMISSIONS.md",
  "docs/SECURITY.md",
  "docs/INTEGRATIONS.md",
  "docs/TESTING.md",
  "docs/OPEN_QUESTIONS.md",
  "docs/JOURNEYS.md",
  "docs/DESIGN_SYSTEM.md",
  "docs/DOCUMENT_INDEX.md",
  "docs/HISTORICAL_MIGRATION.md",
  "docs/REPORTING.md",
  "docs/API.md",
  "docs/AI_ANALYST.md",
  "docs/FORECASTING.md",
  "docs/DEPLOYMENT.md",
  "docs/HEALTH_SCORING.md",
  "docs/WORKBOOK_FINDINGS.md",
  "docs/UX.md",
  "docs/AGENT_TASK_PROMPTS.md",
  "docs/DATA_PIPELINES.md",
  "docs/OPERATIONS.md",
  "docs/GLOSSARY.md",
  "docs/SCORECARDS.md",
  "docs/IMPLEMENTATION.md",
  "docs/AUTH_SETUP.md",
  "docs/PHASE_0_VERIFICATION.md",
  "docs/PHASE_1_IMPLEMENTATION.md",
  "docs/PHASE_2_IMPLEMENTATION.md",
  "docs/specs/CAMP_75.md",
  "docs/specs/COMMUNICATIONS.md",
  "docs/specs/CONNECTION.md",
  "docs/specs/GIVING.md",
  "docs/specs/INSIDEOUT.md",
  "docs/specs/SPD.md",
  "docs/specs/SPECIAL_EVENTS.md",
  "docs/specs/TRANSIT.md",
  "docs/specs/UPSTREET.md",
  "docs/specs/WAUMBA_LAND.md",
];

export const documentIndex = documentFiles.map((file) => ({
  slug: file.replace(/\.md$/, "").toLowerCase().replaceAll("/", "--"),
  title: path.basename(file, ".md").replaceAll("_", " "),
  path: file,
  category: file.includes("/specs/")
    ? "Ministry specifications"
    : file.startsWith("docs/")
      ? "Project documentation"
      : "Getting started",
}));

export function projectRoot() {
  if (process.env.PROJECT_ROOT) return path.resolve(process.env.PROJECT_ROOT);
  let candidate = process.cwd();
  while (!existsSync(path.join(candidate, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(candidate);
    if (parent === candidate) throw new Error("Project root not found; set PROJECT_ROOT");
    candidate = parent;
  }
  return candidate;
}

export async function readDocument(slug: string) {
  const entry = documentIndex.find((document) => document.slug === slug);
  if (!entry) return null;
  const root = projectRoot();
  const content = await readFile(path.join(root, entry.path), "utf8");
  return { ...entry, content };
}
