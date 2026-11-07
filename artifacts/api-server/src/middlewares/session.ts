import type { RequestHandler } from "express";
import { attachPrincipal } from "../lib/auth";
import { SESSION_COOKIE } from "../lib/security";

export const sessionMiddleware: RequestHandler = async (req, res, next) => {
  if (process.env.AUTH_PROVIDER !== "replit") {
    next();
    return;
  }
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") {
    const { readSession, principalFromSession } = await import("../lib/session-store");
    const session = await readSession(token);
    if (session) {
      attachPrincipal(req, principalFromSession(session));
      res.locals.session = session;
    }
  }
  next();
};
