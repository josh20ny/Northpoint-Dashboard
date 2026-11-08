import { PCO_ORIGIN, ProviderError, type Product, digest } from "./planning-center-client";

// Read-only, deliberately minimal fields. No health, contact, financial, security,
// background-check or person-name fields are fetched or retained.
export const fields: Record<string, string[]> = {
  Person: ["created_at", "updated_at", "status", "inactivated_at"],
  ServiceType: ["name", "created_at", "updated_at", "archived_at", "deleted_at"],
  Plan: ["title", "created_at", "updated_at", "sort_date"],
  PlanTime: ["starts_at", "ends_at", "time_type", "created_at", "updated_at"],
  CheckIn: ["kind", "one_time_guest", "created_at", "updated_at", "checked_out_at", "confirmed_at"],
  Event: ["name", "created_at", "updated_at", "archived_at"],
  EventPeriod: ["starts_at", "ends_at", "created_at", "updated_at"],
  EventTime: ["starts_at", "ends_at", "updated_at"],
  Location: ["name", "kind", "updated_at"],
};
export interface Page {
  path: string;
  type: string;
}
const allowedPaths: Record<Product, RegExp> = {
  people: /^\/people\/v2\/people$/,
  services: /^\/services\/v2\/service_types(?:\/[0-9]+\/plans(?:\/[0-9]+\/plan_times)?)?$/,
  check_ins: /^\/check-ins\/v2\/(?:events|check_ins)$/,
};
export function pagePath(page: Page, product: Product) {
  const u = new URL(page.path, PCO_ORIGIN);
  if (
    u.origin !== PCO_ORIGIN ||
    u.username ||
    u.password ||
    u.hash ||
    !allowedPaths[product].test(u.pathname) ||
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
  for (const [type, attrs] of Object.entries(fields)) query.set(`fields[${type}]`, attrs.join(","));
  if (page.type === "CheckIn") query.set("include", "event_period,event_times,locations");
  return `${u.pathname}?${query}`;
}
export function roots(product: Product): Page[] {
  if (product === "people") return [{ path: "/people/v2/people", type: "Person" }];
  if (product === "services") return [{ path: "/services/v2/service_types", type: "ServiceType" }];
  return [
    { path: "/check-ins/v2/events", type: "Event" },
    { path: "/check-ins/v2/check_ins", type: "CheckIn" },
  ];
}
type Relation = { type: string; id: string };
export interface SourceEntity {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships: Record<string, { data: Relation | Relation[] | null }>;
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
    if (x !== null && typeof x !== "string" && typeof x !== "boolean") throw new ProviderError(422);
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
  for (const key of [
    "person",
    "event",
    "event_period",
    "event_times",
    "locations",
    "service_type",
    "plan",
  ]) {
    if (!all || !Object.hasOwn(all, key)) continue;
    const data = all[key]?.data;
    const valid = (r: unknown): r is Relation =>
      !!r &&
      typeof r === "object" &&
      typeof (r as Relation).type === "string" &&
      /^[A-Za-z]{1,40}$/.test((r as Relation).type) &&
      idValid((r as Relation).id);
    if (data === null) relationships[key] = { data: null };
    else if (Array.isArray(data) && data.length <= 1000 && data.every(valid))
      relationships[key] = { data: data.map((r) => ({ type: r.type, id: r.id })) };
    else if (valid(data)) relationships[key] = { data: { type: data.type, id: data.id } };
    else throw new ProviderError(422);
  }
  return { type: v.type, id: v.id, attributes, relationships };
}
export function parsePage(value: Record<string, unknown>, page: Page, product: Product) {
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
    nextPages.push({ type: page.type, path: pagePath({ type: page.type, path: next }, product) });
  }
  for (const e of main) {
    if (e.type === "ServiceType")
      nextPages.push({ path: `/services/v2/service_types/${e.id}/plans`, type: "Plan" });
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
