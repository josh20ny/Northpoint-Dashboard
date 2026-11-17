import { PCO_ORIGIN, ProviderError } from "./planning-center-client";
import type { Page, ParsedPage, SourceEntity } from "./planning-center-source";
import { shiftDate } from "./attendance-calculation";

const chicagoClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function chicagoMidnight(day: string): string {
  const target = Date.parse(`${day}T00:00:00Z`);
  let candidate = target;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(chicagoClock.formatToParts(new Date(candidate))
      .map(part => [part.type, part.value]));
    const local = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
    const difference = target - local;
    if (!difference) return new Date(candidate).toISOString();
    candidate += difference;
  }
  throw new ProviderError(422);
}

export type MinistryProduct = "giving" | "groups" | "serving";
// Deliberately exclude names, notes, contacts, payment details and demographics.
const attributes: Record<string, string[]> = {
  Donation: [
    "amount_cents",
    "amount_currency",
    "received_at",
    "completed_at",
    "created_at",
    "updated_at",
    "payment_status",
    "refunded",
  ],
  Designation: ["amount_cents", "amount_currency", "fee_cents"],
  Refund: ["amount_cents", "amount_currency", "refunded_at", "created_at", "updated_at"],
  Fund: ["name", "default", "created_at", "updated_at"],
  RecurringDonation: [
    "amount_cents",
    "amount_currency",
    "status",
    "next_occurrence",
    "created_at",
    "updated_at",
  ],
  Person: ["first_donated_at"],
  DonorSummary: ["first_donated"],
  Group: ["name", "memberships_count", "created_at", "archived_at"],
  GroupType: ["name"],
  Membership: ["joined_at", "role"],
  Event: ["name", "starts_at", "ends_at", "canceled", "canceled_at", "visitors_count"],
  Attendance: ["attended", "role"],
  ServiceType: ["name", "created_at", "updated_at", "archived_at"],
  Plan: ["title", "sort_date", "created_at", "updated_at"],
  PlanTime: ["starts_at", "ends_at", "time_type", "created_at", "updated_at"],
  PlanPerson: ["status", "created_at", "updated_at"],
};
const relationships: Record<string, Record<string, string>> = {
  Donation: { person: "Person", recurring_donation: "RecurringDonation" },
  Designation: { fund: "Fund" },
  RecurringDonation: { person: "Person" },
  Group: { group_type: "GroupType" },
  Membership: { group: "Group", person: "Person" },
  Event: { group: "Group", attendance_submitter: "Person" },
  Attendance: { event: "Event", person: "Person" },
  Plan: { service_type: "ServiceType", plan_times: "PlanTime" },
  PlanPerson: {
    person: "Person",
    plan: "Plan",
    team: "Team",
    service_type: "ServiceType",
    service_times: "PlanTime",
  },
};
const paths: Record<MinistryProduct, Record<string, RegExp>> = {
  giving: {
    Donation: /^\/giving\/v2\/donations$/,
    Fund: /^\/giving\/v2\/funds$/,
    RecurringDonation: /^\/giving\/v2\/recurring_donations$/,
    Person: /^\/giving\/v2\/people$/,
    DonorSummary: /^\/giving\/v2\/donor_summaries$/,
    JointGiver: /^\/giving\/v2\/donor_summaries\/[0-9]+\/joint_giver$/,
    Designation: /^\/giving\/v2\/donations\/[0-9]+\/designations$/,
    Refund: /^\/giving\/v2\/donations\/[0-9]+\/refund$/,
  },
  groups: {
    GroupType: /^\/groups\/v2\/group_types$/,
    Group: /^\/groups\/v2\/groups$/,
    Membership: /^\/groups\/v2\/memberships$/,
    Event: /^\/groups\/v2\/events$/,
    Attendance: /^\/groups\/v2\/events\/[0-9]+\/attendances$/,
  },
  serving: {
    ServiceType: /^\/services\/v2\/service_types$/,
    Plan: /^\/services\/v2\/service_types\/[0-9]+\/plans$/,
    PlanTime: /^\/services\/v2\/service_types\/[0-9]+\/plans\/[0-9]+\/plan_times$/,
    PlanPerson: /^\/services\/v2\/service_types\/[0-9]+\/plans\/[0-9]+\/team_members$/,
  },
};
export function isMinistryProduct(product: string): product is MinistryProduct {
  return product === "giving" || product === "groups" || product === "serving";
}
export function ministryRoots(product: MinistryProduct): Page[] {
  if (product === "giving")
    return [
      { type: "Fund", path: "/giving/v2/funds" },
      { type: "Donation", path: "/giving/v2/donations" },
      { type: "RecurringDonation", path: "/giving/v2/recurring_donations" },
      { type: "Person", path: "/giving/v2/people" },
      { type: "DonorSummary", path: "/giving/v2/donor_summaries" },
    ];
  if (product === "groups")
    return [
      { type: "GroupType", path: "/groups/v2/group_types" },
      { type: "Group", path: "/groups/v2/groups" },
      { type: "Membership", path: "/groups/v2/memberships" },
      { type: "Event", path: "/groups/v2/events" },
    ];
  return [{ type: "ServiceType", path: "/services/v2/service_types" }];
}
export function ministryPagePath(page: Page, product: MinistryProduct) {
  const u = new URL(page.path, PCO_ORIGIN);
  if (
    u.origin !== PCO_ORIGIN ||
    u.username ||
    u.password ||
    u.hash ||
    !paths[product][page.type]?.test(u.pathname)
  )
    throw new ProviderError(422);
  const offset = u.searchParams.get("offset");
  if (offset !== null && (!/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset))))
    throw new ProviderError(422);
  const query = new URLSearchParams({ per_page: "100" });
  if (offset !== null) query.set("offset", offset);
  const type = page.type === "JointGiver" ? "DonorSummary" : page.type;
  query.set(
    `fields[${type}]`,
    [...attributes[type], ...Object.keys(relationships[type] ?? {})].join(","),
  );
  if (product === "serving" && page.type === "Plan") {
    query.set("fields[PlanTime]", attributes.PlanTime.join(","));
    query.set("include", "plan_times");
  }
  if (product === "giving" && page.type === "Donation") {
    // Sparse fieldsets filter linkage as well as attributes. Fetch all linked
    // designations with the donation batch instead of one GET per donation.
    query.set(
      "fields[Donation]",
      [...attributes.Donation, ...Object.keys(relationships.Donation), "designations"].join(","),
    );
    query.set(
      "fields[Designation]",
      [...attributes.Designation, ...Object.keys(relationships.Designation)].join(","),
    );
    query.set("include", "designations");
  }
  if (product === "giving" && page.type === "Person") query.set("filter", "has_donated");
  if (page.type === "DonorSummary" || page.type === "JointGiver") {
    query.set("fields[DonorSummary]", "first_donated,joint_giver");
    query.set("fields[Person]", attributes.Person.join(","));
    query.set("include", "joint_giver");
    if (page.type === "DonorSummary") query.set("filter", "has_joint_giver");
    else {
      // DonorSummary is collection-only. Old persisted association pages must
      // resolve through that collection too; an absent singular link can 404.
      query.set("where[person_id]", u.pathname.split("/")[4]);
      u.pathname = "/giving/v2/donor_summaries";
    }
    // Override the documented default 30-day window for family linkage only.
    // This is not used to claim transaction/history coverage.
    query.set("where[received_at][gte]", "1900-01-01T00:00:00Z");
  }
  if (page.type === "Group") query.set("where[archive_status]", "include");
  if (page.since) {
    if (page.type === "Donation")
      query.set(
        `where[${page.windowField === "updated_at" ? "updated_at" : "received_at"}][gte]`,
        `${page.since}T00:00:00Z`,
      );
    if (product === "groups" && page.type === "Event")
      query.set("where[starts_at][gte]", `${page.since}T00:00:00Z`);
    if (product === "serving" && page.type === "Plan") {
      if (page.windowField === "updated_at")
        query.set("where[updated_at][gte]", `${page.since}T00:00:00Z`);
      else {
        query.set("filter", "after");
        query.set("after", `${page.since}T00:00:00Z`);
        if (page.until) {
          query.set("filter", "after,before");
          // PCO filters by plan times, not sort_date. Preserve overlapping
          // multi-day plans and use actual Chicago midnight/DST boundaries.
          query.set("after", new Date(Date.parse(chicagoMidnight(page.since)) - 1).toISOString());
          query.set("before", chicagoMidnight(shiftDate(page.until, 1)));
        }
      }
    }
  }
  return `${u.pathname}?${query}`;
}
export function ministryEntity(value: unknown, expectedType: string): SourceEntity {
  if (!value || typeof value !== "object") throw new ProviderError(422);
  const v = value as Record<string, unknown>;
  if (
    v.type !== expectedType ||
    typeof v.id !== "string" ||
    !validResourceId(v.id, expectedType) ||
    !v.attributes ||
    typeof v.attributes !== "object" ||
    Array.isArray(v.attributes)
  )
    throw new ProviderError(422);
  const input = v.attributes as Record<string, unknown>;
  const attrs: Record<string, unknown> = {};
  for (const key of attributes[expectedType]) {
    const x = input[key];
    if (x === undefined) continue;
    if (x !== null && !["string", "number", "boolean"].includes(typeof x))
      throw new ProviderError(422);
    if (typeof x === "string" && x.length > 1000) throw new ProviderError(422);
    if (typeof x === "number" && !Number.isSafeInteger(x)) throw new ProviderError(422);
    if (key.endsWith("_cents") || key.endsWith("_count")) {
      if (x !== null && (typeof x !== "number" || !Number.isSafeInteger(x)))
        throw new ProviderError(422);
    }
    if (
      (key.endsWith("_at") || key === "next_occurrence") &&
      x !== null &&
      (typeof x !== "string" || !/^\d{4}-\d\d-\d\dT/.test(x) || !Number.isFinite(Date.parse(x)))
    )
      throw new ProviderError(422);
    attrs[key] = x;
  }
  const rel: SourceEntity["relationships"] = {};
  const source = v.relationships as Record<string, { data?: unknown }> | undefined;
  for (const [key, type] of Object.entries(relationships[expectedType] ?? {})) {
    if (expectedType === "Plan" && key === "plan_times" &&
      (!source || !Object.hasOwn(source, key))) continue;
    if (!source || !Object.hasOwn(source, key)) throw new ProviderError(422);
    const data = source[key]?.data as { type?: unknown; id?: unknown } | null | undefined;
    if (
      (expectedType === "PlanPerson" && key === "service_times" ||
        expectedType === "Plan" && key === "plan_times") &&
      Array.isArray(data)
    ) {
      if (
        data.length > 1000 ||
        data.some(
          (d) => !d || d.type !== type || typeof d.id !== "string" || !/^[0-9]{1,30}$/.test(d.id),
        )
      )
        throw new ProviderError(422);
      rel[key] = { data: data.map((d) => ({ type, id: d.id })) };
    } else if (data === null) rel[key] = { data: null };
    else if (data?.type === type && typeof data.id === "string" && validResourceId(data.id, type))
      rel[key] = { data: { type, id: data.id } };
    else throw new ProviderError(422);
  }
  return { type: expectedType, id: v.id, attributes: attrs, relationships: rel };
}
function validResourceId(id: string, type: string) {
  // PCO returns a synthetic category for groups without a custom GroupType.
  return /^[0-9]{1,30}$/.test(id) || (type === "GroupType" && id === "unique");
}
export function parseMinistryPage(
  value: Record<string, unknown>,
  page: Page,
  product: MinistryProduct,
): ParsedPage {
  if (product === "giving" && page.type === "JointGiver" && Array.isArray(value.data)) {
    const primary = new URL(page.path, PCO_ORIGIN).pathname.split("/")[4];
    if (value.links && (value.links as { next?: unknown }).next) throw new ProviderError(422);
    if (value.data.length > 1) throw new ProviderError(422);
    const result = parseMinistryPage(
      value,
      { type: "DonorSummary", path: "/giving/v2/donor_summaries" },
      product,
    );
    const summary = result.entities.find((e) => e.type === "DonorSummary");
    if (summary && summary.id !== primary) throw new ProviderError(422);
    return {
      entities: summary
        ? result.entities.filter((e) => e.type === "JointGiver")
        : [
            {
              type: "JointGiver",
              id: primary,
              attributes: { linkage_unavailable: true },
              relationships: {
                primary: { data: { type: "Person", id: primary } },
                joint_giver: { data: null },
              },
            },
          ],
      nextPages: [],
    };
  }
  // Refund is a documented singleton association; null is valid when absent.
  const raw =
    ["Refund", "JointGiver"].includes(page.type) && !Array.isArray(value.data)
      ? value.data == null
        ? []
        : [value.data]
      : value.data;
  if (!Array.isArray(raw) || raw.length > 100) throw new ProviderError(422);
  const summaries = product === "giving" && page.type === "DonorSummary";
  const donations = product === "giving" && page.type === "Donation";
  const servingPlans = product === "serving" && page.type === "Plan";
  if (
    value.included !== undefined &&
    (!Array.isArray(value.included) ||
      (!summaries && !donations && !servingPlans && value.included.length))
  )
    throw new ProviderError(422);
  const entities = raw.map((e) => {
    if (page.type !== "JointGiver") return ministryEntity(e, page.type);
    const person = ministryEntity(e, "Person");
    const primary = new URL(page.path, PCO_ORIGIN).pathname.match(
      /\/donor_summaries\/(\d+)\/joint_giver$/,
    )![1];
    // A derived relationship resource retains the association's primary key;
    // it must not overwrite the Person resource's independent source context.
    return {
      type: "JointGiver",
      id: primary,
      attributes: {},
      relationships: {
        primary: { data: { type: "Person", id: primary } },
        joint_giver: { data: { type: "Person", id: person.id } },
      },
    };
  });
  if (summaries) {
    const included = value.included as unknown[] | undefined;
    if (included && included.length > 100) throw new ProviderError(422);
    const allowedIds = new Set<string>();
    for (const e of [...entities]) {
      const rawSummary = raw.find(
        (v) => v && typeof v === "object" && (v as { id?: unknown }).id === e.id,
      ) as { relationships?: Record<string, { data?: unknown }> };
      const relationship = rawSummary.relationships?.joint_giver;
      if (!relationship || !Object.hasOwn(relationship, "data")) throw new ProviderError(422);
      const data = relationship.data;
      if (
        data !== null &&
        (!data ||
          typeof data !== "object" ||
          (data as { type?: unknown }).type !== "Person" ||
          typeof (data as { id?: unknown }).id !== "string" ||
          !/^[0-9]{1,30}$/.test((data as { id: string }).id))
      )
        throw new ProviderError(422);
      if (data) allowedIds.add((data as { id: string }).id);
      entities.push({
        type: "JointGiver",
        id: e.id,
        attributes: {},
        relationships: {
          primary: { data: { type: "Person", id: e.id } },
          joint_giver: { data: data as { type: string; id: string } | null },
        },
      });
    }
    for (const v of included ?? []) {
      const person = ministryEntity(v, "Person");
      if (!allowedIds.has(person.id)) throw new ProviderError(422);
      entities.push(person);
    }
  }
  const sourceCollections: Record<string, string> = {};
  const plansWithIncludedTimes = new Set<string>();
  if (servingPlans) {
    const included = value.included as unknown[] | undefined;
    if (included && included.length > 10_000) throw new ProviderError(422);
    const planByTime = new Map<string, string>();
    for (const resource of raw) {
      if (!resource || typeof resource !== "object") throw new ProviderError(422);
      const plan = resource as { id?: unknown; relationships?: Record<string, { data?: unknown }> };
      if (typeof plan.id !== "string" || !/^[0-9]{1,30}$/.test(plan.id)) throw new ProviderError(422);
      const relationship = plan.relationships?.plan_times;
      if (!relationship || !Object.hasOwn(relationship, "data") || relationship.data === null) continue;
      if (!Array.isArray(relationship.data) || relationship.data.length > 1000)
        throw new ProviderError(422);
      for (const ref of relationship.data) {
        if (!ref || typeof ref !== "object" || ref.type !== "PlanTime" ||
          typeof ref.id !== "string" || !/^[0-9]{1,30}$/.test(ref.id) ||
          planByTime.has(ref.id))
          throw new ProviderError(422);
        planByTime.set(ref.id, plan.id);
      }
    }
    const normalizedTimes = new Map<string, SourceEntity>();
    for (const resource of included ?? []) {
      const time = ministryEntity(resource, "PlanTime");
      if (!planByTime.has(time.id) || normalizedTimes.has(time.id)) throw new ProviderError(422);
      normalizedTimes.set(time.id, time);
    }
    const byPlan = new Map<string, SourceEntity[]>();
    for (const [timeId, planId] of planByTime) {
      const time = normalizedTimes.get(timeId);
      if (!time) continue;
      const times = byPlan.get(planId) ?? [];
      times.push(time);
      byPlan.set(planId, times);
    }
    const currentPath = new URL(ministryPagePath(page, product), PCO_ORIGIN).pathname;
    for (const entity of entities) {
      const refs = planByTime.size
        ? [...planByTime].filter(([, planId]) => planId === entity.id).map(([id]) => id)
        : [];
      const includedTimes = byPlan.get(entity.id) ?? [];
      if (refs.length === includedTimes.length &&
        Array.isArray(entity.relationships.plan_times?.data)) {
        plansWithIncludedTimes.add(entity.id);
        for (const time of includedTimes) {
          entities.push(time);
          sourceCollections[`PlanTime:${time.id}`] = `${currentPath}/${entity.id}/plan_times`;
        }
      }
    }
  }
  const coveredDonations = new Set<string>();
  if (donations) {
    const parents = new Map<string, string>();
    const expected = new Map<string, string[]>();
    for (const resource of raw) {
      const donation = resource as {
        id: string;
        relationships?: Record<string, { data?: unknown }>;
      };
      const linkage = donation.relationships?.designations;
      // Legacy or incomplete responses retain the individual association GET.
      // Missing linkage is unknown, never proof of an empty designation set.
      if (!linkage || !Object.hasOwn(linkage, "data")) continue;
      if (!Array.isArray(linkage.data) || linkage.data.length > 1000) throw new ProviderError(422);
      const ids: string[] = [];
      for (const ref of linkage.data) {
        if (
          !ref ||
          typeof ref !== "object" ||
          ref.type !== "Designation" ||
          typeof ref.id !== "string" ||
          !/^[0-9]{1,30}$/.test(ref.id) ||
          parents.has(ref.id)
        )
          throw new ProviderError(422);
        parents.set(ref.id, donation.id);
        ids.push(ref.id);
      }
      expected.set(donation.id, ids);
    }
    const included = (value.included ?? []) as unknown[];
    if (included.length > 5000) throw new ProviderError(422);
    const received = new Set<string>();
    for (const resource of included) {
      const designation = ministryEntity(resource, "Designation");
      const parent = parents.get(designation.id);
      if (!parent || received.has(designation.id)) throw new ProviderError(422);
      received.add(designation.id);
      entities.push(designation);
      sourceCollections[`Designation:${designation.id}`] =
        `/giving/v2/donations/${parent}/designations`;
    }
    for (const [donation, ids] of expected)
      if (ids.every((id) => received.has(id))) coveredDonations.add(donation);
  }
  const nextPages: Page[] = [];
  const scanWindow = page.since
    ? { since: page.since, ...(page.until ? { until: page.until } : {}),
        ...(page.windowField ? { windowField: page.windowField } : {}) }
    : {};
  const current = new URL(ministryPagePath(page, product), PCO_ORIGIN);
  const next = (value.links as { next?: unknown } | undefined)?.next;
  if (next != null) {
    if (typeof next !== "string") throw new ProviderError(422);
    const u = new URL(next, PCO_ORIGIN);
    if (
      u.pathname !== current.pathname ||
      u.origin !== PCO_ORIGIN ||
      !/^\d+$/.test(u.searchParams.get("offset") ?? "") ||
      Number(u.searchParams.get("offset")) <= Number(current.searchParams.get("offset") ?? 0)
    )
      throw new ProviderError(422);
    nextPages.push({
      type: page.type,
      path: ministryPagePath({ ...page, path: next }, product),
      ...scanWindow,
    });
  }
  for (const e of entities) {
    if (product === "giving" && e.type === "Donation") {
      if (!coveredDonations.has(e.id))
        nextPages.push({ type: "Designation", path: `/giving/v2/donations/${e.id}/designations` });
      if (e.attributes.refunded === true)
        nextPages.push({ type: "Refund", path: `/giving/v2/donations/${e.id}/refund` });
    }
    if (product === "groups" && e.type === "Event")
      nextPages.push({ type: "Attendance", path: `/groups/v2/events/${e.id}/attendances` });
    if (product === "serving" && e.type === "ServiceType")
      nextPages.push({
        type: "Plan",
        path: `/services/v2/service_types/${e.id}/plans`,
        ...scanWindow,
      });
    if (product === "serving" && e.type === "Plan") {
      if (!plansWithIncludedTimes.has(e.id))
        nextPages.push({ type: "PlanTime", path: `${current.pathname}/${e.id}/plan_times`, ...scanWindow });
      nextPages.push({ type: "PlanPerson", path: `${current.pathname}/${e.id}/team_members`, ...scanWindow });
    }
  }
  return {
    entities,
    nextPages,
    ...(Object.keys(sourceCollections).length ? { sourceCollections } : {}),
  };
}
