import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { PoolClient } from "pg";
import type { Principal } from "../artifacts/api-server/src/lib/auth";
import { digest } from "../artifacts/api-server/src/lib/planning-center-client";
import { normalized } from "../artifacts/api-server/src/lib/planning-center-source";
import type { SourceEntity } from "../artifacts/api-server/src/lib/planning-center-source";

describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "ministry storage and non-owner isolation (rollback only)",
  () => {
    let c: PoolClient,
      db: typeof import("../lib/db/src/index"),
      repo: typeof import("../artifacts/api-server/src/lib/ministry-data");
    let admin: Principal, staff: Principal, leadership: Principal, account: string, runId: string;
    let observedQueries = 0;
    beforeAll(async () => {
      db = await import("../lib/db/src/index");
      c = await db.pool.connect();
      vi.spyOn(db.pool, "connect").mockImplementation(
        async () =>
          ({
            query: async (sql: string, args?: unknown[]) => {
              observedQueries++;
              if (sql === "BEGIN") return c.query("SAVEPOINT ministry_operation");
              if (sql === "COMMIT") return c.query("RELEASE SAVEPOINT ministry_operation");
              if (sql === "ROLLBACK") {
                await c.query("ROLLBACK TO SAVEPOINT ministry_operation");
                return c.query("RELEASE SAVEPOINT ministry_operation");
              }
              return c.query(sql, args);
            },
            release() {},
          }) as never,
      );
      repo = await import("../artifacts/api-server/src/lib/ministry-data");
    });
    beforeEach(async () => {
      await c.query("BEGIN");
      await c.query("SELECT set_config('np.role','admin',true)");
      const actor = async (role: Principal["role"]): Promise<Principal> => {
        const id = randomUUID(),
          email = `${id}@example.invalid`;
        await c.query(
          "INSERT INTO users(id,provider,auth_subject,email,role) VALUES($1::uuid,'replit',$1::text,$2,$3)",
          [id, email, role],
        );
        return {
          userId: id,
          role,
          identity: { provider: "replit", subject: id, verifiedEmail: email },
        };
      };
      admin = await actor("admin");
      staff = await actor("staff");
      leadership = await actor("leadership");
      // Use only the organization identifier, never credentials or token fields.
      // All synthetic source/publication rows are inside this rollback transaction.
      const connection = await c.query(
        "SELECT account_ref FROM pco_connections WHERE id='planning_center'",
      );
      account = connection.rows[0]?.account_ref;
      if (!account) {
        account = "9000000000001";
        await c.query(
          "INSERT INTO pco_connections(id,account_ref,account_name,state,scopes,connected_by) VALUES('planning_center',$1,'Synthetic fixture','disconnected','[]',$2)",
          [account, admin.userId],
        );
      }
      runId = randomUUID();
      await c.query(
        `INSERT INTO pco_sync_runs(id,account_ref,product,mode,status,queue,started_by,started_at,finished_at)
      VALUES($1,$2,'giving','backfill','complete','[]',$3,now()+interval '1 second',now())`,
        [runId, account, admin.userId],
      );
      const entity: SourceEntity = {
        type: "Donation",
        id: "998877665544",
        attributes: {
          amount_cents: 12500,
          amount_currency: "USD",
          received_at: "2026-11-08T15:00:00Z",
          payment_status: "succeeded",
          refunded: false,
        },
        relationships: {
          person: { data: { type: "Person", id: "887766554433" } },
          recurring_donation: { data: null },
        },
      };
      const rawId = randomUUID();
      await c.query(
        `INSERT INTO raw_source_records(id,provider,account_ref,object_type,external_id,payload_json,payload_hash)
      VALUES($1,'planning_center',$2,'giving:Donation',$3,$4,$5)`,
        [rawId, account, entity.id, JSON.stringify(entity), digest(JSON.stringify(entity))],
      );
      await c.query(
        `INSERT INTO pco_source_entities(account_ref,product,object_type,external_id,raw_id,sync_run_id,observed_run_id,normalized)
      VALUES($1,'giving','Donation',$2,$3,$4,$4,$5)`,
        [
          account,
          entity.id,
          rawId,
          runId,
          JSON.stringify(normalized(entity, "/giving/v2/donations")),
        ],
      );
      observedQueries = 0;
      await repo.ministryDataAdmin(admin);
      // Assert alias/pool interception BEFORE any mutation repository call.
      expect(observedQueries).toBeGreaterThan(0);
    });
    afterEach(async () => {
      await c.query("ROLLBACK");
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      c?.release();
      await db?.pool.end();
    });
    const publish = () =>
      repo.publishMinistryData(admin, {
        product: "giving",
        start: "2026-11-08",
        end: "2026-11-08",
      });
    it("publishes exact cents, reuses replay and safely exposes the same totals to every role", async () => {
      const first = await publish(),
        second = await publish();
      expect(first.reused).toBe(false);
      expect(second).toMatchObject({ reused: true, publicationId: first.publicationId });
      for (const actor of [admin, staff, leadership]) {
        const result = await repo.readMinistryData(actor, "giving", "2026-11-08", "2026-11-08");
        expect(result.metrics.find((m) => m.measure === "giving_total")).toMatchObject({
          value: 12500,
          unit: "USD_minor",
          quality: "complete",
        });
        expect(JSON.stringify(result)).not.toMatch(
          /887766554433|998877665544|personId|recurringId|token/,
        );
      }
      const tx = await repo.givingTransactions(admin, 1);
      expect(tx.transactions.find((t) => t.id === "998877665544")).toMatchObject({
        personId: "887766554433",
        amountMinor: 12500,
      });
      await expect(repo.givingTransactions(staff, 1)).rejects.toMatchObject({ status: 403 });
    });
    it("audits Check-In include decisions and applies them on the next publication without exposing person data", async () => {
      const checkInRunId = randomUUID();
      const checkInId = `test-checkin-${randomUUID()}`;
      const periodId = `test-period-${randomUUID()}`;
      const timeId = `test-time-${randomUUID()}`;
      const eventId = `test-event-${randomUUID()}`;
      const locationId = `test-location-${randomUUID()}`;
      await c.query(
        `INSERT INTO pco_sync_runs(id,account_ref,product,mode,status,queue,started_by,started_at,finished_at)
        VALUES($1,$2,'check_ins','incremental','complete','[]',$3,now()+interval '2 seconds',now())`,
        [checkInRunId, account, admin.userId],
      );
      const rows: SourceEntity[] = [
        {
          type: "CheckIn",
          id: checkInId,
          attributes: { kind: "Guest" },
          relationships: {
            person: { data: null },
            event_period: { data: { type: "EventPeriod", id: periodId } },
            event_times: { data: [{ type: "EventTime", id: timeId }] },
            locations: { data: [{ type: "Location", id: locationId }] },
          },
        },
        {
          type: "EventPeriod",
          id: periodId,
          attributes: { starts_at: "2026-11-08T15:00:00Z" },
          relationships: { event: { data: { type: "Event", id: eventId } } },
        },
        {
          type: "EventTime",
          id: timeId,
          attributes: { starts_at: "2026-11-08T15:00:00Z" },
          relationships: { event: { data: { type: "Event", id: eventId } } },
        },
      ];
      for (const entity of rows) {
        const rawId = randomUUID();
        await c.query(
          `INSERT INTO raw_source_records(id,provider,account_ref,object_type,external_id,payload_json,payload_hash)
          VALUES($1,'planning_center',$2,$3,$4,$5,$6)`,
          [
            rawId,
            account,
            `check_ins:${entity.type}`,
            entity.id,
            JSON.stringify(entity),
            digest(JSON.stringify(entity)),
          ],
        );
        await c.query(
          `INSERT INTO pco_source_entities(account_ref,product,object_type,external_id,raw_id,sync_run_id,observed_run_id,normalized)
          VALUES($1,'check_ins',$2,$3,$4,$5,$5,$6)`,
          [
            account,
            entity.type,
            entity.id,
            rawId,
            checkInRunId,
            JSON.stringify(normalized(entity, `/check-ins/v2/${entity.type}`)),
          ],
        );
      }
      await c.query(
        `INSERT INTO ministry_source_mappings(product,object_type,external_id,account_ref,ministry,measure,scope,effective_from,note,created_by)
        VALUES('check_ins','Event',$2,$1,'upstreet','attendance','service-1','2022-01-01','Synthetic Check-In mapping',$3)`,
        [account, eventId, admin.userId],
      );

      const review = await repo.getCheckInReview(admin, 1);
      expect(review).toMatchObject({ unresolved: 1, total: 1 });
      expect(review.items[0]).toMatchObject({
        checkInId,
        serviceDate: "2026-11-08",
        eventId,
        locationIds: [locationId],
        issueReasons: ["missing_person_profile"],
        canInclude: true,
      });
      expect(JSON.stringify(review)).not.toContain("personId");
      const pending = await repo.publishMinistryData(admin, {
        product: "check_ins",
        start: "2026-11-08",
        end: "2026-11-08",
      });
      expect(pending.issues).toContain("unresolved_checkins_pending:1");

      await expect(repo.resolveCheckIn(admin, checkInId, "include")).resolves.toEqual({
        checkInId,
        action: "include",
      });
      const resolution = (
        await c.query(
          "SELECT action,target_type,target_id FROM audit_events WHERE target_id=$1 ORDER BY timestamp DESC LIMIT 1",
          [`${account}:${checkInId}`],
        )
      ).rows[0];
      expect(resolution).toMatchObject({
        action: "ministry.checkin_include",
        target_type: "pco_checkin_resolution",
        target_id: `${account}:${checkInId}`,
      });
      expect((await repo.getCheckInReview(admin, 1)).items[0].resolution).toBe("include");

      const published = await repo.publishMinistryData(admin, {
        product: "check_ins",
        start: "2026-11-08",
        end: "2026-11-08",
      });
      expect(published.reused).toBe(false);
      const workspace = await repo.readMinistryData(staff, "upstreet", "2026-11-08", "2026-11-08");
      expect(workspace.metrics.find((metric) => metric.measure === "attendance")).toMatchObject({
        value: 1,
        quality: "complete",
      });
    });
    it("publishes a Friday–Sunday Check-In window with the latest Groups snapshot without publishing group totals", async () => {
      // The bounded loader intentionally includes earlier observed Check-Ins.
      // Isolate this fixture's organization within the rollback transaction so
      // the test cannot read the development organization's staged attendance.
      account = `publication-fixture-${randomUUID()}`;
      await c.query(
        "UPDATE pco_connections SET account_ref=$1 WHERE id='planning_center'",
        [account],
      );
      const groupsRunId = randomUUID();
      const checkInRunId = randomUUID();
      const groupId = `test-group-${randomUUID()}`;
      const membershipId = `test-membership-${randomUUID()}`;
      const personId = `test-person-${randomUUID()}`;
      const eventId = `test-event-${randomUUID()}`;
      const eventTimeId = `test-event-time-${randomUUID()}`;
      const periodId = `test-period-${randomUUID()}`;
      const checkInId = `test-checkin-${randomUUID()}`;
      await c.query(
        `INSERT INTO pco_sync_runs(id,account_ref,product,mode,status,queue,started_by,started_at,finished_at)
        VALUES($1,$2,'groups','current','complete','[]',$3,now()+interval '4 seconds','2026-11-10T12:00:00Z')`,
        [groupsRunId, account, admin.userId],
      );
      await c.query(
        `INSERT INTO pco_sync_runs(id,account_ref,product,mode,status,queue,started_by,started_at,finished_at,coverage_start,coverage_end)
        VALUES($1,$2,'check_ins','incremental','complete','[]',$3,now()+interval '5 seconds','2026-11-10T12:01:00Z','2026-11-06','2026-11-08')`,
        [checkInRunId, account, admin.userId],
      );

      const staged: { product: string; runId: string; entity: SourceEntity; path: string }[] = [
        {
          product: "groups",
          runId: groupsRunId,
          entity: { type: "Group", id: groupId, attributes: { archived_at: null } },
          path: "/groups/v2/groups",
        },
        {
          product: "groups",
          runId: groupsRunId,
          entity: {
            type: "Membership",
            id: membershipId,
            attributes: { joined_at: "2026-01-01T00:00:00Z", role: "member" },
            relationships: {
              group: { data: { type: "Group", id: groupId } },
              person: { data: { type: "Person", id: personId } },
            },
          },
          path: `/groups/v2/groups/${groupId}/memberships`,
        },
        {
          product: "check_ins",
          runId: checkInRunId,
          entity: {
            type: "Event",
            id: eventId,
            attributes: { name: "Synthetic student service" },
          },
          path: "/check-ins/v2/events",
        },
        {
          product: "check_ins",
          runId: checkInRunId,
          entity: {
            type: "EventPeriod",
            id: periodId,
            attributes: { starts_at: "2026-11-08T15:00:00Z" },
            relationships: { event: { data: { type: "Event", id: eventId } } },
          },
          path: "/check-ins/v2/event_periods",
        },
        {
          product: "check_ins",
          runId: checkInRunId,
          entity: {
            type: "EventTime",
            id: eventTimeId,
            attributes: { starts_at: "2026-11-08T15:00:00Z" },
            relationships: { event: { data: { type: "Event", id: eventId } } },
          },
          path: "/check-ins/v2/event_times",
        },
        {
          product: "check_ins",
          runId: checkInRunId,
          entity: {
            type: "CheckIn",
            id: checkInId,
            attributes: { kind: "Guest" },
            relationships: {
              person: { data: { type: "Person", id: personId } },
              event_period: { data: { type: "EventPeriod", id: periodId } },
              event_times: { data: [{ type: "EventTime", id: eventTimeId }] },
              locations: { data: [] },
            },
          },
          path: "/check-ins/v2/check_ins",
        },
      ];
      for (const { product, runId: sourceRunId, entity, path } of staged) {
        const rawId = randomUUID();
        await c.query(
          `INSERT INTO raw_source_records(id,provider,account_ref,object_type,external_id,payload_json,payload_hash)
          VALUES($1,'planning_center',$2,$3,$4,$5,$6)`,
          [
            rawId,
            account,
            `${product}:${entity.type}`,
            entity.id,
            JSON.stringify(entity),
            digest(JSON.stringify(entity)),
          ],
        );
        await c.query(
          `INSERT INTO pco_source_entities(account_ref,product,object_type,external_id,raw_id,sync_run_id,observed_run_id,normalized)
          VALUES($1,$2,$3,$4,$5,$6,$6,$7)`,
          [
            account,
            product,
            entity.type,
            entity.id,
            rawId,
            sourceRunId,
            JSON.stringify(normalized(entity, path)),
          ],
        );
      }
      await c.query(
        `INSERT INTO ministry_source_mappings(product,object_type,external_id,account_ref,ministry,measure,scope,effective_from,note,created_by)
        VALUES
          ('check_ins','EventTime',$2,$1,'transit','service_session','service-1','2026-01-01','Synthetic service-time route',$3),
          ('groups','Group',$4,$1,'transit','student_group_classification','all','2026-01-01','Synthetic student ministry',$3)`,
        [account, eventTimeId, admin.userId, groupId],
      );

      await repo.publishMinistryData(admin, {
        product: "check_ins",
        start: "2026-11-08",
        end: "2026-11-08",
      });
      const workspace = await repo.readMinistryData(admin, "transit", "2026-11-08", "2026-11-08");
      expect(
        workspace.metrics.find(
          (metric) => metric.measure === "attendance" && metric.scope === "service-1",
        ),
      ).toMatchObject({ value: 1, quality: "complete" });
      expect(workspace.metrics.some((metric) => metric.measure === "group_attendance")).toBe(false);
      expect(JSON.stringify(workspace)).not.toContain(personId);
      expect(JSON.stringify(workspace)).not.toContain(checkInId);
      expect(JSON.stringify(workspace)).not.toContain(groupId);
    });
    it("invalidates a prior publication after mapping interpretation changes without rewriting it", async () => {
      const publication = await publish();
      await c.query("SELECT set_config('np.role','admin',true)");
      await c.query(
        `INSERT INTO ministry_source_mappings(product,object_type,external_id,account_ref,ministry,measure,scope,effective_from,note,created_by)
      VALUES('giving','Fund','101',$1,'giving','fund_giving','strategic','2026-01-01','Synthetic mapping revision',$2)`,
        [account, admin.userId],
      );
      const result = await repo.readMinistryData(staff, "giving", "2026-11-08", "2026-11-08");
      expect(result.metrics.find((m) => m.measure === "giving_total")).toMatchObject({
        value: null,
        quality: "invalidated",
      });
      await c.query("SELECT set_config('np.role','admin',true)");
      expect(
        (
          await c.query(
            "SELECT value::int FROM ministry_metric_values WHERE publication_id=$1 AND measure='giving_total'",
            [publication.publicationId],
          )
        ).rows[0].value,
      ).toBe(12500);
    });
    it("denies nonowner raw/evidence access but permits safe aggregate rows and boolean validity", async () => {
      const publication = await publish();
      const role = `ministry_rls_${randomUUID().replaceAll("-", "")}`;
      await c.query(`CREATE ROLE "${role}" NOLOGIN`);
      await c.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await c.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}"`);
      await c.query(`SET LOCAL ROLE "${role}"`);
      await c.query("SELECT set_config('np.role','staff',true),set_config('np.user_id',$1,true)", [
        staff.userId,
      ]);
      expect(
        (
          await c.query("SELECT * FROM ministry_publication_evidence WHERE publication_id=$1", [
            publication.publicationId,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await c.query(
            "SELECT * FROM pco_source_entities WHERE account_ref=$1 AND external_id='998877665544'",
            [account],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await c.query(
            "SELECT value::int FROM ministry_metric_values WHERE publication_id=$1 AND measure='giving_total'",
            [publication.publicationId],
          )
        ).rows[0].value,
      ).toBe(12500);
      expect(
        (
          await c.query("SELECT np_ministry_publication_valid($1) AS valid", [
            publication.publicationId,
          ])
        ).rows[0].valid,
      ).toBe(true);
      expect((await c.query("SELECT current_setting('np.role') AS role")).rows[0].role).toBe(
        "staff",
      );
      await c.query("RESET ROLE");
    });
    it("preserves immutable publication/evidence and refuses incomplete source runs", async () => {
      const publication = await publish();
      for (const table of [
        "ministry_publications",
        "ministry_metric_values",
        "ministry_publication_evidence",
      ]) {
        await c.query("SAVEPOINT immutable_check");
        await expect(
          c.query(
            `DELETE FROM ${table} WHERE ${table === "ministry_publications" ? "id" : "publication_id"}=$1`,
            [publication.publicationId],
          ),
        ).rejects.toThrow(/immutable/);
        await c.query("ROLLBACK TO SAVEPOINT immutable_check");
      }
      await c.query("UPDATE pco_sync_runs SET status='failed' WHERE id=$1", [runId]);
      await expect(publish()).rejects.toMatchObject({ status: 409 });
    });
    it("persists editable formula versions, rejects stale edits and invalidates old Giving figures", async () => {
      const policies = await import("../artifacts/api-server/src/lib/giving-policy");
      const original = await policies.readGivingPolicy(admin);
      const publication = await publish();
      const input = {
        minimumGifts: original.minimumGifts === 24 ? 4 : original.minimumGifts + 1,
        toleranceDays: original.toleranceDays,
        missedExpected: original.missedExpected,
        grouping: original.grouping,
        cadences: original.cadences,
        note: "Synthetic rollback-only formula edit",
        previousId: original.id,
      };
      const saved = await policies.saveGivingPolicy(admin, input);
      expect(saved.id).not.toBe(original.id);
      expect(await policies.readGivingPolicy(admin)).toMatchObject({
        id: saved.id,
        minimumGifts: input.minimumGifts,
        origin: "admin_version",
      });
      await expect(policies.saveGivingPolicy(admin, input)).rejects.toMatchObject({ status: 409 });
      await expect(
        policies.saveGivingPolicy(staff, { ...input, previousId: saved.id }),
      ).rejects.toMatchObject({ status: 403 });
      const publicData = await repo.readMinistryData(staff, "giving", "2026-11-08", "2026-11-08");
      expect(publicData.metrics.find((m) => m.measure === "giving_total")).toMatchObject({
        value: null,
        quality: "invalidated",
      });
      await c.query("SELECT set_config('np.role','admin',true)");
      expect(
        (
          await c.query(
            "SELECT evidence->>'givingPolicyId' AS policy FROM ministry_publication_evidence WHERE publication_id=$1",
            [publication.publicationId],
          )
        ).rows[0].policy,
      ).toBe(original.id);
      const health = await policies.givingHealth(admin, 1);
      expect(health.units).toEqual([]);
      expect(health.issues.join(" ")).toMatch(/changed/);
    });
    it("imports accepted cached workbook dollars exactly, deduplicates replay and prefers complete PCO overlap", async () => {
      const batchId = randomUUID(),
        mappingId = randomUUID(),
        sha = digest(batchId);
      await c.query("SELECT set_config('np.role','admin',true)");
      await c.query(
        `INSERT INTO import_batches(id,sha256,filename,snapshot_date,object_path,catalog,created_by)
      VALUES($1,$2,'Synthetic rollback-only Giving.xlsx','2026-11-10','/synthetic/giving','{}',$3)`,
        [batchId, sha, admin.userId],
      );
      await c.query(
        `INSERT INTO workbook_source_authorities(batch_id,sha256,basis,origin)
      VALUES($1,$2,'Synthetic rollback-only accepted source','owner_instruction')`,
        [batchId, sha],
      );
      await c.query(
        `INSERT INTO import_mappings(id,batch_id,definition,status,review_note,reviewed_by)
      VALUES($1,$2,$3,'draft',NULL,NULL)`,
        [
          mappingId,
          batchId,
          JSON.stringify({
            sheet: "Giving",
            valueColumn: "B",
            dateColumn: "A",
            startRow: 2,
            endRow: 2,
            target: "giving_total",
            ministry: "giving",
            unit: "USD",
          }),
        ],
      );
      await c.query(
        `UPDATE import_mappings SET status='approved',review_note='Synthetic rollback-only source semantics',reviewed_by=$2 WHERE id=$1`,
        [mappingId, admin.userId],
      );
      await c.query(
        "INSERT INTO import_staged_rows(mapping_id,source_row,data) VALUES($1,'2',$2)",
        [
          mappingId,
          JSON.stringify({
            sundayDate: "2026-11-08",
            value: 123.45,
            calculationStatus: "cached_unverified",
            flags: ["external_reference"],
            coordinate: "B2",
            dateCoordinate: "A2",
          }),
        ],
      );
      const input = {
        batchId,
        mappingId,
        ministry: "giving",
        measure: "giving_total",
        scope: "all",
        year: null,
      };
      const imported = await repo.importMinistryHistory(admin, input);
      expect(imported).toMatchObject({ values: 1, reused: false });
      expect(await repo.importMinistryHistory(admin, input)).toMatchObject({
        publicationId: imported.publicationId,
        reused: true,
      });
      let workspace = await repo.readMinistryData(staff, "giving", "2026-11-08", "2026-11-08");
      expect(workspace.metrics.find((m) => m.measure === "giving_total")).toMatchObject({
        value: 12345,
        unit: "USD_minor",
        source: "workbook",
        quality: "complete",
      });
      await publish();
      workspace = await repo.readMinistryData(staff, "giving", "2026-11-08", "2026-11-08");
      expect(workspace.metrics.find((m) => m.measure === "giving_total")).toMatchObject({
        value: 12500,
        source: "pco",
      });
    });
  },
);
