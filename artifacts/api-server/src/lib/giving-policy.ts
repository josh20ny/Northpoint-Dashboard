import type { PoolClient } from "pg";
import type { GivingPolicy, GivingPolicyInput, GivingHealthPage } from "@workspace/api-zod";
import type { Principal } from "./auth";
import { adminTransaction, AccessError } from "./administration";
import { recordAudit } from "./audit";
import { DEFAULT_GIVING_POLICY } from "./giving-patterns";
export async function currentGivingPolicy(c: PoolClient): Promise<GivingPolicy> {
  const row = (
    await c.query(`SELECT id,minimum_gifts AS "minimumGifts",tolerance_days AS "toleranceDays",missed_expected AS "missedExpected",
    grouping,cadences,note,coalesce(previous_id::text,'owner-default') AS "previousId",created_at AS "createdAt"
    FROM giving_policy_versions p WHERE NOT EXISTS(SELECT 1 FROM giving_policy_versions n WHERE n.previous_id=p.id)
    ORDER BY created_at DESC,id DESC LIMIT 1`)
  ).rows[0];
  return row
    ? { ...row, createdAt: new Date(row.createdAt).toISOString(), origin: "admin_version" }
    : {
        ...DEFAULT_GIVING_POLICY,
        id: "owner-default",
        previousId: "owner-default",
        createdAt: null,
        origin: "owner_default",
        note: "Owner-approved starting rule: first recorded person/family gift; four gifts establish cadence within two days; lapse after three missed expected gifts.",
      };
}
export async function readGivingPolicy(p: Principal) {
  return adminTransaction(p, async (c) => {
    await recordAudit(p.userId!, "giving.policy_read", "giving_policy", null, "success", c);
    return currentGivingPolicy(c);
  });
}
export async function saveGivingPolicy(
  p: Principal,
  input: GivingPolicyInput,
): Promise<GivingPolicy> {
  if (new Set(input.cadences).size !== input.cadences.length)
    throw new AccessError(400, "Choose each cadence once");
  return adminTransaction(p, async (c) => {
    const current = await currentGivingPolicy(c);
    if (current.id !== input.previousId)
      throw new AccessError(409, "Giving formula changed; reload before saving");
    const row = await c.query(
      `INSERT INTO giving_policy_versions(minimum_gifts,tolerance_days,missed_expected,grouping,cadences,note,previous_id,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        input.minimumGifts,
        input.toleranceDays,
        input.missedExpected,
        input.grouping,
        JSON.stringify(input.cadences),
        input.note,
        current.id === "owner-default" ? null : current.id,
        p.userId,
      ],
    );
    await recordAudit(
      p.userId!,
      "giving.policy_version_created",
      "giving_policy",
      row.rows[0].id,
      "success",
      c,
    );
    return currentGivingPolicy(c);
  });
}
export async function givingHealth(p: Principal, page: number): Promise<GivingHealthPage> {
  return adminTransaction(p, async (c) => {
    const r = (
      await c.query(`SELECT p.id,p.source_as_of,e.evidence FROM ministry_publications p
      JOIN ministry_publication_evidence e ON e.publication_id=p.id
      JOIN pco_connections v ON v.id='planning_center' AND v.account_ref=p.account_ref
      WHERE p.product='giving' AND p.source_kind='pco' ORDER BY p.created_at DESC,p.id DESC LIMIT 1`)
    ).rows[0];
    await recordAudit(p.userId!, "giving.health_signals_read", "giving", null, "success", c);
    if (!r)
      return {
        units: [],
        page,
        hasMore: false,
        sourceAsOf: null,
        policyVersion: null,
        issues: [
          "Publish Giving after authorized ingestion to calculate restricted giving signals.",
        ],
      };
    const policy = await currentGivingPolicy(c);
    const valid = (await c.query("SELECT np_ministry_publication_valid($1) AS valid", [r.id]))
      .rows[0].valid;
    if (!valid)
      return {
        units: [],
        page,
        hasMore: false,
        sourceAsOf: new Date(r.source_as_of).toISOString(),
        policyVersion: r.evidence.givingPolicyId ?? null,
        issues: [
          "Source mapping, organization or Giving formula changed. Republish Giving before showing these financial signals.",
        ],
      };
    if (r.evidence.givingPolicyId !== policy.id)
      return {
        units: [],
        page,
        hasMore: false,
        sourceAsOf: new Date(r.source_as_of).toISOString(),
        policyVersion: r.evidence.givingPolicyId ?? null,
        issues: [
          "Formula changed. Republish Giving before showing classifications from another formula version.",
        ],
      };
    const units = r.evidence.givingUnits ?? [];
    return {
      units: units.slice((page - 1) * 50, page * 50),
      page,
      hasMore: units.length > page * 50,
      sourceAsOf: new Date(r.source_as_of).toISOString(),
      policyVersion: policy.id,
      issues: [
        "Restricted giving signals are inputs for later health work, not a church health score. Unknown and irregular patterns are unclassified, not healthy.",
        "Current explicit PCO joint-giver relationships define giving units; historical family membership is not reconstructed.",
      ],
    };
  });
}
