import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const SESSION_COOKIE = "__Secure-np-session";
export const FLOW_COOKIE = "__Secure-np-flow";
export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/api",
};
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("hex");
export function equalToken(a: unknown, b: unknown) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function configuredOrigin() {
  const origin = process.env.AUTH_ORIGIN;
  if (!origin) throw new Error("AUTH_ORIGIN is required for authentication");
  return new URL(origin).origin;
}
export const requireCsrf: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  if (
    req.get("origin") !== process.env.AUTH_ORIGIN ||
    !equalToken(req.get("x-csrf-token"), res.locals.session?.csrfToken)
  ) {
    res.status(403).json({ error: "Request verification failed" });
    return;
  }
  next();
};
