import { pool } from "@workspace/db";
import { adminTransaction } from "./src/lib/administration";
import * as provider from "./src/lib/planning-center-client";
import { ministryPagePath, ministryRoots } from "./src/lib/ministry-source";

type Delegation = { userId: string; runId: string };

async function main() {
  const client = await pool.connect();
  let delegation: Delegation | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('np.role','admin',true)");
    const result = await client.query<Delegation>(
      `SELECT r.automatic_requested_by AS "userId",r.id AS "runId"
       FROM pco_sync_runs r
       JOIN users u ON u.id=r.automatic_requested_by AND u.status='active' AND u.role='admin'
       WHERE r.product='giving' AND r.mode='backfill' AND r.status IN ('running','retry')
         AND r.automatic_requested_by IS NOT NULL
       ORDER BY r.started_at DESC,r.id LIMIT 1`,
    );
    delegation = result.rows[0];
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (!delegation) throw new Error("No authorized active Giving backfill was found");

  return adminTransaction(
    { userId: delegation.userId, role: "admin" },
    async (c) => {
      const run = await c.query<{ account_ref: string }>(
        `SELECT account_ref FROM pco_sync_runs
         WHERE id=$1 AND product='giving' AND mode='backfill'
           AND status IN ('running','retry') AND automatic_requested_by=$2`,
        [delegation!.runId, delegation!.userId],
      );
      if (!run.rows[0]) throw new Error("The saved Giving run is no longer active");
      const connection = await c.query<{
        account_ref: string;
        state: string;
        token_ciphertext: string | null;
      }>(
        `SELECT account_ref,state,token_ciphertext FROM pco_connections
         WHERE id='planning_center' AND account_ref=$1`,
        [run.rows[0].account_ref],
      );
      const row = connection.rows[0];
      if (!row || row.state !== "connected" || !row.token_ciphertext)
        throw new Error("Planning Center is not connected");
      const tokens = provider.decrypt<provider.Tokens>(
        row.token_ciphertext,
        `tokens:${row.account_ref}`,
      );
      if (tokens.expiresAt <= Date.now() + 60_000)
        throw new Error("The saved PCO access token is near expiry");

      const donationRoot = ministryRoots("giving").find((page) => page.type === "Donation");
      if (!donationRoot) throw new Error("Donation collection is not configured");
      const url = new URL(ministryPagePath(donationRoot, "giving"), provider.PCO_ORIGIN);
      url.searchParams.set("per_page", "100");
      url.searchParams.set("include", "designations");
      url.searchParams.set(
        "fields[Donation]",
        "amount_cents,amount_currency,received_at,completed_at,created_at,updated_at,payment_status,refunded,person,recurring_donation,designations",
      );
      url.searchParams.set(
        "fields[Designation]",
        "amount_cents,amount_currency,fee_cents,fund",
      );

      const payload = await provider.apiGet(
        `${url.pathname}${url.search}`,
        tokens.accessToken,
        "giving",
      );
      const data = Array.isArray(payload.data) ? payload.data : [];
      const included = Array.isArray(payload.included) ? payload.included : [];
      const designations = included.filter(
        (item) => !!item && typeof item === "object" && (item as { type?: unknown }).type === "Designation",
      );
      const includedIds = new Set(
        designations.flatMap((item) =>
          typeof (item as { id?: unknown }).id === "string"
            ? [(item as { id: string }).id]
            : [],
        ),
      );
      const linkedIds = data.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const relationship = (item as { relationships?: Record<string, { data?: unknown }> })
          .relationships?.designations?.data;
        if (Array.isArray(relationship))
          return relationship.flatMap((entry) =>
            entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string"
              ? [(entry as { id: string }).id]
              : [],
          );
        if (relationship && typeof relationship === "object" && typeof (relationship as { id?: unknown }).id === "string")
          return [(relationship as { id: string }).id];
        return [];
      });
      const meta =
        payload.meta && typeof payload.meta === "object"
          ? (payload.meta as Record<string, unknown>)
          : {};
      return {
        checkedAt: new Date().toISOString(),
        totalDonationRecords: meta.total_count ?? null,
        sampleDonationsReturned: data.length,
        includedDesignationRecords: designations.length,
        linkedDesignationRecords: linkedIds.length,
        allLinkedDesignationsIncluded:
          linkedIds.length > 0 && linkedIds.every((id) => includedIds.has(id)),
        hasNextPage: !!(payload.links as { next?: unknown } | undefined)?.next,
      };
    },
  );
}

try {
  console.log(JSON.stringify(await main()));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Designation include test failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
