import { PCO_ORIGIN, ProviderError, type Product, digest } from "./planning-center-client";
import {
  isMinistryProduct,
  ministryPagePath,
  ministryRoots,
  parseMinistryPage,
} from "./ministry-source";

// Read-only, deliberately minimal fields. No health, contact, financial, security,
// birthdate or background-check fields are fetched or retained.
export const fields: Record<string, string[]> = {
  Person: ["created_at", "updated_at", "status", "inactivated_at", "grade"],
  Grade: ["key", "value"],
  ServiceType: ["name", "created_at", "updated_at", "archived_at", "deleted_at"],
  Plan: ["title", "created_at", "updated_at", "sort_date"],
  PlanTime: ["starts_at", "ends_at", "time_type", "created_at", "updated_at"],
  CheckIn: [
    "kind",
    "one_time_guest",
    "first_name",
    "last_name",
    "created_at",
    "updated_at",
    "checked_out_at",
    "confirmed_at",
  ],
  Event: ["name", "created_at", "updated_at", "archived_at"],
  EventPeriod: ["starts_at", "ends_at", "created_at", "updated_at"],
  EventTime: ["starts_at", "ends_at", "updated_at"],
  Location: ["name", "kind", "updated_at"],
};
// JSON:API sparse fieldsets select relationships as well as attributes.
// Keep these separate from attributes so identifiers never become person data.
// Only request documented linkage; do not include Person resources or merge IDs
// across Planning Center products. Services PlanTime parents remain explicit in
// sourceCollection: that resource does not expose a documented plan relationship.
const relationshipFields: Record<string, Record<string, { type: string; many?: boolean }>> = {
  Plan: { service_type: { type: "ServiceType" } },
  CheckIn: {
    person: { type: "Person" },
    event_period: { type: "EventPeriod" },
    event_times: { type: "EventTime", many: true },
    locations: { type: "Location", many: true },
  },
  EventPeriod: { event: { type: "Event" } },
  EventTime: { event: { type: "Event" }, event_period: { type: "EventPeriod" } },
};
export interface Page {
  path: string;
  type: string;
  since?: string;
  until?: string;
  windowField?: "received_at" | "updated_at";
}
export function validDateWindow(since: string, until: string, maxDays = 31): boolean {
  const start = Date.parse(`${since}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(since) &&
    /^\d{4}-\d{2}-\d{2}$/.test(until) &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    new Date(start).toISOString().slice(0, 10) === since &&
    new Date(end).toISOString().slice(0, 10) === until &&
    end >= start &&
    end - start < maxDays * 24 * 60 * 60 * 1000
  );
}
export const PCO_INCREMENTAL_OVERLAP_DAYS = 3;
export function incrementalSinceDate(
  completedAt: Date | string | null | undefined,
  overlapDays = PCO_INCREMENTAL_OVERLAP_DAYS,
): string | null {
  const timestamp = completedAt instanceof Date ? completedAt.getTime() : Date.parse(completedAt ?? "");
  if (!Number.isFinite(timestamp) || !Number.isInteger(overlapDays) || overlapDays < 0)
    return null;
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() - overlapDays);
  return date.toISOString().slice(0, 10);
}
const allowedPaths: Record<string, RegExp> = {
  people: /^\/people\/v2(?:\/people)?$/,
  services: /^\/services\/v2\/service_types(?:\/[0-9]+\/plans(?:\/[0-9]+\/plan_times)?)?$/,
  check_ins: /^\/check-ins\/v2\/(?:events|check_ins)$/,
};
export function pagePath(page: Page, product: Product) {
  if (isMinistryProduct(product)) return ministryPagePath(page, product);
  const u = new URL(page.path, PCO_ORIGIN);
  const pathAllowed =
    product === "people"
      ? (page.type === "Person" && u.pathname === "/people/v2/people") ||
        (page.type === "Grade" && u.pathname === "/people/v2")
      : allowedPaths[product].test(u.pathname);
  if (
    u.origin !== PCO_ORIGIN ||
    u.username ||
    u.password ||
    u.hash ||
    !pathAllowed ||
    !fields[page.type]
  )
    throw new ProviderError(422);
  const offset = u.searchParams.get("offset");
  if (offset !== null && (!/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset))))
    throw new ProviderError(422);
  // Ignore arbitrary query parameters in provider pagination links, reapply our
  // sparse-field contract and fixed includes. The browser never supplies URLs.
  const query = new URLSearchParams({ per_page: "100" });
  if (offset !== null) query.set("offset", offset);
  const includedTypes = new Set(
    Object.values(relationshipFields[page.type] ?? {}).map((relationship) => relationship.type),
  );
  for (const [type, attrs] of Object.entries(fields)) {
    if (type !== page.type && !includedTypes.has(type)) continue;
    const requested =
      page.type === "CheckIn" && type === "Person"
        ? ["grade"]
        : page.type === "Person" && product === "people"
          ? attrs.filter((attribute) => attribute !== "grade")
          : attrs;
    query.set(
      `fields[${type}]`,
      [...requested, ...Object.keys(relationshipFields[type] ?? {})].join(","),
    );
  }
  if (page.type === "CheckIn")
    query.set("include", "event_period,event_times,locations,person");
  if (page.since) {
    if (page.type === "CheckIn") {
      const dateField = page.windowField === "updated_at" ? "updated_at" : "created_at";
      query.set(`where[${dateField}][gte]`, page.until ? page.since : `${page.since}T00:00:00Z`);
      if (page.until) query.set(`where[${dateField}][lte]`, page.until);
    }
    if (product === "people" && page.type === "Person" && page.windowField === "updated_at")
      query.set("where[updated_at][gte]", `${page.since}T00:00:00Z`);
    if (product === "services" && page.type === "Plan" && page.windowField === "updated_at")
      query.set("where[updated_at][gte]", `${page.since}T00:00:00Z`);
  }
  return `${u.pathname}?${query}`;
}
export function roots(product: Product): Page[] {
  if (isMinistryProduct(product)) return ministryRoots(product);
  if (product === "people")
    return [
      { path: "/people/v2/people", type: "Person" },
      { path: "/people/v2", type: "Grade" },
    ];
  if (product === "services") return [{ path: "/services/v2/service_types", type: "ServiceType" }];
  return [
    { path: "/check-ins/v2/events", type: "Event" },
    { path: "/check-ins/v2/check_ins", type: "CheckIn" },
  ];
}
export function scanRoots(
  product: Product,
  since?: string | null,
  mode: "current" | "incremental" = "current",
  until?: string | null,
): Page[] {
  // The Groups API has no reliable updated_at filters for membership changes or
  // attendance revisions. Keep its complete, idempotent reconciliation path.
  if (mode === "incremental" && product === "groups") return roots(product);
  const incrementalField: Page["windowField"] =
    mode === "incremental" && ["people", "services", "serving"].includes(product)
      ? "updated_at"
      : undefined;
  const pages = roots(product).map((p) =>
    since && (product !== "people" || p.type === "Person")
      ? {
          ...p,
          since,
          ...(until && product === "check_ins" && p.type === "CheckIn" ? { until } : {}),
          ...(incrementalField ? { windowField: incrementalField } : {}),
        }
      : p,
  );
  if (since && (product === "giving" || product === "check_ins")) {
    const original = pages.find((p) => p.type === (product === "giving" ? "Donation" : "CheckIn"))!;
    pages.push({ ...original, ...(until && product === "check_ins" ? { until } : {}), windowField: "updated_at" });
  }
  return pages;
}
type Relation = { type: string; id: string };
export interface SourceEntity {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships: Record<string, { data: Relation | Relation[] | null }>;
}
export interface ParsedPage {
  entities: SourceEntity[];
  nextPages: Page[];
  // Included child resources still need the same parent collection provenance
  // as resources fetched from their individual association endpoints.
  sourceCollections?: Record<string, string>;
}
const idValid = (x: unknown): x is string => typeof x === "string" && /^[0-9]{1,30}$/.test(x);
export function sourceEntity(value: unknown): SourceEntity {
  if (!value || typeof value !== "object") throw new ProviderError(422);
  const v = value as Record<string, unknown>;
  if (
    typeof v.type !== "string" ||
    !fields[v.type] ||
    !idValid(v.id) ||
    !v.attributes ||
    typeof v.attributes !== "object" ||
    Array.isArray(v.attributes)
  )
    throw new ProviderError(422);
  const attrs = v.attributes as Record<string, unknown>;
  const attributes: Record<string, unknown> = {};
  for (const key of fields[v.type]) {
    const x = attrs[key];
    if (x === undefined) continue;
    if (
      x !== null &&
      typeof x !== "string" &&
      typeof x !== "boolean" &&
      !(["grade", "key"].includes(key) && typeof x === "number" && Number.isSafeInteger(x))
    )
      throw new ProviderError(422);
    if (typeof x === "string" && x.length > 1000) throw new ProviderError(422);
    if (
      key.endsWith("_at") &&
      x !== null &&
      (typeof x !== "string" || !/^\d{4}-\d\d-\d\dT/.test(x) || !Number.isFinite(Date.parse(x)))
    )
      throw new ProviderError(422);
    attributes[key] = x;
  }
  const relationships: SourceEntity["relationships"] = {};
  const all = v.relationships as Record<string, { data?: unknown }> | undefined;
  // Preserve source links but do not assert that person IDs across products match.
  for (const [key, contract] of Object.entries(relationshipFields[v.type] ?? {})) {
    // An explicit null person (e.g. a one-time guest) or empty collection is
    // valid. An omitted requested relationship is unknown, not an empty link.
    if (!all || typeof all !== "object" || Array.isArray(all) || !Object.hasOwn(all, key))
      throw new ProviderError(422);
    const data = all[key]?.data;
    const valid = (r: unknown): r is Relation =>
      !!r &&
      typeof r === "object" &&
      (r as Relation).type === contract.type &&
      idValid((r as Relation).id);
    if (!contract.many && data === null) relationships[key] = { data: null };
    else if (contract.many && Array.isArray(data) && data.length <= 1000 && data.every(valid))
      relationships[key] = { data: data.map((r) => ({ type: r.type, id: r.id })) };
    else if (!contract.many && valid(data))
      relationships[key] = { data: { type: data.type, id: data.id } };
    else throw new ProviderError(422);
  }
  return { type: v.type, id: v.id, attributes, relationships };
}
export function parsePage(
  value: Record<string, unknown>,
  page: Page,
  product: Product,
): ParsedPage {
  if (isMinistryProduct(product)) return parseMinistryPage(value, page, product);
  if (!Array.isArray(value.data) || value.data.length > 100) throw new ProviderError(422);
  const main = value.data.map(sourceEntity);
  if (main.some((e) => e.type !== page.type)) throw new ProviderError(422);
  if (value.included !== undefined && !Array.isArray(value.included)) throw new ProviderError(422);
  const included = (value.included ?? []) as unknown[];
  if (included.length > 5000) throw new ProviderError(422);
  const extra = included.map(sourceEntity);
  const allowedTypes =
    product === "people"
      ? ["Person"]
      : product === "services"
        ? ["ServiceType", "Plan", "PlanTime"]
        : ["CheckIn", "Event", "EventPeriod", "EventTime", "Location"];
  if ([...main, ...extra].some((e) => !allowedTypes.includes(e.type))) throw new ProviderError(422);
  const nextPages: Page[] = [];
  const scanWindow = page.since
    ? {
        since: page.since,
        ...(page.until ? { until: page.until } : {}),
        ...(page.windowField ? { windowField: page.windowField } : {}),
      }
    : {};
  const next = (value.links as { next?: unknown } | undefined)?.next;
  if (next !== undefined && next !== null) {
    if (typeof next !== "string") throw new ProviderError(422);
    const current = new URL(pagePath(page, product), PCO_ORIGIN);
    const u = new URL(next, PCO_ORIGIN);
    if (
      u.pathname !== current.pathname ||
      u.origin !== PCO_ORIGIN ||
      u.username ||
      u.password ||
      u.hash ||
      !/^\d+$/.test(u.searchParams.get("offset") ?? "") ||
      Number(u.searchParams.get("offset")) <= Number(current.searchParams.get("offset") ?? 0)
    )
      throw new ProviderError(422);
    nextPages.push({ type: page.type, path: pagePath({ ...page, path: next }, product), ...scanWindow });
  }
  for (const e of main) {
    if (e.type === "ServiceType")
      nextPages.push({
        path: `/services/v2/service_types/${e.id}/plans`,
        type: "Plan",
        ...scanWindow,
      });
    if (e.type === "Plan") {
      const parent = new URL(page.path, PCO_ORIGIN).pathname;
      nextPages.push({ path: `${parent}/${e.id}/plan_times`, type: "PlanTime" });
    }
  }
  return { entities: [...main, ...extra], nextPages };
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const sourceHash = (e: SourceEntity) => digest(canonical(e));
export function normalized(e: SourceEntity, sourceCollection?: string) {
  return {
    schemaVersion: 1,
    sourceType: e.type,
    sourceId: e.id,
    attributes: e.attributes,
    sourceCollection: sourceCollection ?? null,
    sourceRelationships: e.relationships,
    canonicalLink: "unresolved",
    metricPublication: "not_published",
  };
}
