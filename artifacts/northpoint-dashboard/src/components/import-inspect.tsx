import { useState } from "react";
import {
  getGetImportCellsQueryKey,
  useGetImportCells,
  type ImportDetail,
} from "@workspace/api-client-react";
import { Table2 } from "lucide-react";
import { Panel, QueryError } from "@/components/kit";
import { EmptyRecord, SectionHeading } from "@/components/admin-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Flags, IMPORT_QUERY, Nullable, Note, Pager } from "@/components/import-common";
import { cn } from "@/lib/utils";

export function ImportInspect({ detail, disabled }: { detail: ImportDetail; disabled: boolean }) {
  const [sheet, setSheet] = useState(detail.sheets[0]?.name ?? "");
  const [page, setPage] = useState(1);
  const params = { sheet, page };
  const id = detail.batch.id;
  const q = useGetImportCells(id, params, {
    query: {
      ...IMPORT_QUERY,
      enabled: !!sheet && !disabled,
      queryKey: getGetImportCellsQueryKey(id, params),
    },
  });
  const current = detail.sheets.find((s) => s.name === sheet);

  return (
    <Panel className="p-5 sm:p-6">
      <SectionHeading
        icon={Table2}
        title="Workbook inspection"
        detail={`Date system ${detail.dateSystem}. Columns and headers can guide manual selection only.`}
      />
      {detail.sheets.length === 0 ? (
        <EmptyRecord>No sheets were found in this workbook.</EmptyRecord>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Sheets">
            {detail.sheets.map((s) => (
              <button
                key={s.name}
                type="button"
                role="tab"
                aria-selected={s.name === sheet}
                onClick={() => {
                  setSheet(s.name);
                  setPage(1);
                }}
                data-testid={`tab-sheet-${s.name}`}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[12px]",
                  s.name === sheet
                    ? "border-primary bg-primary/10 font-semibold"
                    : "bg-card hover:bg-secondary",
                )}
              >
                {s.name}
                {s.state !== "visible" && (
                  <span className="ml-1 text-muted-foreground">({s.state})</span>
                )}
              </button>
            ))}
          </div>
          {current && (
            <dl className="mb-4 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-5">
              {[
                ["Populated cells", current.cellCount],
                ["Max row", current.maxRow],
                ["Formulas", current.formulas],
                ["External formulas", current.externalFormulas],
                ["Errors", current.errors],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md border bg-muted/30 px-2.5 py-1.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono font-medium">{v}</dd>
                </div>
              ))}
              <div className="col-span-2 rounded-md border bg-muted/30 px-2.5 py-1.5 sm:col-span-5">
                <dt className="text-muted-foreground">Merged ranges</dt>
                <dd className="font-mono">
                  {current.merges.length ? current.merges.join(", ") : "None"}
                </dd>
              </div>
            </dl>
          )}
          {disabled ? (
            <Note tone="warn">Batch is withdrawn. Restore it to inspect cells.</Note>
          ) : q.isError && !q.data ? (
            <QueryError
              title="Cells unavailable"
              error={q.error}
              onRetry={() => void q.refetch()}
            />
          ) : !q.data ? (
            <Skeleton className="h-48 w-full" />
          ) : q.data.cells.length === 0 ? (
            <EmptyRecord>No cells on this page.</EmptyRecord>
          ) : (
            <>
              {q.isRefetchError && (
                <Note tone="warn">Refresh failed. Showing last loaded cells.</Note>
              )}
              <div className="max-h-[420px] overflow-auto rounded-md border">
                <table className="w-full min-w-[640px] text-[12px]">
                  <caption className="sr-only">Cells in {sheet}</caption>
                  <thead className="sticky top-0 bg-muted text-left">
                    <tr>
                      {["Cell", "Type", "Value", "Formula", "Cached", "Style", "Flags"].map((h) => (
                        <th key={h} scope="col" className="px-2 py-1.5 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono text-[11.5px]">
                    {q.data.cells.map((c) => (
                      <tr key={c.coordinate}>
                        <td className="px-2 py-1">{c.coordinate}</td>
                        <td className="px-2 py-1">{c.type}</td>
                        <td className="max-w-[220px] truncate px-2 py-1" title={c.value ?? ""}>
                          <Nullable value={c.value} />
                        </td>
                        <td className="max-w-[200px] truncate px-2 py-1" title={c.formula ?? ""}>
                          {c.formula ?? ""}
                        </td>
                        <td className="px-2 py-1">{c.cachedValue ?? ""}</td>
                        <td className="px-2 py-1">{c.style ?? ""}</td>
                        <td className="px-2 py-1">
                          <Flags flags={c.flags} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={q.data.page}
                hasMore={q.data.hasMore}
                busy={q.isFetching}
                onPage={setPage}
                label="Cells"
              />
            </>
          )}
        </>
      )}
    </Panel>
  );
}
