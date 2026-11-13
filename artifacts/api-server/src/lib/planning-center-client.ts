import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AccessError } from "./administration";
import { planningCenterRateLimit } from "./planning-center-rate-limit";

export const PCO_ORIGIN = "https://api.planningcenteronline.com";
export const PCO_SCOPES = ["people", "services", "check_ins"] as const;
export const PCO_PRODUCTS = [...PCO_SCOPES, "giving", "groups", "serving"] as const;
export type Product = (typeof PCO_PRODUCTS)[number];
export const productScope = (product: Product) => (product === "serving" ? "services" : product);
export const allowedScopes = [...PCO_SCOPES, "giving", "groups"] as const;
export const callbackPath = "/api/v1/admin/planning-center/callback";
export function configuration() {
  const missing = [
    "PCO_CLIENT_ID",
    "PCO_CLIENT_SECRET",
    "PCO_TOKEN_ENCRYPTION_KEY",
    "AUTH_ORIGIN",
  ].filter((k) => !process.env[k]);
  if (
    process.env.PCO_TOKEN_ENCRYPTION_KEY &&
    !/^[a-f0-9]{64}$/i.test(process.env.PCO_TOKEN_ENCRYPTION_KEY)
  )
    missing.push("PCO_TOKEN_ENCRYPTION_KEY must be 64 hexadecimal characters");
  let callbackUrl: string | null = null;
  try {
    const origin = new URL(process.env.AUTH_ORIGIN ?? "");
    if (origin.protocol !== "https:" || origin.origin !== process.env.AUTH_ORIGIN)
      throw new Error();
    callbackUrl = `${origin.origin}${callbackPath}`;
  } catch {
    if (!missing.includes("AUTH_ORIGIN")) missing.push("AUTH_ORIGIN must be an HTTPS origin");
  }
  return { configured: missing.length === 0, missingConfiguration: missing, callbackUrl };
}
export function requireConfiguration() {
  const c = configuration();
  if (!c.configured) throw new AccessError(503, "Planning Center configuration is incomplete");
  return c;
}
export const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export function encrypt(value: unknown, purpose: string) {
  requireConfiguration();
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.PCO_TOKEN_ENCRYPTION_KEY!, "hex"),
    iv,
  );
  cipher.setAAD(Buffer.from(`northpoint:pco:v1:${purpose}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decrypt<T>(value: string, purpose: string): T {
  requireConfiguration();
  try {
    const [v, iv, tag, ciphertext] = value.split(".");
    if (v !== "v1" || !iv || !tag || !ciphertext) throw new Error();
    const cipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(process.env.PCO_TOKEN_ENCRYPTION_KEY!, "hex"),
      Buffer.from(iv, "base64url"),
    );
    cipher.setAAD(Buffer.from(`northpoint:pco:v1:${purpose}`));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(
      Buffer.concat([cipher.update(Buffer.from(ciphertext, "base64url")), cipher.final()]).toString(
        "utf8",
      ),
    ) as T;
  } catch {
    throw new AccessError(
      503,
      "Stored Planning Center credentials cannot be decrypted; restore the encryption key",
    );
  }
}
export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
}
export class ProviderError extends Error {
  constructor(
    public status: number,
    public retrySeconds = 30,
  ) {
    super(
      status === 401
        ? "Planning Center authorization expired; reconnect required"
        : status === 403
          ? "Planning Center permissions do not allow this request"
          : status === 429
            ? "Planning Center rate limit reached; retry after the displayed time"
            : status === 422
              ? "Planning Center returned an unsupported source shape"
              : status === 404
                ? "Planning Center could not find the requested source resource (HTTP 404)"
                : status >= 400 && status < 500
                  ? `Planning Center rejected the source request (HTTP ${status})`
                  : "Planning Center is temporarily unavailable",
    );
  }
}
export function retrySeconds(header: string | null, now = Date.now()) {
  if (!header) return 30;
  const seconds = /^\d+$/.test(header) ? Number(header) : (Date.parse(header) - now) / 1000;
  return Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 30;
}
// No redirects: bearer credentials must never follow a provider-controlled URL.
export async function providerRequest(path: string, init: RequestInit = {}, maxBytes = 2_000_000) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new ProviderError(422);
  let response: Response;
  try {
    response = await fetch(`${PCO_ORIGIN}${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: "application/json",
        "User-Agent": `NorthpointDashboard/3.0 (${process.env.AUTH_ORIGIN ?? "https://npaustin.com"})`,
        ...init.headers,
      },
    });
  } catch {
    throw new ProviderError(503);
  }
  if (
    path.startsWith("/people/") ||
    path.startsWith("/services/") ||
    path.startsWith("/check-ins/") ||
    path.startsWith("/groups/") ||
    path.startsWith("/giving/")
  )
    planningCenterRateLimit.observe(
      response.headers,
      response.status,
      retrySeconds(response.headers.get("retry-after")),
    );
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(response.status, retrySeconds(response.headers.get("retry-after")));
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError(422);
  const buffers: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    bytes += r.value.length;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new ProviderError(422);
    }
    buffers.push(r.value);
  }
  try {
    return JSON.parse(Buffer.concat(buffers).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new ProviderError(422);
  }
}
export async function exchangeToken(
  params: Record<string, string>,
  previous?: Tokens,
  requestedScopes: readonly string[] = previous?.scopes ?? PCO_SCOPES,
): Promise<Tokens> {
  requireConfiguration();
  const data = await providerRequest(
    "/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...params,
        client_id: process.env.PCO_CLIENT_ID!,
        client_secret: process.env.PCO_CLIENT_SECRET!,
      }),
    },
    128_000,
  );
  const scopes =
    typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : previous?.scopes;
  if (
    typeof data.access_token !== "string" ||
    !data.access_token ||
    typeof data.refresh_token !== "string" ||
    !data.refresh_token ||
    typeof data.expires_in !== "number" ||
    data.expires_in <= 0 ||
    data.expires_in > 86400 ||
    (data.token_type === undefined
      ? !previous
      : typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer") ||
    !scopes ||
    !PCO_SCOPES.every((s) => scopes.includes(s)) ||
    scopes.some((s) => !allowedScopes.some((allowed) => allowed === s)) ||
    requestedScopes.some((s) => !scopes.includes(s)) ||
    scopes.some((s) => !requestedScopes.includes(s))
  )
    throw new ProviderError(422);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes,
  };
}
export async function revokeTokens(tokens: Tokens) {
  await providerRequest(
    "/oauth/revoke",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: tokens.refreshToken,
        token_type_hint: "refresh_token",
        client_id: process.env.PCO_CLIENT_ID!,
        client_secret: process.env.PCO_CLIENT_SECRET!,
      }),
    },
    128_000,
  );
}
export const versions: Record<Product, string> = {
  people: "2025-11-10",
  services: "2018-11-01",
  check_ins: "2025-05-28",
  giving: "2019-10-18",
  groups: "2023-07-10",
  serving: "2018-11-01",
};
export async function apiGet(path: string, token: string, product: Product) {
  await planningCenterRateLimit.wait();
  return providerRequest(path, {
    headers: { Authorization: `Bearer ${token}`, "X-PCO-API-Version": versions[product] },
  });
}
