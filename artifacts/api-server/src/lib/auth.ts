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

export function hasPermission(principal: Principal | null, permission: Permission): boolean {
  if (!principal) return false;
  if (!["staff", "leadership", "admin"].includes(principal.role)) return false;
  if (permission === "attendance:aggregate") return true;
  return principal.role === "admin";
}

export function requirePermission(
  permission: Permission,
  provider: AuthProvider = disabledAuthProvider,
): RequestHandler {
  return async (req, res, next) => {
    const principal = await provider.authenticate(req);
    res.setHeader("Cache-Control", "no-store");
    if (!principal) {
      res.status(401).json({
        error: "Authentication unavailable or required. Phase 0 does not expose church records.",
      });
      return;
    }
    if (!hasPermission(principal, permission)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
