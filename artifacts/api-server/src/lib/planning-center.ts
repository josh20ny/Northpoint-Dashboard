import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import type { PlanningCenterSync } from "@workspace/api-zod";
import type { Principal } from "./auth";
import { adminTransaction, AccessError, type AdminActor } from "./administration";
import { recordAudit } from "./audit";
import { hashToken } from "./security";
import { scheduleView } from "./planning-center-schedule";
import * as provider from "./planning-center-client";
import {
  roots,
  pagePath,
  parsePage,
  sourceHash,
  normalized,
  type Page,
} from "./planning-center-source";

interface Connection {
  account_ref: string;
  account_name: string;
  state: string;
  scopes: string[];
  token_ciphertext: string | null;
}
interface Run {
  id: string;
  account_ref: string;
  product: provider.Product;
  mode: "backfill" | "incremental";
  status: PlanningCenterSync["status"];
  queue: Page[];
  visited: string[];
  fetched: number;
  revised: number;
  pages: number;
  started_at: Date;
  finished_at: Date | null;
  retry_at: Date | null;
  error: string | null;
  automatic: boolean;
  automatic_requested_by: string | null;
  last_automatic_at: Date | null;
}
const iso = (v: Date | null) => v?.toISOString() ?? null;
function syncView(r: Run): PlanningCenterSync {
  return {
    id: r.id,
    product: r.product,
    mode: r.mode,
    status: r.status,
    fetched: r.fetched,
    revised: r.revised,
    pages: r.pages,
    pendingPages: r.queue.length,
    startedAt: r.started_at.toISOString(),
    finishedAt: iso(r.finished_at),
    retryAt: iso(r.retry_at),
    error: r.error,
    automatic: r.automatic,
    lastAutomaticAt: iso(r.last_automatic_at),
  };
}
async function connection(c: PoolClient) {
  return (
    await c.query<Connection>("SELECT * FROM pco_connections WHERE id='planning_center' FOR UPDATE")
  ).rows[0];
}
function connected(
  v: Connection | undefined,
): asserts v is Connection & { token_ciphertext: string } {
  if (!v || v.state !== "connected" || !v.token_ciphertext)
    throw new AccessError(409, "Confirm an authorized Planning Center organization first");
}
async function tokens(c: PoolClient, v: Connection) {
  if (!v.token_ciphertext) throw new AccessError(409, "Reconnect Planning Center");
  const old = provider.decrypt<provider.Tokens>(v.token_ciphertext, `tokens:${v.account_ref}`);
  if (old.expiresAt > Date.now() + 60_000) return old;
  const next = await provider.exchangeToken(
    { grant_type: "refresh_token", refresh_token: old.refreshToken },
    old,
  );
  await c.query(
    "UPDATE pco_connections SET token_ciphertext=$1,updated_at=now() WHERE id='planning_center'",
    [provider.encrypt(next, `tokens:${v.account_ref}`)],
  );
  return next;
}
async function providerFailure(c: PoolClient, error: unknown) {
  if (error instanceof provider.ProviderError && [400, 401, 403].includes(error.status)) {
    await c.query(
      "UPDATE pco_connections SET state='reconnect_required',error=$1,updated_at=now() WHERE id='planning_center'",
      [error.message],
    );
  }
}
export async function workspace(p: Principal) {
  return adminTransaction(p, async (c) => {
    const v = await c.query(
      `SELECT account_ref AS "accountRef",account_name AS "accountName",state,scopes,
        connected_by AS "connectedBy",updated_at AS "updatedAt",last_success_at AS "lastSuccessAt",error
        FROM pco_connections WHERE id='planning_center'`,
    );
    const account = v.rows[0]?.accountRef ?? "";
    // Retain active work and the latest completed baseline for every product
    // even when more than 50 newer runs exist.
    const runs = await c.query<Run>(
      `WITH chosen AS (
      (SELECT * FROM pco_sync_runs WHERE account_ref=$1 ORDER BY started_at DESC,id LIMIT 50)
      UNION (SELECT DISTINCT ON(product) * FROM pco_sync_runs
        WHERE account_ref=$1 AND mode='backfill' AND status='complete' ORDER BY product,started_at DESC,id)
      UNION (SELECT * FROM pco_sync_runs WHERE account_ref=$1 AND status IN ('running','retry'))
      ) SELECT * FROM chosen ORDER BY started_at DESC,id`,
      [account],
    );
    const count = await c.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pco_source_entities WHERE account_ref=$1",
      [account],
    );
    await recordAudit(p.userId!, "planning_center.status_read", "integration", null, "success", c);
    return JSON.parse(
      JSON.stringify({
        ...provider.configuration(),
        requestedScopes: provider.PCO_SCOPES,
        connection: v.rows[0] ?? null,
        syncs: runs.rows.map(syncView),
        schedule: await scheduleView(c, account),
        sourceRecords: count.rows[0]!.n,
        asOf: new Date().toISOString(),
      }),
    ) as unknown;
  });
}
export async function authorize(p: Principal, sessionToken: string) {
  const config = provider.requireConfiguration();
  return adminTransaction(p, async (c) => {
    const existing = await connection(c);
    if (existing && existing.state !== "disconnected")
      throw new AccessError(409, "Disconnect the existing authorization before reconnecting");
    await c.query("DELETE FROM pco_oauth_flows WHERE expires_at < now() OR user_id=$1", [p.userId]);
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    await c.query(
      `INSERT INTO pco_oauth_flows(state_hash,user_id,session_hash,verifier_ciphertext,expires_at)
      VALUES ($1,$2,$3,$4,now()+interval '10 minutes')`,
      [hashToken(state), p.userId, hashToken(sessionToken), provider.encrypt(verifier, "pkce")],
    );
    const url = new URL("/oauth/authorize", provider.PCO_ORIGIN);
    for (const [key, value] of Object.entries({
      response_type: "code",
      client_id: process.env.PCO_CLIENT_ID!,
      redirect_uri: config.callbackUrl!,
      scope: provider.PCO_SCOPES.join(" "),
      state,
      code_challenge: Buffer.from(provider.digest(verifier), "hex").toString("base64url"),
      code_challenge_method: "S256",
    }))
      url.searchParams.set(key, value);
    await recordAudit(
      p.userId!,
      "planning_center.authorization_started",
      "integration",
      null,
      "success",
      c,
    );
    return { url: url.toString() };
  });
}
export async function complete(
  p: Principal,
  sessionToken: string,
  state: string,
  code: string | null,
) {
  provider.requireConfiguration();
  // Consume and commit the state before exchanging the code. A callback cannot
  // be replayed even when an external network request or the later commit fails.
  const verifier = await adminTransaction(p, async (c) => {
    const flow = await c.query<{ verifier_ciphertext: string }>(
      `DELETE FROM pco_oauth_flows WHERE state_hash=$1 AND user_id=$2 AND session_hash=$3
       AND expires_at>now() RETURNING verifier_ciphertext`,
      [hashToken(state), p.userId, hashToken(sessionToken)],
    );
    if (!flow.rows[0])
      throw new AccessError(
        400,
        "Authorization expired or does not match this session; start again",
      );
    return provider.decrypt<string>(flow.rows[0].verifier_ciphertext, "pkce");
  });
  if (!code) throw new AccessError(400, "Planning Center authorization was not granted");
  const t = await provider.exchangeToken({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: provider.configuration().callbackUrl!,
  });
  try {
    const org = await provider.apiGet(
      "/people/v2?fields[Organization]=name",
      t.accessToken,
      "people",
    );
    const data = org.data as
      { type?: unknown; id?: unknown; attributes?: { name?: unknown } } | undefined;
    if (
      data?.type !== "Organization" ||
      typeof data.id !== "string" ||
      !/^[0-9]{1,30}$/.test(data.id) ||
      typeof data.attributes?.name !== "string" ||
      data.attributes.name.length > 200
    )
      throw new provider.ProviderError(422);
    const accountRef = data.id;
    const accountName = data.attributes.name;
    await adminTransaction(p, async (c) => {
      const existing = await connection(c);
      if (existing && existing.state !== "disconnected")
        throw new AccessError(409, "An authorization already exists; disconnect before retrying");
      await c.query(
        `INSERT INTO pco_connections(id,account_ref,account_name,state,scopes,token_ciphertext,connected_by)
        VALUES ('planning_center',$1,$2,'pending',$3,$4,$5) ON CONFLICT(id) DO UPDATE
        SET account_ref=excluded.account_ref,account_name=excluded.account_name,state='pending',
        scopes=excluded.scopes,token_ciphertext=excluded.token_ciphertext,connected_by=excluded.connected_by,
        error=NULL,last_success_at=NULL,updated_at=now()`,
        [
          accountRef,
          accountName,
          JSON.stringify(t.scopes),
          provider.encrypt(t, `tokens:${accountRef}`),
          p.userId,
        ],
      );
      await recordAudit(
        p.userId!,
        "planning_center.authorization_received",
        "integration",
        null,
        "success",
        c,
      );
    });
  } catch (error) {
    // Best effort cleanup of an unpersisted grant. Never log token/error bodies.
    try {
      await provider.revokeTokens(t);
    } catch {
      /* Owner can revoke in provider portal. */
    }
    throw error;
  }
}
export async function confirm(p: Principal, accountRef: string) {
  const outcome = await adminTransaction(p, async (c) => {
    const v = await connection(c);
    if (!v || v.state !== "pending" || v.account_ref !== accountRef)
      throw new AccessError(409, "Organization confirmation does not match the pending connection");
    try {
      const t = await tokens(c, v);
      for (const product of provider.PCO_SCOPES) {
        // Check the actual collection, not just /me, without ingesting its data.
        const root = roots(product)[0]!;
        const result = await provider.apiGet(
          pagePath(root, product).replace("per_page=100", "per_page=1"),
          t.accessToken,
          product,
        );
        parsePage(result, root, product);
      }
      await c.query(
        "UPDATE pco_connections SET state='connected',updated_at=now(),error=NULL WHERE id='planning_center'",
      );
      await recordAudit(
        p.userId!,
        "planning_center.organization_confirmed",
        "integration",
        null,
        "success",
        c,
      );
      return null;
    } catch (error) {
      await providerFailure(c, error);
      return error;
    }
  });
  if (outcome) throw outcome;
}
export async function disconnect(p: Principal) {
  const outcome = await adminTransaction(p, async (c) => {
    const v = await connection(c);
    if (!v || v.state === "disconnected") return null;
    try {
      if (v.token_ciphertext)
        await provider.revokeTokens(
          provider.decrypt<provider.Tokens>(v.token_ciphertext, `tokens:${v.account_ref}`),
        );
    } catch (error) {
      return error;
    }
    await c.query(
      "UPDATE pco_connections SET state='disconnected',token_ciphertext=NULL,error=NULL,updated_at=now() WHERE id='planning_center'",
    );
    await c.query(
      `UPDATE pco_sync_runs SET status='cancelled',automatic=false,finished_at=now(),error='Authorization disconnected'
      WHERE account_ref=$1 AND status IN ('running','retry')`,
      [v.account_ref],
    );
    await c.query("DELETE FROM pco_oauth_flows");
    await c.query(
      `UPDATE pco_sync_schedules SET enabled=false,next_run_at=NULL,active_run_id=NULL,
       remaining='[]',status='cancelled',last_finished_at=now(),error='Authorization disconnected'
       WHERE id='planning_center'`,
    );
    await recordAudit(p.userId!, "planning_center.disconnected", "integration", null, "success", c);
    return null;
  });
  if (outcome) throw outcome;
}
export async function startSync(
  p: Principal,
  product: provider.Product,
  mode: "backfill" | "incremental",
) {
  provider.requireConfiguration();
  return adminTransaction(p, async (c) => {
    const v = await connection(c);
    connected(v);
    if (
      (
        await c.query(
          `SELECT id FROM pco_sync_schedules WHERE account_ref=$1 AND enabled AND active_run_id IS NOT NULL`,
          [v.account_ref],
        )
      ).rowCount
    )
      throw new AccessError(409, "Pause the nightly cycle before starting a separate import");
    if (
      mode === "incremental" &&
      !(
        await c.query(
          "SELECT id FROM pco_sync_runs WHERE account_ref=$1 AND product=$2 AND mode='backfill' AND status='complete' LIMIT 1",
          [v.account_ref, product],
        )
      ).rowCount
    )
      throw new AccessError(
        409,
        "Complete an accessible-history backfill before incremental revision sync",
      );
    const run = await c.query<Run>(
      `INSERT INTO pco_sync_runs(account_ref,product,mode,queue,started_by)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [v.account_ref, product, mode, JSON.stringify(roots(product)), p.userId],
    );
    await recordAudit(
      p.userId!,
      "planning_center.sync_started",
      "sync_run",
      run.rows[0]!.id,
      "success",
      c,
    );
    return syncView(run.rows[0]!);
  });
}
export async function setAutomation(p: Principal, id: string, enabled: boolean) {
  return adminTransaction(p, async (c) => {
    const v = await connection(c);
    if (enabled) connected(v);
    if (!v) throw new AccessError(404, "Connection not found");
    const r = await c.query<Run>(
      `UPDATE pco_sync_runs SET automatic=$3,automatic_requested_by=CASE WHEN $3 THEN $4 ELSE automatic_requested_by END
       WHERE id=$1 AND account_ref=$2 AND status IN ('running','retry') RETURNING *`,
      [id, v.account_ref, enabled, p.userId],
    );
    if (!r.rows[0]) throw new AccessError(409, "Sync is absent or no longer active");
    await recordAudit(
      p.userId!,
      enabled ? "planning_center.automation_enabled" : "planning_center.automation_paused",
      "sync_run",
      id,
      "success",
      c,
    );
    return syncView(r.rows[0]);
  });
}

export async function advanceSync(p: Principal, id: string) {
  provider.requireConfiguration();
  return adminTransaction(p, (c) => advancePage(c, p, id, false));
}

// Called only inside a transaction holding the same Admin advisory lock.
// Each page (including its durable cursor) commits before the worker loops.
export async function advancePage(c: PoolClient, p: AdminActor, id: string, automatic: boolean) {
  provider.requireConfiguration();
  const v = await connection(c);
  connected(v);
  const r = (
    await c.query<Run>("SELECT * FROM pco_sync_runs WHERE id=$1 AND account_ref=$2 FOR UPDATE", [
      id,
      v.account_ref,
    ])
  ).rows[0];
  if (!r) throw new AccessError(404, "Sync not found");
  if (!["running", "retry"].includes(r.status))
    throw new AccessError(409, "This sync is no longer active");
  if (r.automatic !== automatic || (automatic && r.automatic_requested_by !== p.userId))
    throw new AccessError(409, "Pause automatic processing before advancing manually");
  if (r.retry_at && r.retry_at.getTime() > Date.now())
    throw new AccessError(409, "Wait until the recorded retry time");
  let pageStarted = false;
  try {
    const t = await tokens(c, v); // Persist any rotation even when a later page fails.
    await c.query("SAVEPOINT pco_page");
    pageStarted = true;
    const page = r.queue[0];
    if (!page || r.pages >= 100_000) throw new provider.ProviderError(422);
    const path = pagePath(page, r.product);
    if (r.visited.includes(path)) throw new provider.ProviderError(422);
    const payload = await provider.apiGet(path, t.accessToken, r.product);
    const parsed = parsePage(payload, page, r.product);
    let revised = 0;
    for (const entity of parsed.entities) {
      const object = `${r.product}:${entity.type}`;
      const hash = sourceHash(entity);
      const inserted = await c.query<{ id: string }>(
        `INSERT INTO raw_source_records(provider,account_ref,object_type,external_id,payload_json,payload_hash,source_updated_at)
           VALUES ('planning_center',$1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
        [
          v.account_ref,
          object,
          entity.id,
          JSON.stringify(entity),
          hash,
          entity.attributes.updated_at ?? null,
        ],
      );
      const rawId =
        inserted.rows[0]?.id ??
        (
          await c.query<{ id: string }>(
            `SELECT id FROM raw_source_records WHERE provider='planning_center' AND account_ref=$1
           AND object_type=$2 AND external_id=$3 AND payload_hash=$4`,
            [v.account_ref, object, entity.id, hash],
          )
        ).rows[0]!.id;
      if (inserted.rowCount) revised++;
      // Do not overwrite a newer provider version with an older page.
      await c.query(
        `INSERT INTO pco_source_entities(account_ref,product,object_type,external_id,raw_id,sync_run_id,normalized)
          VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(account_ref,product,object_type,external_id)
          DO UPDATE SET raw_id=excluded.raw_id,sync_run_id=excluded.sync_run_id,normalized=excluded.normalized,seen_at=now()
          WHERE coalesce((excluded.normalized->'attributes'->>'updated_at')::timestamptz,'-infinity') >=
                coalesce((pco_source_entities.normalized->'attributes'->>'updated_at')::timestamptz,'-infinity')`,
        [
          v.account_ref,
          r.product,
          entity.type,
          entity.id,
          rawId,
          r.id,
          JSON.stringify(normalized(entity, new URL(path, provider.PCO_ORIGIN).pathname)),
        ],
      );
    }
    const visited = [...r.visited, path];
    const queue = [...r.queue.slice(1), ...parsed.nextPages];
    const unique = new Map<string, Page>();
    for (const q of queue) {
      const k = pagePath(q, r.product);
      if (!visited.includes(k)) unique.set(k, q);
    }
    if (unique.size > 100_000) throw new provider.ProviderError(422);
    const updated = (
      await c.query<Run>(
        `UPDATE pco_sync_runs SET queue=$2,visited=$3,fetched=fetched+$4,
        revised=revised+$5,pages=pages+1,status=$6,error=NULL,retry_at=NULL,
        automatic=automatic AND $6 IN ('running','retry'),
        finished_at=CASE WHEN $6='complete' THEN now() ELSE NULL END WHERE id=$1 RETURNING *`,
        [
          id,
          JSON.stringify([...unique.values()]),
          JSON.stringify(visited),
          parsed.entities.length,
          revised,
          unique.size ? "running" : "complete",
        ],
      )
    ).rows[0]!;
    if (!unique.size)
      await c.query(
        "UPDATE pco_connections SET last_success_at=now(),error=NULL,updated_at=now() WHERE id='planning_center'",
      );
    await recordAudit(
      p.userId!,
      unique.size ? "planning_center.page_staged" : "planning_center.sync_completed",
      "sync_run",
      id,
      "success",
      c,
    );
    await c.query("RELEASE SAVEPOINT pco_page");
    return syncView(updated);
  } catch (error) {
    if (pageStarted) await c.query("ROLLBACK TO SAVEPOINT pco_page");
    await providerFailure(c, error);
    const e = error instanceof provider.ProviderError ? error : null;
    if (!e) throw error;
    const retry = e.status === 429 || e.status >= 500;
    const updated = (
      await c.query<Run>(
        `UPDATE pco_sync_runs SET status=$2,error=$3,automatic=automatic AND $2='retry',
        retry_at=CASE WHEN $2='retry' THEN now()+($4::double precision * interval '1 second') ELSE NULL END,
        finished_at=CASE WHEN $2='failed' THEN now() ELSE NULL END WHERE id=$1 RETURNING *`,
        [id, retry ? "retry" : "failed", e.message, e.retrySeconds],
      )
    ).rows[0]!;
    await recordAudit(
      p.userId!,
      "planning_center.sync_interrupted",
      "sync_run",
      id,
      retry ? "retry" : "failed",
      c,
    );
    return syncView(updated);
  }
}
export async function cancelSync(p: Principal, id: string) {
  await adminTransaction(p, async (c) => {
    const v = await connection(c);
    if (!v) throw new AccessError(404, "Connection not found");
    const r = await c.query(
      `UPDATE pco_sync_runs SET status='cancelled',automatic=false,finished_at=now(),error=NULL,retry_at=NULL
      WHERE id=$1 AND account_ref=$2 AND status IN ('running','retry') RETURNING id`,
      [id, v.account_ref],
    );
    if (!r.rowCount) throw new AccessError(409, "Sync is absent or no longer active");
    await recordAudit(p.userId!, "planning_center.sync_cancelled", "sync_run", id, "success", c);
  });
}
