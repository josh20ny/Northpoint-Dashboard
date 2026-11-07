import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { projectRoot } from "./lib/documents";
import path from "node:path";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
// Same-origin API; no permissive cross-origin credential access.
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});
// Optional single-origin gateway for ordinary Git/local hosting. Replit uses
// the managed web/API services instead. No migrations run on startup.
if (process.env.SERVE_WEB === "true") {
  const webRoot = path.join(projectRoot(), "artifacts/northpoint-dashboard/dist/public");
  app.use(express.static(webRoot, { index: false }));
  app.get("/{*page}", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(webRoot, "index.html"));
  });
}
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use(
  (error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = (error as { status?: number }).status;
    if (status === 400 || status === 413) {
      res.status(status).json({ error: status === 413 ? "Request too large" : "Invalid request" });
      return;
    }
    req.log.error({ event: "request_failed" }, "Request failed");
    res.status(500).json({ error: "Internal server error" });
  },
);

export default app;
