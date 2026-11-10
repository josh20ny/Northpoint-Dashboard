import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import express from "express";
import request from "supertest";
import { it, expect, vi } from "vitest";
import type { AttendanceWorkspace } from "../lib/api-zod/src/index";
import type { Principal } from "../artifacts/api-server/src/lib/auth";
import { createAttendanceRouter } from "../artifacts/api-server/src/routes/attendance";

// Deliberately opt-in: this verifies the owner's current development dataset,
// not seeded source fixtures. Temporary identity and read-audit writes roll back.
it.skipIf(process.env.RUN_ATTENDANCE_RECONCILIATION !== "1")(
  "reconciles accepted adult history, all averaging windows and weekly YoY through the real API router",
  async () => {
    const db = await import("../lib/db/src/index");
    const c = await db.pool.connect();
    const connection = vi.spyOn(db.pool, "connect").mockImplementation(
      async () =>
        ({
          query: async (sql: string, args?: unknown[]) => {
            if (sql === "BEGIN") return c.query("SAVEPOINT reconciliation_read");
            if (sql === "COMMIT") return c.query("RELEASE SAVEPOINT reconciliation_read");
            if (sql === "ROLLBACK") {
              await c.query("ROLLBACK TO SAVEPOINT reconciliation_read");
              return c.query("RELEASE SAVEPOINT reconciliation_read");
            }
            return c.query(sql, args);
          },
          release() {},
        }) as never,
    );
    try {
      await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const batches = await c.query(
        `SELECT b.id,b.sha256,b.filename,b.snapshot_date FROM import_batches b
         JOIN workbook_source_authorities a ON a.batch_id=b.id AND a.sha256=b.sha256
         WHERE b.state='active' ORDER BY b.created_at DESC`,
      );
      expect(batches.rows).toHaveLength(1);
      const batch = batches.rows[0];
      const bytes = await readFile(`data/${batch.filename}`);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(batch.sha256);
      const cells = (
        await c.query(
          `SELECT sheet,coordinate,cell FROM import_cells WHERE batch_id=$1 AND
         ((sheet='SPD' AND coordinate ~ '^(A|F|I|L)[0-9]+$')
          OR (sheet='Historical - Adults' AND coordinate ~ '^(A|B|P)[0-9]+$'))`,
          [batch.id],
        )
      ).rows;
      const cellMap = new Map(cells.map((r) => [`${r.sheet}!${r.coordinate}`, r.cell]));
      const num = (sheet: string, coordinate: string): number | null => {
        const cell = cellMap.get(`${sheet}!${coordinate}`);
        if (!cell || cell.type !== "n") return null;
        const raw = cell.value ?? cell.cachedValue;
        if (raw == null || String(raw).trim() === "") return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      };
      const date = (serial: number | null) =>
        serial === null
          ? null
          : new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
      const shift = (d: string, weeks: number) =>
        new Date(Date.parse(d) + weeks * 7 * 86400000).toISOString().slice(0, 10);
      const source = Array.from({ length: 52 }, (_, i) => {
        const row = i + 3;
        return {
          week: date(num("SPD", `A${row}`))!,
          row,
          first: num("SPD", `F${row}`),
          second: num("SPD", `I${row}`),
          cachedTotal: num("SPD", `L${row}`),
        };
      });
      expect(source.every((r) => r.week && new Date(r.week).getUTCDay() === 0)).toBe(true);
      expect(num("Historical - Adults", "P34")).toBe(2025);
      const baselines = new Map(
        Array.from({ length: 52 }, (_, i) => {
          const row = i + 35;
          return [
            date(num("Historical - Adults", `B${row}`)),
            {
              value: num("Historical - Adults", `P${row}`),
              cell: `Historical - Adults!P${row}`,
            },
          ];
        }),
      );
      const facts = (
        await c.query(
          `SELECT r.id,r.service_date::text AS week,r.slot,r.count,r.status,r.source,
         r.previous_id,r.created_by IS NOT NULL AS has_actor,l.batch_id
         FROM attendance_revisions r LEFT JOIN attendance_lineage l ON l.revision_id=r.id
         WHERE r.definition_id=(SELECT id FROM attendance_definitions ORDER BY version DESC LIMIT 1)
         AND NOT EXISTS(SELECT 1 FROM attendance_revisions child WHERE child.previous_id=r.id)`,
        )
      ).rows;
      const before = (await c.query("SELECT count(*)::int AS n FROM attendance_revisions")).rows[0]
        .n;
      const subject = randomUUID(),
        email = `${subject}@example.invalid`;
      await c.query(
        "INSERT INTO users(id,provider,auth_subject,email,role) VALUES($1,'replit',$3,$2,'staff')",
        [subject, email, subject],
      );
      const principal: Principal = {
        userId: subject,
        role: "staff",
        identity: { provider: "replit", subject, verifiedEmail: email },
      };
      const app = express();
      app.use(
        "/api",
        createAttendanceRouter({
          name: "rollback-only-reconciliation",
          enabled: true,
          authenticate: async () => principal,
        }),
      );
      app.use(
        (
          e: { status?: number; message: string },
          _req: express.Request,
          res: express.Response,
          _next: express.NextFunction,
        ) => res.status(e.status ?? 500).json({ error: e.message }),
      );
      const get = async (params: Record<string, string | number> = {}) => {
        const response = await request(app).get("/api/v1/attendance").query(params);
        expect(response.status, JSON.stringify(response.body)).toBe(200);
        return response.body as AttendanceWorkspace;
      };
      const home = await get();
      expect(connection).toHaveBeenCalled();
      const full = await get({ start: source[0].week, end: source.at(-1)!.week });
      const expected = new Map<string, number | null>();
      const exceptions = new Set(["2026-04-12", "2026-04-19", "2026-04-26", "2026-05-03"]);
      const rows: Array<Record<string, unknown>> = [];
      let checkedServices = 0,
        cachedTotalsChecked = 0,
        manualServices = 0;
      for (const s of source) {
        const current = facts.filter((f) => f.week === s.week);
        const apiWeek = full.weeks.find((w) => w.week === s.week)!;
        expect(apiWeek).toBeDefined();
        if (s.week <= batch.snapshot_date && !exceptions.has(s.week)) {
          expect(current).toHaveLength(2);
          expect(s.first).not.toBeNull();
          expect(s.second).not.toBeNull();
          for (const [slot, value] of [
            ["adult_service_1", s.first],
            ["adult_service_2", s.second],
          ] as const) {
            const f = current.find((r) => r.slot === slot)!;
            if (f.source === "workbook") {
              expect(f.count).toBe(value);
              expect(f.batch_id).toBe(batch.id);
            } else {
              expect(f.has_actor).toBe(true);
              expect(f.previous_id).not.toBeNull();
            }
            expect(full.revisions.find((r) => r.id === f.id)?.valid).toBe(true);
            checkedServices++;
          }
          if (s.cachedTotal !== null) {
            expect(s.cachedTotal).toBe(s.first! + s.second!);
            cachedTotalsChecked++;
          }
        } else if (exceptions.has(s.week)) {
          expect(current).toHaveLength(0);
          expect(apiWeek.quality).toBe("unrecorded");
          expect(apiWeek.value).toBeNull();
        } else {
          expect(current.every((f) => f.source === "manual" && f.has_actor)).toBe(true);
          manualServices += current.length;
        }
        const value = current.length === 2 ? current.reduce((sum, f) => sum + f.count, 0) : null;
        expected.set(s.week, exceptions.has(s.week) ? null : value);
        expect(apiWeek.value).toBe(expected.get(s.week));
        rows.push({
          week: s.week,
          first: current.find((f) => f.slot === "adult_service_1")?.count ?? null,
          second: current.find((f) => f.slot === "adult_service_2")?.count ?? null,
          total: apiWeek.value,
          quality: apiWeek.quality,
          source: current[0]?.source ?? null,
          workbookTotal: s.first === null || s.second === null ? null : s.first + s.second,
          manualCorrection: current.some(
            (f) => f.source === "manual" && s.week <= batch.snapshot_date,
          ),
        });
      }
      expect(new Set(facts.map((f) => `${f.week}:${f.slot}`)).size).toBe(facts.length);
      expect(checkedServices).toBe(80);
      const completed = source.filter((s) => s.week <= home.latestCompletedWeek);
      for (const s of completed) {
        const w = await get({ start: s.week, end: s.week, averageWeeks: 4 });
        const totals = Array.from({ length: 4 }, (_, i) => expected.get(shift(s.week, -i))).filter(
          (n): n is number => n !== null && n !== undefined,
        );
        const mean = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
        expect(w.rollingAverage.recordedWeeks).toBe(totals.length);
        expect(w.rollingAverage.value).toEqual(mean);
        const baseline = baselines.get(s.week)!;
        expect(w.yearComparison.baselineValue).toBe(baseline.value);
        if (baseline.value !== null) expect(w.yearComparison.sourceCell).toBe(baseline.cell);
        if (expected.get(s.week) === null || baseline.value === null || baseline.value === 0)
          expect(w.yearComparison.percentChange).toBeNull();
        else
          expect(w.yearComparison.percentChange).toBeCloseTo(
            ((expected.get(s.week)! - baseline.value) / baseline.value) * 100,
            10,
          );
      }
      for (let n = 1; n <= 52; n++) {
        const w = await get({ averageWeeks: n });
        const totals = Array.from({ length: n }, (_, i) =>
          expected.get(shift(home.latestCompletedWeek, -i)),
        ).filter((v): v is number => v !== null && v !== undefined);
        expect(w.rollingAverage.windowWeeks).toBe(n);
        expect(w.rollingAverage.recordedWeeks).toBe(totals.length);
        expect(w.rollingAverage.value).toBe(totals.reduce((a, b) => a + b, 0) / totals.length);
        expect(w.rollingAverage.excludedWeeks).toHaveLength(n - totals.length);
      }
      expect(home.weeks.find((w) => w.week === home.latestCompletedWeek)?.value).toBe(
        expected.get(home.latestCompletedWeek),
      );
      expect((await c.query("SELECT count(*)::int AS n FROM attendance_revisions")).rows[0].n).toBe(
        before,
      );
      const report = {
        verifiedAt: new Date().toISOString(),
        environment: "development",
        sourceFile: batch.filename,
        sourceSha256: batch.sha256,
        snapshotCutoff: batch.snapshot_date,
        checkedServices,
        checkedWorkbookWeeks: checkedServices / 2,
        cachedTotalsChecked,
        manuallyRecordedServicesAfterCutoff: manualServices,
        completedWeeksChecked: completed.length,
        averagingWindowsChecked: 52,
        discrepancies: [],
        realAttendanceWrites: 0,
        currentWeek: home.latestCompletedWeek,
        currentTotal: expected.get(home.latestCompletedWeek),
        rollingAverage: home.rollingAverage,
        yearComparison: home.yearComparison,
        rows,
      };
      await mkdir("generated-artifacts", { recursive: true });
      await writeFile(
        "generated-artifacts/phase4-attendance-reconciliation.json",
        JSON.stringify(report, null, 2),
      );
      console.info(
        "RECONCILIATION",
        JSON.stringify({ ...report, rows: `${rows.length} detailed rows in report` }),
      );
    } finally {
      await c.query("ROLLBACK");
      connection.mockRestore();
      c.release();
      await db.pool.end();
    }
  },
  120000,
);
