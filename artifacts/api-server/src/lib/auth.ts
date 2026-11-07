import type { Request, RequestHandler } from "express";

export type Role = "staff" | "leadership" | "admin";
export type Permission = "attendance:aggregate" | "giving:individual" | "system:manage";

// Identity may only originate from a verified server-side provider session.
// There is deliberately no header, query, cookie, or development-role shortcut.
export interface VerifiedIdentity {
  subject: string;
  provider: "replit" | "google-workspace";
  verifiedEmail: string;
}

export interface Principal {
  identity: VerifiedIdentity;
  role: Role;
  userId?: string;
}

export interface AuthProvider {
  readonly name: string;
  readonly enabled: boolean;
  authenticate(request: Request): Promise<Principal | null>;
}

export const disabledAuthProvider: AuthProvider = {
  name: "disabled",
  enabled: false,
  async authenticate() {
    return null;
  },
};

const requestPrincipals = new WeakMap<Request, Principal>();
export function attachPrincipal(request: Request, principal: Principal) {
  requestPrincipals.set(request, principal);
}
export const sessionAuthProvider: AuthProvider = {
  name: "session",
  enabled: true,
  async authenticate(request) {
    return requestPrincipals.get(request) ?? null;
  },
};

export function hasPermission(principal: Principal | null, permission: Permission): boolean {
  if (!principal) return false;
  if (!["staff", "leadership", "admin"].includes(principal.role)) return false;
  if (permission === "attendance:aggregate") return true;
  if (permission === "giving:individual" || permission === "system:manage") {
    return principal.role === "admin";
  }
  return false;
}

export function requirePermission(
  permission: Permission,
  provider: AuthProvider = sessionAuthProvider,
): RequestHandler {
  return async (req, res, next) => {
    const principal = await provider.authenticate(req);
    res.setHeader("Cache-Control", "no-store");
    if (!principal) {
      res.status(401).json({
        error: "Sign-in required",
      });
      return;
    }
    if (!hasPermission(principal, permission)) {
      if (principal.userId) {
        const { recordAudit } = await import("./audit");
        await recordAudit(principal.userId, "access.denied", permission, null, "denied");
      }
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.locals.principal = principal;
    next();
  };
}
