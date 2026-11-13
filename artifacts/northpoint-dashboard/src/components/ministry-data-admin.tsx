import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getGetMinistryDataAdminQueryKey,
  useCreateMinistrySourceMapping,
  useGetMinistryDataAdmin,
  useImportMinistryHistory,
  usePublishMinistryData,
  type MinistryPublicationResult,
  type MinistrySourceMapping,
} from "@workspace/api-client-react";
import { Database, History, Send } from "lucide-react";
import { Panel, QueryError, formatDate } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyRecord,
  FormError,
  SectionHeading,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/admin-controls";
import { csrfRequest } from "@/lib/attendance";
import { MinistryCheckInReview } from "@/components/ministry-checkin-review";
import {
  MAPPABLE_MINISTRIES,
  MEASURES,
  PRODUCTS,
  PRODUCT_LABEL,
  PRODUCT_PAIRS,
  SCOPES,
  invalidateMinistryData,
  isSunday,
  measureLabel,
  ministryName,
  ministryPolling,
  scopeLabel,
  validateRange,
  type Product,
} from "@/lib/ministry-data";

const blankMapping = {
  product: "" as Product | "",
  objectType: "",
  externalId: "",
  ministry: "",
  measure: "",
  scope: "all",
  effectiveFrom: "",
  effectiveTo: "",
  note: "",
};
const blankHistory = {
  batchId: "",
  mappingId: "",
  ministry: "",
  measure: "",
  scope: "all",
  year: "",
};
const isScope = (v: string) => (SCOPES as readonly string[]).includes(v);
const SCOPE_ERROR = "Choose a scope from the list.";

function Result({ r, testId }: { r: MinistryPublicationResult; testId: string }) {
  return (
    <div
      role="status"
      data-testid={testId}
      className="mt-3 rounded-md bg-accent/55 px-3 py-2.5 text-[12px] text-accent-foreground"
    >
      {r.reused ? "Already published; the earlier publication was reused." : "Published."}{" "}
      {r.values} values · Publication {r.publicationId}
      {r.issues.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {r.issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MinistryDataAdminPanel() {
  const { user, csrfToken } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const q = useGetMinistryDataAdmin({
    query: { enabled: isAdmin, queryKey: getGetMinistryDataAdminQueryKey(), ...ministryPolling },
  });
  const createMapping = useCreateMinistrySourceMapping(csrfRequest(csrfToken));
  const publish = usePublishMinistryData(csrfRequest(csrfToken));
  const history = useImportMinistryHistory(csrfRequest(csrfToken));

  const [mapping, setMapping] = useState(blankMapping);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingSaved, setMappingSaved] = useState(false);
  const [base, setBase] = useState<MinistrySourceMapping | null>(null);
  const [retire, setRetire] = useState(false);
  const [pub, setPub] = useState({ product: "" as Product | "", start: "", end: "" });
  const [pubError, setPubError] = useState<string | null>(null);
  const [hist, setHist] = useState(blankHistory);
  const [histError, setHistError] = useState<string | null>(null);

  if (!isAdmin) return null;
  const admin = q.data;
  const pair = mapping.product ? PRODUCT_PAIRS[mapping.product] : null;
  const mappingObjectTypes =
    mapping.measure === "service_session"
      ? ["EventTime"]
      : mapping.measure === "student_group_classification"
        ? ["GroupType", "Group"]
        : (pair?.objectTypes ?? []);
  const mappingMinistries =
    mapping.measure === "service_session"
      ? MAPPABLE_MINISTRIES.filter((m) =>
          ["upstreet", "waumba-land", "transit", "insideout"].includes(m.slug),
        )
      : mapping.measure === "student_group_classification"
        ? MAPPABLE_MINISTRIES.filter((m) => ["transit", "insideout"].includes(m.slug))
        : MAPPABLE_MINISTRIES;
  const mappingScopes =
    mapping.measure === "service_session"
      ? SCOPES.filter((scope) => ["service-1", "service-2", "service-3"].includes(scope))
      : mapping.measure === "student_group_classification"
        ? SCOPES.filter((scope) => scope === "all")
        : SCOPES;
  const sourceOptions = (admin?.sources ?? []).filter(
    (s) => s.product === mapping.product && s.objectType === mapping.objectType,
  );

  const submitMapping = (e: FormEvent) => {
    e.preventDefault();
    setMappingSaved(false);
    const m = mapping;
    let err: string | null = null;
    if (!m.product || !pair) err = "Choose a product.";
    else if (!pair.objectTypes.includes(m.objectType))
      err = "Choose a supported object type for this product.";
    else if (!pair.measures.includes(m.measure))
      err = "Choose a supported measure for this product.";
    else if (!/^[0-9]{1,30}$/.test(m.externalId)) err = "Source ID must be 1 to 30 digits.";
    else if (!m.ministry) err = "Choose a ministry.";
    else if (!isScope(m.scope)) err = SCOPE_ERROR;
    else if (!m.effectiveFrom) err = "Choose an effective-from date.";
    else if (m.effectiveTo && m.effectiveTo < m.effectiveFrom)
      err = "Effective-to must be on or after effective-from.";
    else if (m.note.trim().length < 3) err = "Add a note of at least 3 characters.";
    setMappingError(err);
    if (err || !m.product) return;
    createMapping.mutate(
      {
        data: {
          product: m.product,
          objectType: m.objectType,
          externalId: m.externalId,
          ministry: m.ministry,
          measure: m.measure,
          scope: m.scope,
          effectiveFrom: m.effectiveFrom,
          effectiveTo: m.effectiveTo || null,
          note: m.note.trim(),
          supersedesId: base?.id ?? null,
          enabled: !retire,
        },
      },
      {
        onSuccess: () => {
          setMapping(blankMapping);
          setBase(null);
          setRetire(false);
          setMappingSaved(true);
          void invalidateMinistryData(qc);
        },
      },
    );
  };

  const beginReplace = (m: MinistrySourceMapping, asRetire: boolean) => {
    setBase(m);
    setRetire(asRetire);
    setMappingSaved(false);
    setMappingError(null);
    setMapping({
      product: m.product,
      objectType: m.objectType,
      externalId: m.externalId,
      ministry: m.ministry,
      measure: m.measure,
      scope: m.scope,
      effectiveFrom: m.effectiveFrom.slice(0, 10),
      effectiveTo: m.effectiveTo ? m.effectiveTo.slice(0, 10) : "",
      note: "",
    });
  };
  const cancelReplace = () => {
    setBase(null);
    setRetire(false);
    setMapping(blankMapping);
    setMappingError(null);
  };
  const supersededIds = new Set((admin?.mappings ?? []).map((m) => m.supersedesId).filter(Boolean));

  const submitPublish = (e: FormEvent) => {
    e.preventDefault();
    const err = !pub.product ? "Choose a product." : validateRange(pub.start, pub.end);
    setPubError(err);
    if (err || !pub.product) return;
    publish.mutate(
      { data: { product: pub.product, start: pub.start, end: pub.end } },
      { onSuccess: () => void invalidateMinistryData(qc) },
    );
  };

  const submitHistory = (e: FormEvent) => {
    e.preventDefault();
    const h = hist;
    const year = h.year.trim() === "" ? null : Number(h.year);
    let err: string | null = null;
    if (!h.batchId) err = "Choose an accepted workbook batch.";
    else if (!h.mappingId.trim()) err = "Enter the approved, staged Imports mapping ID.";
    else if (!h.ministry) err = "Choose a ministry.";
    else if (!h.measure) err = "Choose a measure.";
    else if (!isScope(h.scope)) err = SCOPE_ERROR;
    else if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100))
      err = "Year must be between 1900 and 2100, or blank.";
    setHistError(err);
    if (err) return;
    history.mutate(
      {
        data: {
          batchId: h.batchId,
          mappingId: h.mappingId.trim(),
          ministry: h.ministry,
          measure: h.measure,
          scope: h.scope,
          year,
        },
      },
      { onSuccess: () => void invalidateMinistryData(qc) },
    );
  };

  return (
    <div className="mt-5 space-y-5" data-testid="section-ministry-data-admin">
      {q.isError && !admin ? (
        <QueryError
          title="Ministry data setup unavailable"
          error={q.error}
          onRetry={() => void q.refetch()}
        />
      ) : !admin ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <MinistryCheckInReview csrfToken={csrfToken} />
          <Panel className="p-5 sm:p-6">
            <SectionHeading
              icon={Database}
              title="Ministry source mappings"
              detail="Connect a Planning Center source to a ministry measure. Effective dates cannot be edited after saving."
            />
            <form onSubmit={submitMapping} className="space-y-3" noValidate>
              {base && (
                <div
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-950"
                  data-testid="status-mapping-replacing"
                >
                  <p className="font-medium">
                    {retire ? "Retiring" : "Correcting"} mapping {base.id}
                  </p>
                  <p>
                    Source {PRODUCT_LABEL[base.product] ?? base.product} {base.objectType}{" "}
                    {base.externalId} · {measureLabel(base.measure)}. These stay the same.{" "}
                    {retire
                      ? "A new row is appended with this mapping turned off."
                      : "A replacement row is appended; scope, ministry and dates can change."}{" "}
                    The original row is kept unchanged. Values already published from it are
                    invalidated until you publish again.
                  </p>
                  <button
                    type="button"
                    onClick={cancelReplace}
                    className="mt-1.5 h-8 rounded-md border border-amber-400 px-2.5 text-[12px]"
                    data-testid="button-cancel-replace"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {!base && (
                  <>
                    <SelectField
                      name="mapping-product"
                      label="Product"
                      value={mapping.product}
                      onChange={(v) =>
                        setMapping({
                          ...mapping,
                          product: v as Product,
                          objectType: "",
                          measure: "",
                          externalId: "",
                        })
                      }
                    >
                      {PRODUCTS.map((p) => (
                        <option key={p} value={p}>
                          {PRODUCT_LABEL[p]}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      name="mapping-object-type"
                      label="Object type"
                      value={mapping.objectType}
                      onChange={(v) => setMapping({ ...mapping, objectType: v, externalId: "" })}
                    >
                      {mappingObjectTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      name="mapping-measure"
                      label="Measure"
                      value={mapping.measure}
                      onChange={(v) =>
                        setMapping({
                          ...mapping,
                          measure: v,
                          objectType:
                            v === "service_session" || v === "student_group_classification"
                              ? v === "service_session"
                                ? "EventTime"
                                : "GroupType"
                              : mapping.objectType,
                          ministry:
                            v === "service_session"
                              ? ["upstreet", "waumba-land", "transit", "insideout"].includes(
                                  mapping.ministry,
                                )
                                ? mapping.ministry
                                : "upstreet"
                              : v === "student_group_classification" &&
                                  !["transit", "insideout"].includes(mapping.ministry)
                                ? "transit"
                                : mapping.ministry,
                          scope:
                            v === "service_session"
                              ? ["service-1", "service-2", "service-3"].includes(mapping.scope)
                                ? mapping.scope
                                : "service-1"
                              : v === "student_group_classification"
                                ? "all"
                                : mapping.scope,
                          externalId:
                            v === "service_session" || v === "student_group_classification"
                              ? ""
                              : mapping.externalId,
                        })
                      }
                    >
                      {(pair?.measures ?? []).map((m) => (
                        <option key={m} value={m}>
                          {measureLabel(m)} ({m})
                        </option>
                      ))}
                    </SelectField>
                    {sourceOptions.length > 0 && (
                      <SelectField
                        name="mapping-source"
                        label="Known source"
                        value={
                          sourceOptions.some((s) => s.externalId === mapping.externalId)
                            ? mapping.externalId
                            : ""
                        }
                        onChange={(v) => setMapping({ ...mapping, externalId: v })}
                      >
                        {sourceOptions.map((s) => (
                          <option key={s.externalId} value={s.externalId}>
                            {s.label} · {s.externalId}
                          </option>
                        ))}
                      </SelectField>
                    )}
                    <TextField
                      name="mapping-external-id"
                      label="Source ID"
                      value={mapping.externalId}
                      onChange={(v) => setMapping({ ...mapping, externalId: v.trim() })}
                      pattern="^[0-9]{1,30}$"
                      maxLength={30}
                      hint="Planning Center ID, digits only."
                    />
                  </>
                )}
                <SelectField
                  name="mapping-ministry"
                  label="Ministry"
                  value={mapping.ministry}
                  onChange={(v) => setMapping({ ...mapping, ministry: v })}
                >
                  {mappingMinistries.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  name="mapping-scope"
                  label="Scope"
                  value={mapping.scope}
                  onChange={(v) => setMapping({ ...mapping, scope: v })}
                >
                  {mappingScopes.map((sc) => (
                    <option key={sc} value={sc}>
                      {scopeLabel(sc)}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  name="mapping-effective-from"
                  label="Effective from"
                  type="date"
                  value={mapping.effectiveFrom}
                  onChange={(v) => setMapping({ ...mapping, effectiveFrom: v })}
                />
                <TextField
                  name="mapping-effective-to"
                  label="Effective to"
                  type="date"
                  value={mapping.effectiveTo}
                  onChange={(v) => setMapping({ ...mapping, effectiveTo: v })}
                  hint="Optional. Blank means still in effect."
                />
              </div>
              {mapping.measure === "service_session" && (
                <p className="rounded-lg border border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
                  Routing only: this Event Time is a recurring template matched by its event and
                  Chicago-local start time. It routes attendance for the selected ministry and
                  does not publish a Service Programming total.
                </p>
              )}
              {mapping.measure === "student_group_classification" && (
                <p className="rounded-lg border border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
                  Maps this Group to Transit or InsideOut for Check-In ministry classification only.
                  It does not publish group totals or person-level data.
                </p>
              )}
              <TextField
                name="mapping-note"
                label="Note"
                value={mapping.note}
                onChange={(v) => setMapping({ ...mapping, note: v })}
                maxLength={1000}
                hint="Why this source counts for this measure."
              />
              {mappingError && (
                <p
                  role="alert"
                  className="text-[12px] text-destructive"
                  data-testid="text-mapping-error"
                >
                  {mappingError}
                </p>
              )}
              <FormError error={createMapping.error} />
              {mappingSaved && (
                <p
                  role="status"
                  className="text-[12px] text-accent-foreground"
                  data-testid="status-mapping-saved"
                >
                  Mapping saved.
                </p>
              )}
              <SubmitButton pending={createMapping.isPending}>
                {retire ? "Retire mapping" : base ? "Save correction" : "Save mapping"}
              </SubmitButton>
            </form>
            {admin.mappings.length === 0 ? (
              <EmptyRecord>No ministry source mappings yet.</EmptyRecord>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-lg border">
                <table
                  className="w-full min-w-[760px] text-[12.5px]"
                  aria-label="Ministry source mappings"
                >
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      {[
                        "Ministry",
                        "Measure",
                        "Scope",
                        "Source",
                        "Effective",
                        "Status",
                        "Note",
                        "Actions",
                      ].map((h) => (
                        <th key={h} scope="col" className="px-3 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {admin.mappings.map((m) => (
                      <tr
                        key={m.id}
                        className="border-b last:border-0"
                        data-testid={`row-mapping-${m.id}`}
                      >
                        <td className="px-3 py-2">{ministryName(m.ministry)}</td>
                        <td className="px-3 py-2">{measureLabel(m.measure)}</td>
                        <td className="px-3 py-2 font-mono text-[11.5px]">
                          {scopeLabel(m.scope)}
                        </td>
                        <td className="px-3 py-2">
                          {PRODUCT_LABEL[m.product] ?? m.product} {m.objectType}{" "}
                          <span className="font-mono text-[11.5px]">{m.externalId}</span>
                        </td>
                        <td className="px-3 py-2">
                          {formatDate(m.effectiveFrom)} to{" "}
                          {m.effectiveTo ? formatDate(m.effectiveTo) : "open"}
                        </td>
                        <td
                          className="px-3 py-2 text-[12px]"
                          data-testid={`status-mapping-${m.id}`}
                        >
                          {m.enabled === false ? "Retired" : "On"}
                          {supersededIds.has(m.id) && (
                            <span className="block text-muted-foreground">Replaced</span>
                          )}
                          {m.supersedesId && (
                            <span className="block font-mono text-[10.5px] text-muted-foreground">
                              Replaces {m.supersedesId}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{m.note}</td>
                        <td className="px-3 py-2">
                          {!supersededIds.has(m.id) && m.enabled !== false && (
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => beginReplace(m, false)}
                                disabled={createMapping.isPending}
                                className="h-7 rounded-md border px-2 text-[11.5px]"
                                data-testid={`button-correct-mapping-${m.id}`}
                              >
                                Correct
                              </button>
                              <button
                                type="button"
                                onClick={() => beginReplace(m, true)}
                                disabled={createMapping.isPending}
                                className="h-7 rounded-md border px-2 text-[11.5px]"
                                data-testid={`button-retire-mapping-${m.id}`}
                              >
                                Retire
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                  Changing a mapping invalidates values already published from it until the product
                  is published again.
                </p>
              </div>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              Updated {formatDate(admin.asOf, true)}
            </p>
          </Panel>

          <Panel className="p-5 sm:p-6">
            <SectionHeading
              icon={Send}
              title="Publish ministry data"
              detail="Publish completed Planning Center scans for a date range. Running the same publication again is safe and reuses the earlier result."
            />
            <p className="mb-3 text-[12px] text-muted-foreground">
              Publish once to set up a product. After that, each completed authorized scan refreshes
              its published figures automatically. This does not turn on any schedule.
            </p>
            <form
              onSubmit={submitPublish}
              className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
              noValidate
            >
              <SelectField
                name="publish-product"
                label="Product"
                value={pub.product}
                onChange={(v) => setPub({ ...pub, product: v as Product })}
              >
                {PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {PRODUCT_LABEL[p]}
                  </option>
                ))}
              </SelectField>
              <TextField
                name="publish-start"
                label="Start Sunday"
                type="date"
                value={pub.start}
                onChange={(v) => setPub({ ...pub, start: v })}
              />
              <TextField
                name="publish-end"
                label="End Sunday"
                type="date"
                value={pub.end}
                onChange={(v) => setPub({ ...pub, end: v })}
              />
              <SubmitButton pending={publish.isPending}>Publish</SubmitButton>
            </form>
            {pub.start && !isSunday(pub.start) && (
              <p className="mt-2 text-[12px] text-muted-foreground">Start date is not a Sunday.</p>
            )}
            {pubError && (
              <p
                role="alert"
                className="mt-2 text-[12px] text-destructive"
                data-testid="text-publish-error"
              >
                {pubError}
              </p>
            )}
            <div className="mt-2">
              <FormError error={publish.error} />
            </div>
            {publish.data && <Result r={publish.data} testId="status-publish-result" />}
          </Panel>

          <Panel className="p-5 sm:p-6">
            <SectionHeading
              icon={History}
              title="Workbook history"
              detail="Publish legacy workbook history for a ministry measure from an approved, staged Imports mapping."
            />
            <p className="mb-3 rounded-md bg-accent/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
              The preview mapping must first be approved and staged in{" "}
              <Link
                href="/administration/imports"
                data-testid="link-history-imports"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Workbook imports
              </Link>
              . Copy that Workbook Imports mapping ID from there; ministry source mapping IDs above
              do not work here. Weeks are not reconfirmed one by one here.
            </p>
            <form onSubmit={submitHistory} className="space-y-3" noValidate>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SelectField
                  name="history-batch"
                  label="Accepted workbook batch"
                  value={hist.batchId}
                  onChange={(v) => setHist({ ...hist, batchId: v })}
                >
                  {admin.batches
                    .filter((b) => b.state === "active")
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.filename} · {formatDate(b.snapshotDate)}
                      </option>
                    ))}
                </SelectField>
                <TextField
                  name="history-mapping-id"
                  label="Workbook Imports mapping ID"
                  value={hist.mappingId}
                  onChange={(v) => setHist({ ...hist, mappingId: v })}
                  hint="The UUID of an approved, staged mapping on the Workbook imports page. Not a ministry source mapping ID."
                />
                <SelectField
                  name="history-ministry"
                  label="Ministry"
                  value={hist.ministry}
                  onChange={(v) => setHist({ ...hist, ministry: v })}
                >
                  {MAPPABLE_MINISTRIES.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  name="history-measure"
                  label="Measure"
                  value={hist.measure}
                  onChange={(v) => setHist({ ...hist, measure: v })}
                >
                  {MEASURES.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label} ({m.key})
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  name="history-scope"
                  label="Scope"
                  value={hist.scope}
                  onChange={(v) => setHist({ ...hist, scope: v })}
                >
                  {SCOPES.map((sc) => (
                    <option key={sc} value={sc}>
                      {sc}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  name="history-year"
                  label="Align to year"
                  type="number"
                  min={1900}
                  max={2100}
                  step={1}
                  value={hist.year}
                  onChange={(v) => setHist({ ...hist, year: v })}
                  hint="Blank uses the dates in the workbook. A year places each row on that year's Sundays in order, for legacy year-comparison columns."
                />
              </div>
              {admin.batches.length === 0 && (
                <p className="text-[12px] text-muted-foreground">
                  No workbook batches yet. Upload one in Workbook imports.
                </p>
              )}
              {histError && (
                <p
                  role="alert"
                  className="text-[12px] text-destructive"
                  data-testid="text-history-error"
                >
                  {histError}
                </p>
              )}
              <FormError error={history.error} />
              <SubmitButton pending={history.isPending}>Publish history</SubmitButton>
            </form>
            {history.data && <Result r={history.data} testId="status-history-result" />}
          </Panel>
        </>
      )}
    </div>
  );
}
