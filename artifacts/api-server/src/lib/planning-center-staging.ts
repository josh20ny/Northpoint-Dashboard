import type { PoolClient } from "pg";
import { normalized, sourceHash, type ParsedPage } from "./planning-center-source";

// The caller owns the page savepoint and transaction. Four set-based statements
// replace 3–4 round trips per entity without changing immutable revision keys,
// version selection, positive observations, or parent provenance.
export async function stageSourcePage(
  c: PoolClient,
  account: string,
  product: string,
  runId: string,
  page: ParsedPage,
  collection: string,
): Promise<number> {
  if (!page.entities.length) return 0;
  const revisions = new Map<
    string,
    {
      object_type: string;
      external_id: string;
      payload_json: unknown;
      payload_hash: string;
      source_updated_at: unknown;
    }
  >();
  const projections = new Map<
    string,
    {
      object_type: string;
      external_id: string;
      revision: string;
      normalized: ReturnType<typeof normalized>;
      version: number;
    }
  >();
  for (const entity of page.entities) {
    const hash = sourceHash(entity);
    const identity = `${entity.type}:${entity.id}`;
    const object = `${product}:${entity.type}`;
    const revision = `${object}:${entity.id}:${hash}`;
    revisions.set(revision, {
      object_type: object,
      external_id: entity.id,
      payload_json: entity,
      payload_hash: hash,
      source_updated_at: entity.attributes.updated_at ?? null,
    });
    const version = entity.attributes.updated_at
      ? Date.parse(String(entity.attributes.updated_at))
      : -Infinity;
    const previous = projections.get(identity);
    // Match sequential guarded upserts: newest wins, last wins equal versions.
    if (!previous || version >= previous.version)
      projections.set(identity, {
        object_type: entity.type,
        external_id: entity.id,
        revision,
        version,
        normalized: normalized(entity, page.sourceCollections?.[identity] ?? collection),
      });
  }
  const batch = JSON.stringify([...revisions.values()]);
  const inserted = await c.query(
    `INSERT INTO raw_source_records(provider,account_ref,object_type,external_id,payload_json,payload_hash,source_updated_at)
     SELECT 'planning_center',$1,x.object_type,x.external_id,x.payload_json,x.payload_hash,x.source_updated_at
     FROM jsonb_to_recordset($2::jsonb) AS x(
       object_type text,external_id text,payload_json jsonb,payload_hash text,source_updated_at timestamptz)
     ON CONFLICT DO NOTHING RETURNING id`,
    [account, batch],
  );
  // A separate statement sees pre-existing revisions and concurrent winners of
  // ON CONFLICT; a single insert CTE's snapshot cannot reliably do both.
  const raw = await c.query<{
    id: string;
    object_type: string;
    external_id: string;
    payload_hash: string;
  }>(
    `SELECT r.id,r.object_type,r.external_id,r.payload_hash
     FROM raw_source_records r
     JOIN jsonb_to_recordset($2::jsonb) AS x(object_type text,external_id text,payload_hash text)
       ON r.object_type=x.object_type AND r.external_id=x.external_id AND r.payload_hash=x.payload_hash
     WHERE r.provider='planning_center' AND r.account_ref=$1`,
    [account, batch],
  );
  const rawIds = new Map(
    raw.rows.map((row) => [`${row.object_type}:${row.external_id}:${row.payload_hash}`, row.id]),
  );
  const sources = [...projections.values()].map(({ revision, version: _version, ...entry }) => {
    const raw_id = rawIds.get(revision);
    if (!raw_id) throw new Error("Planning Center page revision could not be resolved");
    return { ...entry, raw_id };
  });
  const sourceBatch = JSON.stringify(sources);
  await c.query(
    `INSERT INTO pco_source_entities(account_ref,product,object_type,external_id,raw_id,sync_run_id,normalized)
     SELECT $1,$2,x.object_type,x.external_id,x.raw_id,$3,x.normalized
     FROM jsonb_to_recordset($4::jsonb) AS x(
       object_type text,external_id text,raw_id uuid,normalized jsonb)
     ON CONFLICT(account_ref,product,object_type,external_id)
     DO UPDATE SET raw_id=excluded.raw_id,sync_run_id=excluded.sync_run_id,
       normalized=excluded.normalized,seen_at=now()
     WHERE coalesce((excluded.normalized->'attributes'->>'updated_at')::timestamptz,'-infinity') >=
       coalesce((pco_source_entities.normalized->'attributes'->>'updated_at')::timestamptz,'-infinity')`,
    [account, product, runId, sourceBatch],
  );
  // Observe even when the version guard retained a newer stored payload.
  await c.query(
    `WITH observed AS (
       UPDATE pco_source_entities e SET observed_run_id=$3,missing_run_id=NULL,seen_at=now()
       FROM jsonb_to_recordset($4::jsonb) AS x(object_type text,external_id text)
       WHERE e.account_ref=$1 AND e.product=$2
         AND e.object_type=x.object_type AND e.external_id=x.external_id RETURNING e.id
     ) INSERT INTO pco_source_observations(run_id,entity_id)
       SELECT $3,id FROM observed ON CONFLICT DO NOTHING`,
    [account, product, runId, sourceBatch],
  );
  return inserted.rows.length;
}
