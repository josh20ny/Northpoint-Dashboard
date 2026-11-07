import { useState, type FormEvent } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useImportProvidedWorkbook,
  useUploadWorkbook,
  type ImportList,
} from "@workspace/api-client-react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Panel, StatusPill, formatDate } from "@/components/kit";
import { EmptyRecord, FormError, SectionHeading } from "@/components/admin-controls";
import {
  btn,
  btnPrimary,
  csrfRequest,
  inputCls,
  Note,
  useInvalidateImports,
} from "@/components/import-common";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;

export function ImportBatches({
  list,
  selectedId,
  onSelect,
}: {
  list: ImportList;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { csrfToken } = useAuth();
  const invalidate = useInvalidateImports();
  const upload = useUploadWorkbook(csrfRequest(csrfToken));
  const provided = useImportProvidedWorkbook(csrfRequest(csrfToken));
  const [snapshotDate, setSnapshotDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const ready = list.storageReady;

  const pickFile = (f: File | null) => {
    setFileError("");
    setFile(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx"))
      return setFileError("Only .xlsx workbooks are accepted.");
    if (f.size > MAX_BYTES) return setFileError("Workbook exceeds the 10 MB limit.");
    if (f.name.length > 180) return setFileError("Filename must be 180 characters or fewer.");
    setFile(f);
  };

  const submitUpload = (e: FormEvent) => {
    e.preventDefault();
    if (!file || !snapshotDate || !ready) return;
    upload.mutate(
      { data: file, params: { filename: file.name, snapshotDate } },
      {
        onSuccess: (batch) => {
          setFile(null);
          void invalidate();
          onSelect(batch.id);
        },
        onError: () => void invalidate(),
      },
    );
  };
  const submitProvided = () => {
    if (!snapshotDate || !ready) return;
    provided.mutate(
      { data: { snapshotDate } },
      {
        onSuccess: (batch) => {
          void invalidate();
          onSelect(batch.id);
        },
        onError: () => void invalidate(),
      },
    );
  };

  return (
    <Panel className="p-5 sm:p-6">
      <SectionHeading
        icon={FileSpreadsheet}
        title="Import batches"
        detail="Each workbook is stored unchanged. Nothing here is treated as authoritative."
      />
      {!ready && (
        <div className="mb-4">
          <Note tone="warn">
            Workbook storage is not ready. Import is disabled until storage is configured.
          </Note>
        </div>
      )}
      <form
        onSubmit={submitUpload}
        className="grid gap-3 sm:grid-cols-[180px_1fr_auto_auto] sm:items-end"
      >
        <label className="block text-[12px] font-medium">
          Snapshot date
          <input
            type="date"
            required
            value={snapshotDate}
            onChange={(e) => setSnapshotDate(e.target.value)}
            className={cn(inputCls, "mt-1")}
            data-testid="input-snapshot-date"
          />
        </label>
        <label className="block text-[12px] font-medium">
          Workbook (.xlsx, 10 MB max)
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={!ready}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-[12px] file:mr-3 file:h-9 file:rounded-md file:border file:bg-card file:px-3 file:text-[12px]"
            data-testid="input-workbook-file"
          />
        </label>
        <button
          type="submit"
          className={cn(btnPrimary, "h-9")}
          disabled={!ready || !file || !snapshotDate || upload.isPending}
          data-testid="button-upload-workbook"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          {upload.isPending ? "Uploading" : "Upload"}
        </button>
        <button
          type="button"
          className={cn(btn, "h-9")}
          disabled={!ready || !snapshotDate || provided.isPending}
          onClick={submitProvided}
          data-testid="button-import-provided"
        >
          {provided.isPending ? "Importing" : "Import provided workbook"}
        </button>
      </form>
      <div className="mt-3 space-y-2">
        {fileError && (
          <p role="alert" className="text-[12px] text-destructive">
            {fileError}
          </p>
        )}
        <FormError error={upload.error} />
        <FormError error={provided.error} />
      </div>

      {list.batches.length === 0 ? (
        <EmptyRecord>No workbooks imported yet.</EmptyRecord>
      ) : (
        <ul className="mt-4 divide-y border-t" aria-label="Import batches">
          {list.batches.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onSelect(b.id)}
                aria-current={selectedId === b.id ? "true" : undefined}
                data-testid={`button-select-batch-${b.id}`}
                className={cn(
                  "flex w-full flex-wrap items-center justify-between gap-2 px-2 py-2.5 text-left hover:bg-secondary/60",
                  selectedId === b.id && "bg-accent/40",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{b.filename}</span>
                  <span className="block font-mono text-[10.5px] text-muted-foreground">
                    Snapshot {b.snapshotDate} · {b.sha256.slice(0, 12)} ·{" "}
                    {formatDate(b.createdAt, true)}
                  </span>
                </span>
                <StatusPill
                  status={b.state === "active" ? "current" : "off"}
                  label={b.state === "active" ? "Active" : "Withdrawn"}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
