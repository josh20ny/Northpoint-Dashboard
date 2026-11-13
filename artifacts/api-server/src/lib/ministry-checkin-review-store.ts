import type { PoolClient } from "pg";
import type { Principal } from "./auth";
import { AccessError, adminTransaction, type AdminActor } from "./administration";
import { recordAudit } from "./audit";
import {
  checkInSourceDetails,
  findCheckInReviewCandidates,
  type CheckInResolutionAction,
} from "./ministry-checkin-review";
import type { SourceFact } from "./ministry-calculation";

const PAGE_SIZE = 50;
const REVIEW_SOURCE_LIMIT = 300000;
const RESOLUTION_TARGET = "pco_checkin_resolution";

type NormalizedFact = {
  sourceType: string;
  sourceId: string;
  attributes: Record<string, unknown>;
  sourceRelationships: SourceFact["relationships"];
  sourceCollection?: string | null;
};

function factFromRow(row: { normalized: NormalizedFact }): SourceFact {
  return {
    type: row.normalized.sourceType,
    id: row.normalized.sourceId,
    attributes: row.normalized.attributes ?? {},
    relationships: row.normalized.sourceRelationships ?? {},
    sourceCollection: row.normalized.sourceCollection ?? null,
  };
}

function relationshipIds(fact: SourceFact, key: string): string[] {
  const data = fact.relationships[key]?.data;
  if (!data) return [];
  return (Array.isArray(data) ? data : [data]).map((item) => item.id);
}

async function connectedAccount(c: Pick<PoolClient, "query">) {
  const result = await c.query("SELECT account_ref FROM pco_connections WHERE id='planning_center'");
  const account = result.rows[0]?.account_ref;
  if (!account) throw new AccessError(409, "No Planning Center organization");
  return String(account);
}

async function reviewFacts(c: Pick<PoolClient, "query">, account: string): Promise<SourceFact[]> {
  const result = await c.query(
    `SELECT normalized FROM pco_source_entities
    WHERE account_ref=$1 AND product='check_ins'
      AND object_type IN ('CheckIn','EventPeriod','EventTime')
      AND observed_run_id IS NOT NULL AND missing_run_id IS NULL
    ORDER BY object_type,external_id LIMIT $2`,
    [account, REVIEW_SOURCE_LIMIT + 1],
  );
  if (result.rows.length > REVIEW_SOURCE_LIMIT)
    throw new AccessError(409, "The Check-In review source exceeds its safe processing limit");
  return result.rows.map(factFromRow);
}

export async function readCheckInResolutions(
  c: Pick<PoolClient, "query">,
  account: string,
): Promise<Map<string, CheckInResolutionAction>> {
  const prefix = `${account}:`;
  const result = await c.query(
    `SELECT DISTINCT ON(target_id) target_id,action
    FROM audit_events
    WHERE target_type=$1 AND target_id LIKE $2 AND action IN ($3,$4)
    ORDER BY target_id,timestamp DESC,id DESC`,
    [
      RESOLUTION_TARGET,
      `${prefix}%`,
      "ministry.checkin_include",
      "ministry.checkin_exclude",
    ],
  );
  return new Map(
    result.rows.map((row) => [
      String(row.target_id).slice(prefix.length),
      row.action === "ministry.checkin_include" ? "include" : "exclude",
    ]),
  );
}

export async function getCheckInReview(p: Principal, page: number) {
  return adminTransaction(p, async (c) => {
    const account = await connectedAccount(c);
    const facts = await reviewFacts(c, account);
    const candidates = findCheckInReviewCandidates(facts);
    const resolutions = await readCheckInResolutions(c, account);
    const items = candidates.map((candidate) => ({
      ...candidate,
      resolution: resolutions.get(candidate.checkInId) ?? null,
    }));
    const offset = (page - 1) * PAGE_SIZE;
    await recordAudit(
      p.userId!,
      "ministry.checkin_review_read",
      "workspace",
      null,
      "success",
      c,
    );
    return {
      items: items.slice(offset, offset + PAGE_SIZE),
      page,
      pageSize: PAGE_SIZE,
      total: items.length,
      unresolved: items.filter((item) => item.resolution === null).length,
      asOf: new Date().toISOString(),
    };
  });
}

export async function resolveCheckIn(
  p: AdminActor,
  checkInId: string,
  action: CheckInResolutionAction,
) {
  return adminTransaction(p, async (c) => {
    const account = await connectedAccount(c);
    const source = await c.query(
      `SELECT normalized FROM pco_source_entities
      WHERE account_ref=$1 AND product='check_ins' AND object_type='CheckIn'
        AND external_id=$2 AND missing_run_id IS NULL LIMIT 1`,
      [account, checkInId],
    );
    if (!source.rowCount) throw new AccessError(404, "Check-In source record not found");

    if (action === "include") {
      const checkIn = factFromRow(source.rows[0]);
      const relatedIds = [
        ...relationshipIds(checkIn, "event_period"),
        ...relationshipIds(checkIn, "event_times"),
      ];
      const related = relatedIds.length
        ? await c.query(
            `SELECT normalized FROM pco_source_entities
            WHERE account_ref=$1 AND product='check_ins'
              AND object_type IN ('EventPeriod','EventTime')
              AND external_id=ANY($2::text[]) AND missing_run_id IS NULL`,
            [account, relatedIds],
          )
        : { rows: [] };
      const facts = [checkIn, ...related.rows.map(factFromRow)];
      if (!checkInSourceDetails(checkIn, facts).canInclude)
        throw new AccessError(409, "This Check-In has no usable service date or source");
    }

    await recordAudit(
      p.userId ?? null,
      action === "include" ? "ministry.checkin_include" : "ministry.checkin_exclude",
      RESOLUTION_TARGET,
      `${account}:${checkInId}`,
      "success",
      c,
    );
    return { checkInId, action };
  });
}

export const CHECK_IN_REVIEW_PAGE_SIZE = PAGE_SIZE;
