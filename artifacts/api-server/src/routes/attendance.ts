import { Router, type IRouter } from "express";
import {
  GetAttendanceQueryParams,
  GetAttendanceResponse,
  SaveAttendanceBody,
  SaveAttendanceResponse,
  SaveAttendanceDefinitionBody,
  SaveAttendanceDefinitionResponse,
  GetAttendanceHistoryPreviewParams,
  GetAttendanceHistoryPreviewResponse,
  PromoteAttendanceHistoryParams,
  PromoteAttendanceHistoryBody,
  PromoteAttendanceHistoryResponse,
} from "@workspace/api-zod";
import { requirePermission, sessionAuthProvider, type AuthProvider } from "../lib/auth";
import { requireCsrf } from "../lib/security";
import { readAttendance, saveDefinition, saveManual } from "../lib/attendance";
import { previewHistory, promoteHistory } from "../lib/attendance-history";
import { AccessError } from "../lib/administration";

export function createAttendanceRouter(provider: AuthProvider = sessionAuthProvider): IRouter {
  const r = Router();
  r.use("/v1/attendance", requirePermission("attendance:aggregate", provider), requireCsrf);
  r.get("/v1/attendance", async (req, res): Promise<void> => {
    const q = GetAttendanceQueryParams.safeParse(req.query);
    if (!q.success) throw new AccessError(400, "Invalid attendance date range");
    res.json(
      GetAttendanceResponse.parse(
        await readAttendance(res.locals.principal, q.data.start, q.data.end, q.data.definitionId),
      ),
    );
  });
  r.post(
    "/v1/attendance",
    requirePermission("attendance:write", provider),
    async (req, res): Promise<void> => {
      const b = SaveAttendanceBody.strict().safeParse(req.body);
      if (!b.success) throw new AccessError(400, "Invalid attendance input");
      res.json(SaveAttendanceResponse.parse(await saveManual(res.locals.principal, b.data)));
    },
  );
  r.use("/v1/admin/attendance", requirePermission("system:manage", provider), requireCsrf);
  r.post("/v1/admin/attendance/definition", async (req, res): Promise<void> => {
    const b = SaveAttendanceDefinitionBody.strict().safeParse(req.body);
    if (!b.success) throw new AccessError(400, "Invalid attendance setup");
    res.json(
      SaveAttendanceDefinitionResponse.parse(await saveDefinition(res.locals.principal, b.data)),
    );
  });
  r.get("/v1/admin/attendance/history/:batchId", async (req, res): Promise<void> => {
    const p = GetAttendanceHistoryPreviewParams.safeParse(req.params);
    if (!p.success) throw new AccessError(400, "Invalid batch");
    res.json(
      GetAttendanceHistoryPreviewResponse.parse(
        await previewHistory(res.locals.principal, p.data.batchId),
      ),
    );
  });
  r.post("/v1/admin/attendance/history/:batchId", async (req, res): Promise<void> => {
    const p = PromoteAttendanceHistoryParams.safeParse(req.params),
      b = PromoteAttendanceHistoryBody.strict().safeParse(req.body);
    if (!p.success || !b.success) throw new AccessError(400, "Invalid historical promotion");
    res.json(
      PromoteAttendanceHistoryResponse.parse(
        await promoteHistory(res.locals.principal, p.data.batchId, b.data),
      ),
    );
  });
  return r;
}
export default createAttendanceRouter();
