import { Router, type IRouter } from "express";
import * as oidc from "openid-client";
import { rateLimit } from "express-rate-limit";
import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import {
  configuredOrigin,
  SESSION_COOKIE,
  FLOW_COOKIE,
  cookieOptions,
  randomToken,
  hashToken,
  requireCsrf,
} from "../lib/security";
import { sessionAuthProvider } from "../lib/auth";

const router: IRouter = Router();
// Conservative process-wide cap, deliberately independent of spoofable proxy IP
// headers. No IP addresses or identifiers are retained by this limiter.
const loginLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  keyGenerator: () => "oidc-login",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again later." },
});
let configuration: Promise<oidc.Configuration> | undefined;
function config() {
  // Test harness can supply an issuer in development; never request-controlled,
  // never permitted in production. Full OIDC signature validation still applies.
  const issuer =
    process.env.NODE_ENV !== "production" && process.env.ISSUER_URL
      ? process.env.ISSUER_URL
      : "https://replit.com/oidc";
  configuration ??= oidc.discovery(new URL(issuer), process.env.REPL_ID!);
  return configuration;
}
router.use(["/auth", "/login", "/callback", "/logout"], (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.get("/auth/user", async (req, res) => {
  const principal = await sessionAuthProvider.authenticate(req);
  const s = res.locals.session;
  res.json(
    GetCurrentAuthUserResponse.parse({
      enabled: process.env.AUTH_PROVIDER === "replit",
      user: principal
        ? { id: principal.userId, email: principal.identity.verifiedEmail, role: principal.role }
        : null,
      csrfToken: s?.csrfToken ?? null,
      expiresAt: s?.expiresAt?.toISOString() ?? null,
    }),
  );
});
router.get("/login", loginLimit, async (_req, res): Promise<void> => {
  if (process.env.AUTH_PROVIDER !== "replit") {
    res.status(503).json({ error: "Sign-in is not configured" });
    return;
  }
  const { pool } = await import("@workspace/db");
  const cfg = await config();
  const state = oidc.randomState(),
    nonce = oidc.randomNonce(),
    verifier = oidc.randomPKCECodeVerifier();
  const token = randomToken();
  await pool.query("DELETE FROM auth_flows WHERE expires_at <= now()");
  await pool.query(
    "INSERT INTO auth_flows(token_hash,state,nonce,verifier,expires_at) VALUES ($1,$2,$3,$4,$5)",
    [hashToken(token), state, nonce, verifier, new Date(Date.now() + 10 * 60 * 1000)],
  );
  res.cookie(FLOW_COOKIE, token, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
  res.redirect(
    oidc.buildAuthorizationUrl(cfg, {
      redirect_uri: `${configuredOrigin()}/api/callback`,
      scope: "openid email profile",
      code_challenge_method: "S256",
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      state,
      nonce,
    }).href,
  );
});
router.get("/callback", async (req, res): Promise<void> => {
  if (process.env.AUTH_PROVIDER !== "replit") {
    res.status(503).json({ error: "Sign-in is not configured" });
    return;
  }
  const { pool } = await import("@workspace/db");
  const token: unknown = req.cookies?.[FLOW_COOKIE];
  res.clearCookie(FLOW_COOKIE, cookieOptions);
  const fail = () => res.redirect("/?auth=denied");
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    fail();
    return;
  }
  // DELETE RETURNING guarantees single use even for concurrent callback replay.
  const flow = await pool.query<{ state: string; nonce: string; verifier: string }>(
    "DELETE FROM auth_flows WHERE token_hash=$1 AND expires_at>now() RETURNING state,nonce,verifier",
    [hashToken(token)],
  );
  if (!flow.rows[0]) {
    fail();
    return;
  }
  const { verifiedOidcIdentity, admitIdentity, createSession, revokeSession } =
    await import("../lib/session-store");
  let identity;
  let exp: number;
  try {
    const url = new URL(`${configuredOrigin()}/api/callback`);
    url.search = new URL(req.originalUrl, configuredOrigin()).search;
    const tokens = await oidc.authorizationCodeGrant(await config(), url, {
      pkceCodeVerifier: flow.rows[0].verifier,
      expectedState: flow.rows[0].state,
      expectedNonce: flow.rows[0].nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    identity = claims ? verifiedOidcIdentity(claims) : null;
    exp = typeof claims?.exp === "number" ? claims.exp : 0;
    if (!identity || exp * 1000 <= Date.now()) {
      fail();
      return;
    }
  } catch {
    // No upstream error contents, callback codes or claims in logs/URLs.
    fail();
    return;
  }
  const user = await admitIdentity(identity);
  if (!user) {
    fail();
    return;
  }
  const old: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof old === "string") await revokeSession(old);
  const session = await createSession(user.id, exp);
  res.cookie(SESSION_COOKIE, session.token, { ...cookieOptions, expires: session.expiresAt });
  res.redirect("/");
});
router.post("/logout", requireCsrf, async (req, res): Promise<void> => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") {
    const { revokeSession } = await import("../lib/session-store");
    await revokeSession(token);
    const p = await sessionAuthProvider.authenticate(req);
    if (p?.userId) {
      const { recordAudit } = await import("../lib/audit");
      await recordAudit(p.userId, "logout", "session", null);
    }
  }
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.status(204).end();
});
export default router;
