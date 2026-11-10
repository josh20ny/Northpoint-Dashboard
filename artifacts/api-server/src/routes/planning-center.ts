import { Router, type IRouter, type Request, type RequestHandler } from "express";
import {
  GetPlanningCenterResponse,
  AuthorizePlanningCenterResponse,
  AuthorizePlanningCenterBody,
  ConfirmPlanningCenterBody,
  StartPlanningCenterSyncBody,
  StartPlanningCenterSyncResponse,
  AdvancePlanningCenterSyncParams,
  AdvancePlanningCenterSyncResponse,
  CancelPlanningCenterSyncParams,
  SetPlanningCenterAutomationParams,
  SetPlanningCenterAutomationBody,
  SetPlanningCenterAutomationResponse,
  SetPlanningCenterScheduleBody,
  SetPlanningCenterScheduleResponse,
} from "@workspace/api-zod";
import { requirePermission, sessionAuthProvider, type AuthProvider } from "../lib/auth";
import { requireCsrf, SESSION_COOKIE } from "../lib/security";
import { AccessError } from "../lib/administration";
import { ProviderError } from "../lib/planning-center-client";
import * as pco from "../lib/planning-center";
import { setSchedule } from "../lib/planning-center-schedule";

function sessionToken(req: Request) {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length > 256 || !token)
    throw new AccessError(401, "A current signed-in session is required");
  return token;
}
// Provider bodies are never forwarded as errors. All public messages are ours.
const safe =
  (handler: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      if (error instanceof ProviderError) {
        res
          .status(error.status === 429 ? 429 : [400, 401, 403].includes(error.status) ? 409 : 502)
          .json({ error: error.message });
        return;
      }
      next(error);
    }
  };
export function createPlanningCenterRouter(auth: AuthProvider = sessionAuthProvider): IRouter {
  const r = Router();
  const base = "/v1/admin/planning-center";
  r.use(base, requirePermission("system:manage", auth), requireCsrf);
  r.get(
    base,
    safe(async (_req, res) => {
      res.json(GetPlanningCenterResponse.parse(await pco.workspace(res.locals.principal)));
    }),
  );
  r.post(
    `${base}/schedule`,
    safe(async (req, res) => {
      const b = SetPlanningCenterScheduleBody.strict().safeParse(req.body);
      if (!b.success) {
        res.status(400).json({ error: "Invalid schedule request" });
        return;
      }
      res.json(
        SetPlanningCenterScheduleResponse.parse(await setSchedule(res.locals.principal, b.data)),
      );
    }),
  );
  r.post(
    `${base}/authorize`,
    safe(async (req, res) => {
      const input =
        req.body == null ? undefined : AuthorizePlanningCenterBody.strict().safeParse(req.body);
      if (input && !input.success) {
        res.status(400).json({ error: "Invalid authorization request" });
        return;
      }
      res.json(
        AuthorizePlanningCenterResponse.parse(
          await pco.authorize(
            res.locals.principal,
            sessionToken(req),
            input?.success ? input.data : undefined,
          ),
        ),
      );
    }),
  );
  r.get(
    `${base}/callback`,
    safe(async (req, res) => {
      const state = req.query.state;
      const code = req.query.code;
      if (
        typeof state !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(state) ||
        (code !== undefined && (typeof code !== "string" || code.length > 2000 || !code))
      ) {
        res.status(400).json({ error: "Invalid authorization callback" });
        return;
      }
      await pco.complete(
        res.locals.principal,
        sessionToken(req),
        state,
        typeof code === "string" ? code : null,
      );
      // Fixed same-origin path; no caller-provided return URL.
      res.redirect(303, "/administration/integrations");
    }),
  );
  r.post(
    `${base}/confirm`,
    safe(async (req, res) => {
      const b = ConfirmPlanningCenterBody.strict().safeParse(req.body);
      if (!b.success) {
        res.status(400).json({ error: "Invalid organization confirmation" });
        return;
      }
      await pco.confirm(res.locals.principal, b.data.accountRef);
      res.sendStatus(204);
    }),
  );
  r.post(
    `${base}/disconnect`,
    safe(async (_req, res) => {
      await pco.disconnect(res.locals.principal);
      res.sendStatus(204);
    }),
  );
  r.post(
    `${base}/syncs`,
    safe(async (req, res) => {
      const b = StartPlanningCenterSyncBody.strict().safeParse(req.body);
      if (!b.success) {
        res.status(400).json({ error: "Invalid sync request" });
        return;
      }
      res
        .status(201)
        .json(
          StartPlanningCenterSyncResponse.parse(
            await pco.startSync(res.locals.principal, b.data.product, b.data.mode, b.data.since),
          ),
        );
    }),
  );
  r.post(
    `${base}/syncs/:id/advance`,
    safe(async (req, res) => {
      const q = AdvancePlanningCenterSyncParams.safeParse(req.params);
      if (!q.success) {
        res.status(400).json({ error: "Invalid sync identifier" });
        return;
      }
      res.json(
        AdvancePlanningCenterSyncResponse.parse(
          await pco.advanceSync(res.locals.principal, q.data.id),
        ),
      );
    }),
  );
  r.post(
    `${base}/syncs/:id/automation`,
    safe(async (req, res) => {
      const q = SetPlanningCenterAutomationParams.safeParse(req.params);
      const b = SetPlanningCenterAutomationBody.strict().safeParse(req.body);
      if (!q.success || !b.success) {
        res.status(400).json({ error: "Invalid automatic processing request" });
        return;
      }
      res.json(
        SetPlanningCenterAutomationResponse.parse(
          await pco.setAutomation(res.locals.principal, q.data.id, b.data.enabled),
        ),
      );
    }),
  );
  r.post(
    `${base}/syncs/:id/cancel`,
    safe(async (req, res) => {
      const q = CancelPlanningCenterSyncParams.safeParse(req.params);
      if (!q.success) {
        res.status(400).json({ error: "Invalid sync identifier" });
        return;
      }
      await pco.cancelSync(res.locals.principal, q.data.id);
      res.sendStatus(204);
    }),
  );
  return r;
}
export default createPlanningCenterRouter();
