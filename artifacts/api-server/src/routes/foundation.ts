import { Router, type IRouter } from "express";
import {
  GetFoundationResponse,
  ListDocumentsResponse,
  GetDocumentParams,
  GetDocumentResponse,
  GetReadinessResponse,
} from "@workspace/api-zod";
import { foundationStatus } from "../lib/foundation";
import { databaseReadiness } from "../lib/readiness";
import { documentIndex, readDocument } from "../lib/documents";
import { requirePermission } from "../lib/auth";

const router: IRouter = Router();
router.use("/v1", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.get("/v1/foundation", async (_req, res): Promise<void> => {
  res.json(GetFoundationResponse.parse(await foundationStatus()));
});
router.get("/v1/readyz", async (_req, res): Promise<void> => {
  const readiness = GetReadinessResponse.parse(await databaseReadiness());
  res.status(readiness.status === "ready" ? 200 : 503).json(readiness);
});
router.get("/v1/documents", (_req, res) => {
  res.json(ListDocumentsResponse.parse(documentIndex));
});
router.get("/v1/documents/:slug", async (req, res): Promise<void> => {
  const input = GetDocumentParams.safeParse(req.params);
  if (!input.success) {
    res.status(400).json({ error: "Invalid document identifier" });
    return;
  }
  const document = await readDocument(input.data.slug);
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(GetDocumentResponse.parse(document));
});

// Public routes above contain only specifications and non-sensitive readiness.
// All future operational routes below fail closed until verified auth is wired.
router.use("/v1/admin", requirePermission("system:manage"));
router.use("/v1/giving", requirePermission("giving:individual"));
router.use("/v1", requirePermission("attendance:aggregate"));
router.use("/v1", (_req, res) => {
  res.status(501).json({ error: "Not implemented in Phase 0" });
});
export default router;
