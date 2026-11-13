import { Router, type IRouter } from "express";
import {
  GetMinistryDataParams,
  GetMinistryDataQueryParams,
  GetMinistryDataResponse,
  GetMinistryDataAdminResponse,
  GetCheckInReviewQueryParams,
  GetCheckInReviewResponse,
  ResolveCheckInParams,
  ResolveCheckInBody,
  ResolveCheckInResponse,
  CreateMinistrySourceMappingBody,
  PublishMinistryDataBody,
  PublishMinistryDataResponse,
  ImportMinistryHistoryBody,
  ImportMinistryHistoryResponse,
  GetGivingTransactionsQueryParams,
  GetGivingTransactionsResponse,
  GetGivingPolicyResponse,
  SaveGivingPolicyBody,
  SaveGivingPolicyResponse,
  GetGivingHealthQueryParams,
  GetGivingHealthResponse,
} from "@workspace/api-zod";
import { requirePermission, sessionAuthProvider, type AuthProvider } from "../lib/auth";
import { requireCsrf } from "../lib/security";
import * as data from "../lib/ministry-data";
import { readGivingPolicy, saveGivingPolicy, givingHealth } from "../lib/giving-policy";

export function createMinistryDataRouter(auth: AuthProvider = sessionAuthProvider): IRouter {
  const r = Router();
  r.get(
    "/v1/ministry-data/:ministry",
    requirePermission("attendance:aggregate", auth),
    async (req, res) => {
      const path = GetMinistryDataParams.safeParse(req.params),
        query = GetMinistryDataQueryParams.strict().safeParse(req.query);
      if (!path.success || !query.success) {
        res.status(400).json({ error: "Invalid ministry range" });
        return;
      }
      res.json(
        GetMinistryDataResponse.parse(
          await data.readMinistryData(
            res.locals.principal,
            path.data.ministry,
            query.data.start,
            query.data.end,
          ),
        ),
      );
    },
  );
  const base = "/v1/admin/ministry-data";
  r.use(base, requirePermission("system:manage", auth), requireCsrf);
  r.get(base, async (_req, res) =>
    res.json(
      GetMinistryDataAdminResponse.parse(await data.ministryDataAdmin(res.locals.principal)),
    ),
  );
  r.get(`${base}/check-ins`, async (req, res): Promise<void> => {
    const input = GetCheckInReviewQueryParams.strict().safeParse(req.query);
    if (!input.success) {
      res.status(400).json({ error: "Invalid Check-In review page" });
      return;
    }
    res.json(
      GetCheckInReviewResponse.parse(
        await data.getCheckInReview(res.locals.principal, input.data.page),
      ),
    );
  });
  r.post(`${base}/check-ins/:checkInId/resolution`, async (req, res): Promise<void> => {
    const params = ResolveCheckInParams.safeParse(req.params);
    const input = ResolveCheckInBody.strict().safeParse(req.body);
    if (!params.success || !input.success) {
      res.status(400).json({ error: "Invalid Check-In resolution" });
      return;
    }
    res.status(201).json(
      ResolveCheckInResponse.parse(
        await data.resolveCheckIn(
          res.locals.principal,
          params.data.checkInId,
          input.data.action,
        ),
      ),
    );
  });
  r.post(`${base}/mappings`, async (req, res) => {
    const input = CreateMinistrySourceMappingBody.strict().safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: "Invalid ministry mapping" });
      return;
    }
    await data.createMinistryMapping(res.locals.principal, input.data);
    res.sendStatus(201);
  });
  r.post(`${base}/publish`, async (req, res) => {
    const input = PublishMinistryDataBody.strict().safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: "Invalid publication request" });
      return;
    }
    res.json(
      PublishMinistryDataResponse.parse(
        await data.publishMinistryData(res.locals.principal, input.data),
      ),
    );
  });
  r.post(`${base}/history`, async (req, res) => {
    const input = ImportMinistryHistoryBody.strict().safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: "Invalid historical mapping request" });
      return;
    }
    res.json(
      ImportMinistryHistoryResponse.parse(
        await data.importMinistryHistory(res.locals.principal, input.data),
      ),
    );
  });
  r.get(`${base}/giving-transactions`, async (req, res) => {
    const input = GetGivingTransactionsQueryParams.strict().safeParse(req.query);
    if (!input.success) {
      res.status(400).json({ error: "Invalid page" });
      return;
    }
    res.json(
      GetGivingTransactionsResponse.parse(
        await data.givingTransactions(res.locals.principal, input.data.page ?? 1),
      ),
    );
  });
  r.get(`${base}/giving-policy`, async (_req, res) => {
    res.json(GetGivingPolicyResponse.parse(await readGivingPolicy(res.locals.principal)));
  });
  r.post(`${base}/giving-policy`, async (req, res) => {
    const input = SaveGivingPolicyBody.strict().safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: "Invalid Giving formula" });
      return;
    }
    res
      .status(201)
      .json(
        SaveGivingPolicyResponse.parse(await saveGivingPolicy(res.locals.principal, input.data)),
      );
  });
  r.get(`${base}/giving-health`, async (req, res) => {
    const input = GetGivingHealthQueryParams.strict().safeParse(req.query);
    if (!input.success) {
      res.status(400).json({ error: "Invalid page" });
      return;
    }
    res.json(
      GetGivingHealthResponse.parse(await givingHealth(res.locals.principal, input.data.page ?? 1)),
    );
  });
  return r;
}
export default createMinistryDataRouter();
