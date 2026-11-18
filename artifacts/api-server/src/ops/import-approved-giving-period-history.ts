/**
 * Preview or publish the owner-approved monthly and weekly Giving workbook
 * series. Values are read from the accepted workbook staging cells, never
 * from PCO person records. No Planning Center sync state is read or changed.
 */
import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { recordAudit } from "../lib/audit";
import { buildGivingWorkbookPeriodHistory } from "../lib/giving-workbook-period-history";
import { MINISTRY_DEFINITION_VERSION } from "../lib/ministry-calculation";
import type { WorkbookCell } from "@workspace/api-zod";
import type { Catalog } from "../lib/workbook";

const apply = process.argv.includes("--apply");
const sha256 = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function main() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('np.role','admin',true)");
    const accepted = await c.query<{
      id: string;
      sha256: string;
      snapshotDate: string;
      actorId: string;
      catalog: Catalog;
    }>(
      `SELECT b.id,b.sha256,b.snapshot_date::text AS "snapshotDate",
        u.id AS "actorId",b.catalog
       FROM import_batches b
       JOIN workbook_source_authorities a
         ON a.batch_id=b.id AND a.sha256=b.sha256
       JOIN users u ON u.id=b.created_by AND u.role='admin' AND u.status='active'
       WHERE b.state='active'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(b.catalog->'sheets') s(value)
           WHERE s.value->>'name'='$$$'
         )
       ORDER BY b.created_at DESC LIMIT 2`,
    );
    if (accepted.rowCount !== 1)
      throw new Error("Expected exactly one accepted active workbook with the reviewed Giving sheet");
    const batch = accepted.rows[0]!;
    if (batch.snapshotDate !== "2026-11-07")
      throw new Error(`Expected the accepted 2026-11-07 snapshot, found ${batch.snapshotDate}`);
    if (!batch.catalog.sheets.some((sheet) => sheet.name === "$$$" && sheet.maxRow >= 169))
      throw new Error("The accepted Giving sheet does not match the reviewed period-history layout");

    await c.query("SELECT set_config('np.user_id',$1,true)", [batch.actorId]);
    const sourceRows = await c.query<{ coordinate: string; cell: WorkbookCell }>(
      `SELECT coordinate,cell FROM import_cells
       WHERE batch_id=$1 AND sheet='$$$'
         AND coordinate ~ '^(A|B|C|D|E|F|G|I|J|K|L|M|N|O)(9[9]|10[0-9]|11[0-9]|12[0-9]|13[0-9]|14[0-9]|15[0-9]|16[0-9])$'`,
      [batch.id],
    );
    const cells = new Map(sourceRows.rows.map((row) => [row.coordinate, row.cell]));
    const series = buildGivingWorkbookPeriodHistory(cells, batch.catalog, batch.snapshotDate);

    const summary = series.map((item) => {
      const dates = item.values.map((value) => value.week).sort();
      return {
        series: item.label,
        measure: item.measure,
        period: item.period,
        unit: item.unit,
        rows: item.values.length,
        usable: item.values.filter((value) => value.value !== null).length,
        missing: item.values.filter((value) => value.value === null).length,
        from: dates[0],
        through: dates.at(-1),
        examples: item.values
          .filter((value) => value.value !== null)
          .slice(0, 3)
          .map((value) => ({ period: value.week, value: value.value })),
      };
    });
    if (!apply) {
      await c.query("ROLLBACK");
      console.log(
        JSON.stringify(
          {
            mode: "preview",
            snapshotDate: batch.snapshotDate,
            series: summary,
            sourceCellsRead: true,
            personLinkedDataRead: false,
            pcoSyncTouched: false,
            metricsPublished: false,
          },
          null,
          2,
        ),
      );
      return;
    }

    const publications = [];
    for (const item of series) {
      const product = `workbook:giving:${item.measure}:${item.period}`;
      const sourceKey = sha256({
        batchId: batch.id,
        sha256: batch.sha256,
        snapshotDate: batch.snapshotDate,
        key: item.key,
        period: item.period,
        values: item.values,
        evidence: item.evidence,
      });
      const existing = await c.query<{ id: string }>(
        `SELECT id FROM ministry_publications
         WHERE product=$1 AND account_ref=$2 AND source_key=$3`,
        [product, batch.id, sourceKey],
      );
      if (existing.rowCount) {
        publications.push({ label: item.label, id: existing.rows[0]!.id, reused: true });
        continue;
      }
      const dates = item.values.map((value) => value.week).sort();
      const publication = await c.query<{ id: string }>(
        `INSERT INTO ministry_publications(
           product,account_ref,source_key,source_kind,definition_version,
           source_as_of,coverage_start,coverage_end
         ) VALUES($1,$2,$3,'workbook',$4,$5,$6,$7) RETURNING id`,
        [
          product,
          batch.id,
          sourceKey,
          MINISTRY_DEFINITION_VERSION,
          new Date(`${batch.snapshotDate}T12:00:00Z`),
          dates[0],
          dates.at(-1),
        ],
      );
      const publicationId = publication.rows[0]!.id;
      await c.query(
        `INSERT INTO ministry_metric_values(
           publication_id,ministry,measure,scope,week,period,value,unit,
           quality,denominator,flags
         )
         SELECT $1,x->>'ministry',x->>'measure',x->>'scope',
           (x->>'week')::date,x->>'period',(x->>'value')::bigint,x->>'unit',
           x->>'quality',(x->>'denominator')::bigint,x->'flags'
         FROM jsonb_array_elements($2::jsonb) AS x`,
        [publicationId, JSON.stringify(item.values)],
      );
      await c.query(
        `INSERT INTO ministry_publication_evidence(publication_id,evidence,created_by)
         VALUES($1,$2,$3)`,
        [
          publicationId,
          JSON.stringify({
            source: "accepted workbook",
            batchId: batch.id,
            sha256: batch.sha256,
            snapshotDate: batch.snapshotDate,
            ownerDecision: "Publish separately",
            label: item.label,
            measure: item.measure,
            period: item.period,
            unit: item.unit,
            evidence: item.evidence,
          }),
          batch.actorId,
        ],
      );
      await recordAudit(
        batch.actorId,
        "ministry.data_published",
        "ministry_publication",
        publicationId,
        "success",
        c,
      );
      publications.push({
        label: item.label,
        id: publicationId,
        rows: item.values.length,
        reused: false,
      });
    }
    await c.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          mode: "applied",
          snapshotDate: batch.snapshotDate,
          series: summary,
          publications,
          pcoSyncTouched: false,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    c.release();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Giving workbook period-history import failed");
  process.exitCode = 1;
});
