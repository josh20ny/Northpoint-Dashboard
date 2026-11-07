import express, { Router, type IRouter } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { rateLimit } from "express-rate-limit";
import {
  ListImportsResponse,
  ListImportUploadsResponse,
  ListImportUploadsQueryParams,
  UploadWorkbookQueryParams,
  UploadWorkbookResponse,
  ImportProvidedWorkbookBody,
  ImportProvidedWorkbookResponse,
  GetImportParams,
  GetImportResponse,
  GetImportCellsQueryParams,
  GetImportCellsResponse,
  GetImportRowsParams,
  GetImportRowsQueryParams,
  GetImportRowsResponse,
  CreateImportMappingBody,
  CreateImportMappingResponse,
  ReviewImportMappingBody,
  ChangeImportStateBody,
  GetImportReportResponse,
  ApproveImportWeekBody,
  ExportImportReportParams,
} from "@workspace/api-zod";
import { requirePermission, sessionAuthProvider, type AuthProvider } from "../lib/auth";
import { requireCsrf } from "../lib/security";
import { projectRoot } from "../lib/documents";
import { AccessError, validCalendarDate } from "../lib/administration";
import { MAX_WORKBOOK_BYTES } from "../lib/workbook";
import * as imports from "../lib/imports";

export function createImportRouter(provider: AuthProvider = sessionAuthProvider): IRouter {
  const r = Router();
  r.use("/v1/admin/imports", requirePermission("system:manage", provider), requireCsrf);
  const uploadLimit = rateLimit({
    windowMs: 60000,
    limit: 4,
    keyGenerator: () => "workbook-catalog",
    standardHeaders: true,
    legacyHeaders: false,
  });
  const id = (params: unknown) => {
    const p = GetImportParams.safeParse(params);
    if (!p.success) throw new AccessError(400, "Invalid batch identifier");
    return p.data.id;
  };
  const mappingIds = (params: unknown) => {
    const p = GetImportRowsParams.safeParse(params);
    if (!p.success) throw new AccessError(400, "Invalid mapping identifier");
    return p.data;
  };
  r.get("/v1/admin/imports", async (_req, res): Promise<void> => {
    res.json(ListImportsResponse.parse(await imports.listImports(res.locals.principal)));
  });
  r.get("/v1/admin/imports/uploads", async (req, res): Promise<void> => {
    const q = ListImportUploadsQueryParams.safeParse(req.query);
    if (!q.success) throw new AccessError(400, "Invalid upload history page");
    res
      .set("Cache-Control", "no-store")
      .json(
        ListImportUploadsResponse.parse(
          await imports.listImportUploads(res.locals.principal, q.data.page),
        ),
      );
  });
  r.post(
    "/v1/admin/imports",
    uploadLimit,
    express.raw({ type: "application/octet-stream", limit: MAX_WORKBOOK_BYTES }),
    async (req, res): Promise<void> => {
      const q = UploadWorkbookQueryParams.safeParse(req.query);
      if (!q.success || !Buffer.isBuffer(req.body))
        throw new AccessError(400, "Choose an XLSX file and snapshot date");
      res
        .status(201)
        .json(
          UploadWorkbookResponse.parse(
            await imports.catalogWorkbook(
              res.locals.principal,
              req.body,
              q.data.filename,
              q.data.snapshotDate,
            ),
          ),
        );
    },
  );
  r.post("/v1/admin/imports/source", uploadLimit, async (req, res): Promise<void> => {
    const b = ImportProvidedWorkbookBody.strict().safeParse(req.body);
    if (!b.success) throw new AccessError(400, "Enter the workbook snapshot date");
    const filename = "NP Dashboard - 2026 (orignal source-legacy).xlsx";
    const bytes = await readFile(path.join(projectRoot(), "data", filename));
    res
      .status(201)
      .json(
        ImportProvidedWorkbookResponse.parse(
          await imports.catalogWorkbook(res.locals.principal, bytes, filename, b.data.snapshotDate),
        ),
      );
  });
  r.get("/v1/admin/imports/:id", async (req, res): Promise<void> => {
    res.json(
      GetImportResponse.parse(await imports.importDetail(res.locals.principal, id(req.params))),
    );
  });
  r.get("/v1/admin/imports/:id/cells", async (req, res): Promise<void> => {
    const q = GetImportCellsQueryParams.safeParse(req.query);
    if (!q.success) throw new AccessError(400, "Choose a worksheet and page");
    res.json(
      GetImportCellsResponse.parse(
        await imports.importCells(res.locals.principal, id(req.params), q.data.sheet, q.data.page),
      ),
    );
  });
  r.get("/v1/admin/imports/:id/original", async (req, res): Promise<void> => {
    const file = await imports.downloadOriginal(res.locals.principal, id(req.params));
    res.attachment(file.filename).set("Cache-Control", "no-store").send(file.bytes);
  });
  r.post("/v1/admin/imports/:id/state", async (req, res): Promise<void> => {
    const b = ChangeImportStateBody.strict().safeParse(req.body);
    if (!b.success || b.data.note.trim().length < 5)
      throw new AccessError(400, "Choose a state and provide a review note");
    await imports.changeImportState(
      res.locals.principal,
      id(req.params),
      b.data.state,
      b.data.note.trim(),
    );
    res.status(204).end();
  });
  r.post("/v1/admin/imports/:id/mappings", async (req, res): Promise<void> => {
    const b = CreateImportMappingBody.strict().safeParse(req.body);
    if (
      !b.success ||
      !b.data.semantics.trim() ||
      !b.data.ministry.trim() ||
      !b.data.legacyLabel.trim() ||
      !b.data.priority.trim() ||
      !b.data.unit.trim()
    )
      throw new AccessError(400, "Complete the explicit mapping definition");
    res
      .status(201)
      .json(
        CreateImportMappingResponse.parse(
          await imports.createMapping(res.locals.principal, id(req.params), b.data),
        ),
      );
  });
  r.post("/v1/admin/imports/:id/mappings/:mappingId/review", async (req, res): Promise<void> => {
    const b = ReviewImportMappingBody.strict().safeParse(req.body),
      p = mappingIds(req.params);
    if (!b.success || b.data.note.trim().length < 5)
      throw new AccessError(400, "Provide a mapping review decision and note");
    await imports.reviewMapping(
      res.locals.principal,
      p.id,
      p.mappingId,
      b.data.decision,
      b.data.note.trim(),
    );
    res.status(204).end();
  });
  r.post("/v1/admin/imports/:id/mappings/:mappingId/stage", async (req, res): Promise<void> => {
    const p = mappingIds(req.params);
    await imports.stageMapping(res.locals.principal, p.id, p.mappingId);
    res.status(204).end();
  });
  r.get("/v1/admin/imports/:id/mappings/:mappingId/rows", async (req, res): Promise<void> => {
    const p = mappingIds(req.params),
      q = GetImportRowsQueryParams.safeParse(req.query);
    if (!q.success) throw new AccessError(400, "Invalid page");
    res.json(
      GetImportRowsResponse.parse(
        await imports.stagedRows(res.locals.principal, p.id, p.mappingId, q.data.page),
      ),
    );
  });
  r.get("/v1/admin/imports/:id/report", async (req, res): Promise<void> => {
    res.json(
      GetImportReportResponse.parse(
        await imports.importReport(res.locals.principal, id(req.params)),
      ),
    );
  });
  r.post("/v1/admin/imports/:id/reviews", async (req, res): Promise<void> => {
    const b = ApproveImportWeekBody.strict().safeParse(req.body);
    if (!b.success || !validCalendarDate(b.data.week) || b.data.note.trim().length < 10)
      throw new AccessError(400, "Provide the week, current evidence hash and reconciliation note");
    await imports.approveWeek(
      res.locals.principal,
      id(req.params),
      b.data.week,
      b.data.evidenceHash,
      b.data.note.trim(),
    );
    res.status(204).end();
  });
  r.get("/v1/admin/imports/:id/exports/:kind", async (req, res): Promise<void> => {
    const p = ExportImportReportParams.safeParse(req.params);
    if (!p.success) throw new AccessError(400, "Invalid report request");
    const f = await imports.exportReport(res.locals.principal, p.data.id, p.data.kind);
    res.set("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'");
    res.attachment(f.filename).type(f.type).send(f.content);
  });
  return r;
}
export default createImportRouter();
