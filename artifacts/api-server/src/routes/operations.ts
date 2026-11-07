import { Router, type IRouter } from "express";
import {
  GetMeResponse,
  GetAdminWorkspaceQueryParams,
  GetAdminWorkspaceResponse,
  CreateInvitationBody,
  RevokeInvitationParams,
  UpdateAccessUserBody,
  UpdateAccessUserParams,
  CreateMinistryBody,
  UpdateMinistryBody,
  UpdateMinistryParams,
  CreateServiceOccurrenceBody,
  UpdateServiceOccurrenceBody,
  UpdateServiceOccurrenceParams,
} from "@workspace/api-zod";
import {
  requirePermission,
  sessionAuthProvider,
  type AuthProvider,
  type Principal,
} from "../lib/auth";
import { requireCsrf } from "../lib/security";
import * as admin from "../lib/administration";
import { recordAudit } from "../lib/audit";

export function createOperationsRouter(provider: AuthProvider = sessionAuthProvider): IRouter {
  const r = Router();
  r.use("/v1", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  r.get("/v1/me", requirePermission("attendance:aggregate", provider), (_req, res) => {
    const p: Principal = res.locals.principal;
    res.json(GetMeResponse.parse({ id: p.userId, email: p.identity.verifiedEmail, role: p.role }));
  });
  r.use("/v1/admin", requirePermission("system:manage", provider), requireCsrf);
  r.get("/v1/admin/workspace", async (req, res): Promise<void> => {
    const parsed = GetAdminWorkspaceQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid page" });
      return;
    }
    res.json(
      GetAdminWorkspaceResponse.parse(
        await admin.adminWorkspace(res.locals.principal, parsed.data.page),
      ),
    );
  });
  r.post("/v1/admin/invitations", async (req, res): Promise<void> => {
    const p = CreateInvitationBody.strict().safeParse(req.body);
    if (!p.success) {
      res.status(400).json({ error: "Invalid invitation" });
      return;
    }
    await admin.reserveInvitation(res.locals.principal, p.data.email, p.data.role);
    res.status(201).end();
  });
  r.delete("/v1/admin/invitations/:id", async (req, res): Promise<void> => {
    const p = RevokeInvitationParams.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Invalid invitation identifier" });
      return;
    }
    await admin.revokeInvitation(res.locals.principal, p.data.id);
    res.status(204).end();
  });
  r.patch("/v1/admin/users/:id", async (req, res): Promise<void> => {
    const p = UpdateAccessUserParams.safeParse(req.params),
      b = UpdateAccessUserBody.strict().safeParse(req.body);
    if (!p.success || !b.success) {
      res.status(400).json({ error: "Invalid account update" });
      return;
    }
    await admin.updateUserAccess(res.locals.principal, p.data.id, b.data.role, b.data.status);
    res.status(204).end();
  });
  r.post("/v1/admin/ministries", async (req, res): Promise<void> => {
    const p = CreateMinistryBody.strict().safeParse(req.body);
    if (!p.success) {
      res.status(400).json({ error: "Invalid ministry" });
      return;
    }
    await admin.saveMinistry(res.locals.principal, null, p.data);
    res.status(201).end();
  });
  r.patch("/v1/admin/ministries/:id", async (req, res): Promise<void> => {
    const p = UpdateMinistryParams.safeParse(req.params),
      b = UpdateMinistryBody.strict().safeParse(req.body);
    if (!p.success || !b.success) {
      res.status(400).json({ error: "Invalid ministry" });
      return;
    }
    await admin.saveMinistry(res.locals.principal, p.data.id, b.data);
    res.status(204).end();
  });
  r.post("/v1/admin/services", async (req, res): Promise<void> => {
    const p = CreateServiceOccurrenceBody.strict().safeParse(req.body);
    if (!p.success || !admin.explicitInstant(req.body?.startAt)) {
      res.status(400).json({
        error: "Service start must be an ISO timestamp with seconds and an explicit UTC offset",
      });
      return;
    }
    await admin.saveService(res.locals.principal, null, p.data);
    res.status(201).end();
  });
  r.patch("/v1/admin/services/:id", async (req, res): Promise<void> => {
    const p = UpdateServiceOccurrenceParams.safeParse(req.params),
      b = UpdateServiceOccurrenceBody.strict().safeParse(req.body);
    if (!p.success || !b.success || !admin.explicitInstant(req.body?.startAt)) {
      res.status(400).json({
        error: "Service start must be an ISO timestamp with seconds and an explicit UTC offset",
      });
      return;
    }
    await admin.saveService(res.locals.principal, p.data.id, b.data);
    res.status(204).end();
  });
  // No finance data is implemented in Phase 1. All giving paths use admin-only
  // guards (including summary) until the suppression policy is approved.
  r.use(
    "/v1/giving",
    requirePermission("giving:individual", provider),
    async (_req, res): Promise<void> => {
      const p: Principal = res.locals.principal;
      if (p.userId)
        await recordAudit(p.userId, "access.unavailable", "giving", null, "unavailable");
      res.status(501).json({ error: "Giving is not available" });
    },
  );
  r.use("/v1", requirePermission("attendance:aggregate", provider), (_req, res) => {
    res.status(501).json({ error: "This feature is not available" });
  });
  return r;
}
export default createOperationsRouter();
