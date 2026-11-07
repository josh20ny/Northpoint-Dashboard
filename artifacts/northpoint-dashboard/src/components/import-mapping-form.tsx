import { useState, type FormEvent } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useCreateImportMapping,
  type ImportDetail,
  type ImportMappingInput,
  type ImportMappingInputConfidence,
} from "@workspace/api-client-react";
import { FormError, SubmitButton } from "@/components/admin-controls";
import { csrfRequest, inputCls, Note, useInvalidateImports } from "@/components/import-common";

type Draft = Record<
  | "sheet"
  | "valueColumn"
  | "dateColumn"
  | "startRow"
  | "endRow"
  | "target"
  | "unit"
  | "ministry"
  | "semantics"
  | "priority"
  | "legacyLabel"
  | "supersedes",
  string
> & { confidence: ImportMappingInputConfidence | "" };

const blank: Draft = {
  sheet: "",
  valueColumn: "",
  dateColumn: "",
  startRow: "",
  endRow: "",
  target: "",
  unit: "",
  ministry: "",
  semantics: "",
  priority: "",
  confidence: "",
  legacyLabel: "",
  supersedes: "",
};

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-[12px] font-medium">
      {label}
      <div className="mt-1">{children}</div>
      {hint && (
        <span className="mt-1 block text-[11px] font-normal text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

export function ImportMappingForm({ detail }: { detail: ImportDetail }) {
  const { csrfToken } = useAuth();
  const invalidate = useInvalidateImports();
  const create = useCreateImportMapping(csrfRequest(csrfToken));
  const [d, setD] = useState<Draft>(blank);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) =>
    setD({ ...d, [k]: e.target.value });
  const start = Number(d.startRow);
  const end = Number(d.endRow);
  const rangeError =
    d.startRow &&
    d.endRow &&
    (end < start
      ? "End row must be on or after start row."
      : end - start + 1 > 1000
        ? "A mapping covers at most 1000 rows."
        : "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (rangeError || !d.confidence) return;
    const data: ImportMappingInput = {
      sheet: d.sheet,
      valueColumn: d.valueColumn.trim().toUpperCase(),
      dateColumn: d.dateColumn.trim().toUpperCase(),
      startRow: start,
      endRow: end,
      target: d.target.trim(),
      unit: d.unit.trim(),
      ministry: d.ministry.trim(),
      semantics: d.semantics.trim(),
      priority: d.priority.trim(),
      confidence: d.confidence,
      legacyLabel: d.legacyLabel.trim(),
      supersedes: d.supersedes || null,
    };
    create.mutate(
      { id: detail.batch.id, data },
      {
        onSuccess: () => {
          setD(blank);
          void invalidate(detail.batch.id);
        },
      },
    );
  };
  const col = "^[A-Za-z]{1,3}$";

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border bg-muted/25 p-4"
      aria-label="New mapping draft"
    >
      <Note>
        Explicit mapping only. Nothing is inferred from headers. Drafts are immutable; to change
        one, submit a new version that supersedes it.
      </Note>
      <div className="grid gap-3 sm:grid-cols-3">
        <F label="Sheet">
          <select
            required
            value={d.sheet}
            onChange={set("sheet")}
            className={inputCls}
            data-testid="select-mapping-sheet"
          >
            <option value="" disabled>
              Select
            </option>
            {detail.sheets.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </F>
        <F label="Value column">
          <input
            required
            pattern={col}
            value={d.valueColumn}
            onChange={set("valueColumn")}
            placeholder="D"
            className={inputCls}
            data-testid="input-mapping-value-column"
          />
        </F>
        <F label="Date column">
          <input
            required
            pattern={col}
            value={d.dateColumn}
            onChange={set("dateColumn")}
            placeholder="A"
            className={inputCls}
            data-testid="input-mapping-date-column"
          />
        </F>
        <F label="Start row">
          <input
            required
            type="number"
            min={1}
            max={100000}
            value={d.startRow}
            onChange={set("startRow")}
            className={inputCls}
            data-testid="input-mapping-start-row"
          />
        </F>
        <F label="End row" hint="Up to 1000 rows.">
          <input
            required
            type="number"
            min={1}
            max={100000}
            value={d.endRow}
            onChange={set("endRow")}
            className={inputCls}
            data-testid="input-mapping-end-row"
          />
        </F>
        <F label="Target candidate slug" hint="Candidate only, e.g. adult_attendance.">
          <input
            required
            pattern="^[a-z][a-z0-9_]{1,99}$"
            value={d.target}
            onChange={set("target")}
            className={inputCls}
            data-testid="input-mapping-target"
          />
        </F>
        <F label="Unit">
          <input
            required
            maxLength={80}
            value={d.unit}
            onChange={set("unit")}
            placeholder="people"
            className={inputCls}
            data-testid="input-mapping-unit"
          />
        </F>
        <F label="Ministry label">
          <input
            required
            maxLength={100}
            value={d.ministry}
            onChange={set("ministry")}
            className={inputCls}
            data-testid="input-mapping-ministry"
          />
        </F>
        <F label="Priority label">
          <input
            required
            maxLength={100}
            value={d.priority}
            onChange={set("priority")}
            className={inputCls}
            data-testid="input-mapping-priority"
          />
        </F>
        <F label="Confidence">
          <select
            required
            value={d.confidence}
            onChange={set("confidence")}
            className={inputCls}
            data-testid="select-mapping-confidence"
          >
            <option value="" disabled>
              Select
            </option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </F>
        <F label="Legacy label">
          <input
            required
            maxLength={300}
            value={d.legacyLabel}
            onChange={set("legacyLabel")}
            className={inputCls}
            data-testid="input-mapping-legacy-label"
          />
        </F>
        <F label="Supersedes (optional)">
          <select
            value={d.supersedes}
            onChange={set("supersedes")}
            className={inputCls}
            data-testid="select-mapping-supersedes"
          >
            <option value="">None</option>
            {detail.mappings
              .filter((m) => m.status !== "superseded")
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.definition.target} · {m.definition.sheet} {m.definition.valueColumn} ·{" "}
                  {m.status}
                </option>
              ))}
          </select>
        </F>
      </div>
      <F label="Semantics" hint="What the value means, in plain words (5 characters minimum).">
        <textarea
          required
          minLength={5}
          maxLength={1000}
          rows={2}
          value={d.semantics}
          onChange={set("semantics")}
          className={`${inputCls} h-auto py-2`}
          data-testid="input-mapping-semantics"
        />
      </F>
      {rangeError && (
        <p role="alert" className="text-[12px] text-destructive">
          {rangeError}
        </p>
      )}
      <FormError error={create.error} />
      <SubmitButton pending={create.isPending}>Save draft</SubmitButton>
    </form>
  );
}
