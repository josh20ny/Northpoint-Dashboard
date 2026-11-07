import type { Principal, Role } from "../../artifacts/api-server/src/lib/auth";

// Entirely synthetic, never inserted into application users or used as login.
export const syntheticPrincipal = (role: Role): Principal => ({
  role,
  identity: {
    subject: `synthetic-only-${role}`,
    provider: "google-workspace",
    verifiedEmail: `${role}@example.invalid`,
  },
});
