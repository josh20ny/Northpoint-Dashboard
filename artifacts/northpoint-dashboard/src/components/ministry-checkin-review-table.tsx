import * as React from "react";
import type { CheckInReviewItem } from "@workspace/api-client-react";

type ReviewItem = CheckInReviewItem;
const MINISTRY_LABELS: Record<string, string> = {
  "waumba-land": "Waumba Land",
  upstreet: "UpStreet",
  transit: "Transit",
  insideout: "InsideOut",
};

const ISSUE_LABEL: Record<string, string> = {
  missing_person_profile: "No linked person profile",
  missing_service_period: "Missing service period",
  missing_service_date: "No usable service date",
  unknown_checkin_kind: "Unrecognized check-in type",
  possible_duplicate_checkin: "Possible repeat for the same profile and service",
};

export function CheckInReviewTable({
  items,
  pending,
  onResolve,
}: {
  items: ReviewItem[];
  pending: boolean;
  onResolve: (checkInId: string, action: "include" | "exclude") => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[920px] text-left text-[12px]" aria-label="Unresolved Check-Ins">
        <thead className="bg-muted/40">
          <tr>
            {["Child", "Service date", "Ministry", "Location", "Issue", "Decision", "Resolution"].map((title) => (
              <th key={title} scope="col" className="px-3 py-2 font-medium">{title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.checkInId} className="border-t align-top" data-testid={`row-checkin-review-${item.checkInId}`}>
              <td className="px-3 py-2 font-medium">{item.childName ?? "Name unavailable"}</td>
              <td className="px-3 py-2">{item.serviceDate ?? "Unknown"}</td>
              <td className="px-3 py-2">
                {item.ministry ? (MINISTRY_LABELS[item.ministry] ?? item.ministry) : "Not classified"}
                {item.ministryBasis === "grade" && (
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    Assumed from grade{item.gradeLabel ? `: ${item.gradeLabel}` : ""}
                  </span>
                )}
                {item.ministryBasis === "ambiguous" && (
                  <span className="mt-1 block text-[10px] text-muted-foreground">Needs review</span>
                )}
              </td>
              <td className="px-3 py-2">
                {item.locationNames.length ? item.locationNames.join(", ") : "No linked location"}
                {item.eventName && <span className="mt-1 block text-[10px] text-muted-foreground">{item.eventName}</span>}
              </td>
              <td className="px-3 py-2">
                <ul className="space-y-1">
                  {item.issueReasons.map((reason) => (
                    <li key={reason}>{ISSUE_LABEL[reason] ?? "Needs review"}</li>
                  ))}
                </ul>
              </td>
              <td className="px-3 py-2">
                {item.resolution === "include"
                  ? "Included"
                  : item.resolution === "exclude"
                    ? "Excluded"
                    : "Unresolved"}
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onResolve(item.checkInId, "include")}
                    disabled={pending || !item.canInclude}
                    title={item.canInclude ? "Include this source record in the next publication" : "A usable service date and source are required to include this record"}
                    className="h-7 rounded-md border px-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`button-include-checkin-${item.checkInId}`}
                  >
                    Include
                  </button>
                  <button
                    type="button"
                    onClick={() => onResolve(item.checkInId, "exclude")}
                    disabled={pending}
                    title="Exclude this source record from the next publication"
                    className="h-7 rounded-md border px-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`button-exclude-checkin-${item.checkInId}`}
                  >
                    Exclude
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
