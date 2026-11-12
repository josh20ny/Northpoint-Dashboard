import { ChevronDown } from "lucide-react";
import type { ReactNode, Ref } from "react";

export function CollapsibleSection({
  title,
  description,
  children,
  testId,
  open,
  onOpenChange,
  detailsRef,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  testId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  detailsRef?: Ref<HTMLDetailsElement>;
}) {
  return (
    <details
      ref={detailsRef}
      open={open}
      onToggle={(event) => {
        if (open !== undefined) onOpenChange?.(event.currentTarget.open);
      }}
      data-testid={testId}
      className="group overflow-hidden rounded-xl border bg-card"
    >
      <summary
        data-testid={testId ? `${testId}-toggle` : undefined}
        className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        <span className="min-w-0">
          <span className="block text-[13.5px] font-medium">{title}</span>
          {description && (
            <span className="mt-0.5 block text-[12px] text-muted-foreground">{description}</span>
          )}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
  );
}
